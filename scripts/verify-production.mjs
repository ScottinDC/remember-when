#!/usr/bin/env node
/**
 * Lightweight production verification when Playwright cannot run in CI/sandbox.
 * Writes results to e2e-results/verify-production.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.E2E_PRODUCTION_URL ?? "https://stories-remember-when.netlify.app";
const SITE_ID = process.env.NETLIFY_SITE_ID ?? "31a7abc0-7ab9-4440-92de-7ea0bd08df59";
const results = [];

async function check(name, fn) {
  const entry = { name, pass: false, detail: "" };
  try {
    entry.detail = await fn();
    entry.pass = true;
  } catch (error) {
    entry.detail = error instanceof Error ? error.message : String(error);
  }
  results.push(entry);
  console.log(`${entry.pass ? "PASS" : "FAIL"} ${name}: ${entry.detail}`);
}

function makeUnsignedJwt(email) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString("base64url");
  return `${header}.${payload}.`;
}

async function resolveAllowlistedEmail() {
  if (process.env.E2E_TEST_EMAIL) {
    return process.env.E2E_TEST_EMAIL.trim();
  }

  const fromEnv = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) {
    return fromEnv[0];
  }

  const configPath = join(homedir(), "Library/Preferences/netlify/config.json");
  if (!existsSync(configPath)) {
    throw new Error("Set E2E_TEST_EMAIL or ALLOWED_EMAILS, or run `netlify login` so allowlist email can be resolved.");
  }

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const netlifyToken = Object.values(config.users ?? {})[0]?.auth?.token;
  if (!netlifyToken) {
    throw new Error("Netlify CLI token not found in local config.");
  }

  const envRes = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}/env`, {
    headers: { Authorization: `Bearer ${netlifyToken}` }
  });
  if (!envRes.ok) {
    throw new Error(`Netlify env API returned ${envRes.status}`);
  }

  const env = await envRes.json();
  const allowed =
    env
      .find((item) => item.key === "ALLOWED_EMAILS")
      ?.values?.[0]?.value?.split(",")
      .map((email) => email.trim())
      .filter(Boolean) ?? [];

  if (allowed.length === 0) {
    throw new Error("No ALLOWED_EMAILS found in Netlify env.");
  }

  return allowed[0];
}

await check("1. Homepage HTTP 200", async () => {
  const res = await fetch(`${BASE}/`);
  const text = await res.text();
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  if (/Internal Error/i.test(text)) throw new Error("page contains Internal Error");
  return `status ${res.status}, ${text.length} bytes`;
});

await check("2. OAuth capture script in HTML shell", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  if (!html.includes("oauth-capture.js")) {
    throw new Error("missing oauth-capture.js script tag in HTML");
  }
  const scriptRes = await fetch(`${BASE}/oauth-capture.js`);
  const script = await scriptRes.text();
  if (!script.includes("remember-when.auth-token")) {
    throw new Error("missing remember-when.auth-token handler in oauth-capture.js");
  }
  if (!script.includes('params.get("code")')) {
    throw new Error("missing authorization-code OAuth handler in oauth-capture.js");
  }
  if (!html.includes('type="module"')) throw new Error("missing Vite module script");
  return "OAuth pre-bootstrap script present";
});

await check("3. /api/session unauthenticated 401 JSON", async () => {
  const res = await fetch(`${BASE}/api/session`);
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}: ${text.slice(0, 200)}`);
  if (!ct.includes("application/json")) throw new Error(`expected JSON, got ${ct}`);
  return text;
});

await check("4. /api/health", async () => {
  const res = await fetch(`${BASE}/api/health`);
  const body = await res.json();
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  if (!body.ok) throw new Error("ok !== true");
  if (!body.authConfigured) throw new Error("auth not configured");
  if (!body.storageConfigured) throw new Error("storage not configured");
  return JSON.stringify(body);
});

await check("5. /api/interview unauthenticated 401 JSON", async () => {
  const res = await fetch(`${BASE}/api/interview`);
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}: ${text.slice(0, 200)}`);
  if (!ct.includes("application/json")) throw new Error(`expected JSON, got ${ct}`);
  if (/Internal Error/i.test(text)) throw new Error("Internal Error in response");
  return text;
});

await check("6. Authenticated /api/session + /api/interview 200 JSON", async () => {
  const email = await resolveAllowlistedEmail();
  const jwt = makeUnsignedJwt(email);
  const headers = {
    Authorization: `Bearer ${jwt}`,
    Cookie: `nf_jwt=${encodeURIComponent(jwt)}`
  };

  const sessionRes = await fetch(`${BASE}/api/session`, { headers });
  const sessionText = await sessionRes.text();
  if (sessionRes.status !== 200) {
    throw new Error(`session expected 200, got ${sessionRes.status}: ${sessionText.slice(0, 200)}`);
  }

  const start = Date.now();
  const res = await fetch(`${BASE}/api/interview`, { headers });
  const elapsed = Date.now() - start;
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (res.status !== 200) {
    throw new Error(`expected 200, got ${res.status} in ${elapsed}ms: ${text.slice(0, 200)}`);
  }
  if (!ct.includes("application/json")) throw new Error(`expected JSON, got ${ct}`);
  if (/Internal Error/i.test(text)) throw new Error("Internal Error in response");
  const body = JSON.parse(text);
  if (!body.thread?.title) throw new Error("missing thread.title in response");
  if (!Array.isArray(body.nodes) || body.nodes.length < 1) {
    throw new Error("missing interview nodes in response");
  }
  return `session 200, interview 200 in ${elapsed}ms, ${body.nodes.length} nodes for ${email}`;
});

await check("7. Identity settings", async () => {
  const res = await fetch(`${BASE}/.netlify/identity/settings`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  return `status ${res.status}`;
});

await check("8. OAuth authorize redirect", async () => {
  const url = `${BASE}/.netlify/identity/authorize?provider=google&redirect_uri=${encodeURIComponent(BASE + "/")}`;
  const res = await fetch(url, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  if (![301, 302, 303, 307, 308].includes(res.status)) {
    const text = await res.text();
    throw new Error(`status ${res.status}, body: ${text.slice(0, 200)}`);
  }
  if (!/accounts\.google\.com|authorize/i.test(location)) {
    throw new Error(`unexpected redirect: ${location.slice(0, 200)}`);
  }
  return `redirect ${res.status} -> ${location.slice(0, 120)}...`;
});

const outDir = join(process.cwd(), "e2e-results");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "verify-production.json");
writeFileSync(outPath, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
console.log(`\nWrote ${outPath}`);
const failed = results.filter((r) => !r.pass);
process.exit(failed.length ? 1 : 0);
