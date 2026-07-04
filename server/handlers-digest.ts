import { getAllowedEmails } from "./auth";
import { buildDigestWeek } from "./digest-week";
import { sendDigestEmail } from "./email";
import { signedAudioLinks, buildWeeklyZip } from "./digest-zip";
import { getOrCreateUserThread } from "./db";
import { readRuntimeEnv } from "./runtime-env";
import { readJsonFromGcs, writeJsonToGcs } from "./storage";
import { userDigestStateObject } from "./user-key";

type DigestState = {
  lastWeekKey: string;
  sentAt: string;
  answerCount: number;
};

async function readDigestState(userEmail: string): Promise<DigestState | null> {
  return readJsonFromGcs<DigestState>(userDigestStateObject(userEmail));
}

async function writeDigestState(userEmail: string, state: DigestState) {
  await writeJsonToGcs(userDigestStateObject(userEmail), state);
}

export type UserDigestResult =
  | { email: string; skipped: true; reason: string }
  | { email: string; skipped: false; weekKey: string; answerCount: number; subject: string };

export type DigestRunResult =
  | { ok: true; results: UserDigestResult[] }
  | { ok: false; error: string };

async function runDigestForUser(
  userEmail: string,
  options: { force?: boolean; reference?: Date }
): Promise<UserDigestResult> {
  const reference = options.reference ?? new Date();
  const state = await getOrCreateUserThread(userEmail);
  const week = await buildDigestWeek(userEmail, state.nodes, reference);

  if (week.answers.length === 0) {
    return { email: userEmail, skipped: true, reason: "No answers recorded this week." };
  }

  if (!options.force) {
    const previous = await readDigestState(userEmail);
    if (previous?.lastWeekKey === week.weekKey && previous.answerCount === week.answers.length) {
      return { email: userEmail, skipped: true, reason: `Digest already sent for week ${week.weekKey}.` };
    }
  }

  const audioLinks = await signedAudioLinks(week.answers);
  const zip = await buildWeeklyZip(userEmail, week.weekKey, week.answers);
  const mail = await sendDigestEmail(userEmail, week, audioLinks, zip.url);

  await writeDigestState(userEmail, {
    lastWeekKey: week.weekKey,
    sentAt: new Date().toISOString(),
    answerCount: week.answers.length
  });

  return {
    email: userEmail,
    skipped: false,
    weekKey: week.weekKey,
    answerCount: week.answers.length,
    subject: mail.subject
  };
}

export async function runWeeklyDigest(options: { force?: boolean; reference?: Date } = {}): Promise<DigestRunResult> {
  try {
    if (!readRuntimeEnv("SENDGRID_API_KEY")) {
      return { ok: false, error: "SENDGRID_API_KEY is not configured." };
    }
    if (!readRuntimeEnv("DIGEST_FROM_EMAIL")) {
      return { ok: false, error: "DIGEST_FROM_EMAIL is not configured." };
    }

    const recipients = getAllowedEmails();
    if (recipients.length === 0) {
      return { ok: false, error: "ALLOWED_EMAILS is empty — no digest recipients." };
    }

    const results: UserDigestResult[] = [];
    for (const email of recipients) {
      results.push(await runDigestForUser(email, options));
    }

    return { ok: true, results };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weekly digest failed.";
    console.error("Weekly digest error:", error);
    return { ok: false, error: message };
  }
}

export function verifyDigestSecret(req: Request) {
  const secret = readRuntimeEnv("DIGEST_SECRET");
  if (!secret) {
    return false;
  }
  const header = req.headers.get("x-digest-secret");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return header === secret || bearer === secret;
}
