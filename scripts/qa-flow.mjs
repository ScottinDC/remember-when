#!/usr/bin/env node
/**
 * Remember When — one-command QA flow.
 *
 * Usage:
 *   npm run qa              # build + production smoke + Playwright production
 *   npm run qa -- --local   # also run local Playwright (needs AUTH_DISABLED dev up)
 *   npm run qa -- --skip-e2e
 *   npm run qa -- --skip-build
 *
 * Env:
 *   E2E_PRODUCTION_URL   default https://stories-remember-when.netlify.app
 *   E2E_TEST_EMAIL       allowlisted email for authenticated API checks
 *   DIGEST_SECRET        optional — smoke-tests /api/digest/send (no email send)
 *   QA_SKIP_DIGEST=1     skip digest route smoke
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const skipBuild = args.has("--skip-build");
const skipE2e = args.has("--skip-e2e");
const includeLocal = args.has("--local");
const skipDigest = args.has("--skip-digest") || process.env.QA_SKIP_DIGEST === "1";

const BASE = process.env.E2E_PRODUCTION_URL ?? "https://stories-remember-when.netlify.app";
const SITE_ID = process.env.NETLIFY_SITE_ID ?? "31a7abc0-7ab9-4440-92de-7ea0bd08df59";

/** @type {{ name: string; pass: boolean; detail: string; skipped?: boolean }[]} */
const steps = [];

function log(line) {
  console.log(line);
}

function run(command, commandArgs, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...opts.env },
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function step(name, fn) {
  log(`\n══ ${name} ══`);
  const entry = { name, pass: false, detail: "" };
  try {
    const detail = await fn();
    entry.detail = detail ?? "ok";
    entry.pass = true;
    if (detail === "skipped") {
      entry.skipped = true;
      entry.pass = true;
      entry.detail = "skipped";
    }
  } catch (error) {
    entry.detail = error instanceof Error ? error.message : String(error);
  }
  steps.push(entry);
  log(`${entry.pass ? (entry.skipped ? "SKIP" : "PASS") : "FAIL"} ${name}${entry.detail && entry.detail !== "ok" ? `: ${entry.detail}` : ""}`);
  return entry.pass;
}

async function digestSmoke() {
  if (skipDigest) {
    return "skipped";
  }

  // Wrong secret should hit digest handler → "Invalid digest secret."
  // Old deploys without the route return "Sign in required."
  const res = await fetch(`${BASE}/api/digest/send?force=0`, {
    method: "POST",
    headers: { "x-digest-secret": "__qa-flow-probe__" }
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON digest response (${res.status}): ${text.slice(0, 160)}`);
  }

  if (body.error === "Sign in required.") {
    throw new Error("digest route missing on deploy (got Sign in required)");
  }
  if (body.error === "Invalid digest secret.") {
    return "digest route live (secret rejected as expected)";
  }

  // If DIGEST_SECRET is set and matches somehow (shouldn't), or other response
  if (body.ok === true) {
    return `digest ok with probe secret? unexpected: ${JSON.stringify(body).slice(0, 200)}`;
  }
  return `status ${res.status}: ${JSON.stringify(body).slice(0, 200)}`;
}

async function optionalDigestSend() {
  const secret = process.env.DIGEST_SECRET?.trim();
  if (!secret || skipDigest) {
    return "skipped";
  }
  // Dry check without force — should skip or send based on week data; never use force here.
  const res = await fetch(`${BASE}/api/digest/send`, {
    method: "POST",
    headers: { "x-digest-secret": secret }
  });
  const body = await res.json();
  if (!body.ok && body.error === "Invalid digest secret.") {
    throw new Error("DIGEST_SECRET does not match Netlify env");
  }
  if (!body.ok) {
    throw new Error(body.error ?? JSON.stringify(body));
  }
  const summary = Array.isArray(body.results)
    ? body.results.map((r) => `${r.email}: ${r.skipped ? `skip(${r.reason})` : `sent(${r.answerCount})`}`).join("; ")
    : JSON.stringify(body);
  return summary.slice(0, 400);
}

async function main() {
  log("Remember When QA flow");
  log(`Target: ${BASE}`);
  log(`Site ID: ${SITE_ID}`);
  log(`Flags: ${[skipBuild && "skip-build", skipE2e && "skip-e2e", includeLocal && "local", skipDigest && "skip-digest"].filter(Boolean).join(", ") || "defaults"}`);

  if (!skipBuild) {
    await step("Build (tsc + vite)", async () => {
      const result = await run("npm", ["run", "build"]);
      if (result.code !== 0) {
        throw new Error(`build exited ${result.code}`);
      }
      return "build ok";
    });
  } else {
    await step("Build (tsc + vite)", async () => "skipped");
  }

  await step("Production smoke (verify-production)", async () => {
    const result = await run("node", ["scripts/verify-production.mjs"], {
      env: {
        E2E_PRODUCTION_URL: BASE,
        NETLIFY_SITE_ID: SITE_ID,
        ...(process.env.E2E_TEST_EMAIL ? {} : {}),
        ...(process.env.ALLOWED_EMAILS ? {} : {})
      }
    });
    if (result.code !== 0) {
      throw new Error(`verify-production exited ${result.code}`);
    }
    return "all verify-production checks passed";
  });

  await step("Digest route smoke", digestSmoke);

  await step("Digest send (optional, no force)", optionalDigestSend);

  if (!skipE2e) {
    await step("Playwright production e2e", async () => {
      const result = await run("npx", ["playwright", "test", "--project=production"], {
        env: { E2E_PRODUCTION_URL: BASE }
      });
      if (result.code !== 0) {
        throw new Error(`playwright production exited ${result.code}`);
      }
      return "production e2e passed";
    });

    if (includeLocal) {
      await step("Playwright local e2e", async () => {
        const result = await run("npx", ["playwright", "test", "--project=local"]);
        if (result.code !== 0) {
          throw new Error(`playwright local exited ${result.code}`);
        }
        return "local e2e passed (or skipped if server down)";
      });
    } else {
      await step("Playwright local e2e", async () => "skipped");
    }
  } else {
    await step("Playwright production e2e", async () => "skipped");
    await step("Playwright local e2e", async () => "skipped");
  }

  const outDir = join(process.cwd(), "e2e-results");
  mkdirSync(outDir, { recursive: true });
  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    steps
  };
  const outPath = join(outDir, "qa-flow.json");
  writeFileSync(outPath, JSON.stringify(summary, null, 2));

  const failed = steps.filter((s) => !s.pass);
  const passed = steps.filter((s) => s.pass && !s.skipped).length;
  const skipped = steps.filter((s) => s.skipped).length;

  log("\n════════ QA SUMMARY ════════");
  for (const s of steps) {
    const tag = !s.pass ? "FAIL" : s.skipped ? "SKIP" : "PASS";
    log(`${tag}  ${s.name}`);
  }
  log(`\n${passed} passed, ${skipped} skipped, ${failed.length} failed`);
  log(`Wrote ${outPath}`);

  if (failed.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
