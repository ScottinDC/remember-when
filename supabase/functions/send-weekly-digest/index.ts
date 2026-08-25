import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

const AUDIO_BUCKET = "interview-audio";
const AUDIO_LINK_TTL_SECONDS = 60 * 60 * 24 * 7;

type DigestRequest = {
  force?: unknown;
  reference?: unknown;
};

type DigestAnswer = {
  id: string;
  question: string;
  transcript: string | null;
  storage_object_name: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
};

type DigestState = {
  metadata: Record<string, unknown> | null;
};

type Recipient = {
  email: string;
  user_id: string | null;
};

type Thread = {
  id: string;
  owner_id: string | null;
  owner_email: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseRequest(payload: DigestRequest | null) {
  const force = payload?.force === true;
  const referenceValue = typeof payload?.reference === "string" ? payload.reference : undefined;
  const reference = referenceValue ? DateTime.fromISO(referenceValue, { setZone: true }) : DateTime.now();
  if (!reference.isValid) throw new Error("reference must be an ISO-8601 date/time.");
  return { force, reference };
}

function weekFor(reference: DateTime, zone: string) {
  const end = reference.setZone(zone);
  const start = end.startOf("week");
  if (!start.isValid) throw new Error(`Invalid digest time zone: ${zone}.`);
  return {
    weekKey: start.toISODate() ?? start.toFormat("yyyy-MM-dd"),
    label: `${start.toFormat("MMM d")} – ${end.toFormat("MMM d, yyyy")}`,
    start: start.toUTC().toISO(),
    end: end.toUTC().toISO()
  };
}

function sequenceOrder(answer: DigestAnswer) {
  const value = answer.metadata?.sequenceOrder;
  return typeof value === "number" && Number.isInteger(value) ? value : Number.MAX_SAFE_INTEGER;
}

function answeredAt(value: string, zone: string) {
  return DateTime.fromISO(value, { zone: "utc" }).setZone(zone).toFormat("ccc, LLL d, h:mm a");
}

function buildEmail(
  recipient: string,
  week: { label: string },
  answers: Array<DigestAnswer & { audioUrl: string }>,
  zone: string,
  fromName: string
) {
  const answerCount = answers.length;
  const subject = `Remember When — week of ${week.label} (${answerCount} recording${answerCount === 1 ? "" : "s"})`;
  const items = answers.map((answer) => {
    const transcript = answer.transcript?.trim();
    return `<tr><td style="padding:20px 0;border-top:1px solid #ece4da;">
      <p style="margin:0 0 6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#7a6f66;">${escapeHtml(answeredAt(answer.timestamp, zone))}</p>
      <p style="margin:0 0 12px;font-size:18px;line-height:1.45;color:#1f1a17;">${escapeHtml(answer.question)}</p>
      ${transcript ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#5f564f;font-style:italic;">${escapeHtml(transcript.slice(0, 280))}${transcript.length > 280 ? "…" : ""}</p>` : ""}
      <a href="${escapeHtml(answer.audioUrl)}" style="font-size:14px;color:#1f1a17;font-weight:600;text-decoration:underline;">Play recording</a>
    </td></tr>`;
  }).join("\n");
  const html = `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#f6f3ee;font-family:Georgia,'Times New Roman',serif;color:#1f1a17;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f3ee;padding:32px 16px;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffdf9;border:1px solid #e6ddd2;border-radius:12px;padding:32px;"><tr><td>
        <p style="margin:0 0 8px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6f66;">${escapeHtml(fromName)}</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;font-weight:500;">This week&apos;s stories</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#4f4640;">Week of ${escapeHtml(week.label)} — ${answerCount} answer${answerCount === 1 ? "" : "s"} recorded.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>
      </td></tr></table>
    </td></tr></table></body></html>`;
  const lines = [
    `Remember When — week of ${week.label}`,
    "",
    ...answers.flatMap((answer) => [
      `${answeredAt(answer.timestamp, zone)}`,
      answer.question,
      answer.transcript?.trim() ?? "",
      `Play recording: ${answer.audioUrl}`,
      ""
    ])
  ];
  return { subject, html, text: lines.join("\n"), recipient };
}

async function sendEmail(message: ReturnType<typeof buildEmail>, apiKey: string, fromEmail: string, fromName: string) {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.recipient }] }],
      from: { email: fromEmail, name: fromName },
      subject: message.subject,
      content: [
        { type: "text/plain", value: message.text },
        { type: "text/html", value: message.html }
      ]
    })
  });
  if (!response.ok) throw new Error(`SendGrid rejected the digest (${response.status}).`);
}

async function createAudioLinks(admin: ReturnType<typeof createClient>, answers: DigestAnswer[]) {
  return Promise.all(answers.map(async (answer) => {
    if (!answer.storage_object_name) throw new Error("An answered response has no audio object.");
    const { data, error } = await admin.storage.from(AUDIO_BUCKET).createSignedUrl(answer.storage_object_name, AUDIO_LINK_TTL_SECONDS);
    if (error || !data?.signedUrl) throw new Error("Could not create a private recording link.");
    return { ...answer, audioUrl: data.signedUrl };
  }));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const scheduleSecret = Deno.env.get("DIGEST_SCHEDULE_SECRET")?.trim();
    if (!scheduleSecret) return json({ error: "Digest scheduling is not configured." }, 503);
    if (request.headers.get("x-digest-secret") !== scheduleSecret) return json({ error: "Unauthorized." }, 401);

    const { force, reference } = parseRequest(await request.json().catch(() => null) as DigestRequest | null);
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sendGridKey = requireEnv("SENDGRID_API_KEY");
    const fromEmail = requireEnv("DIGEST_FROM_EMAIL");
    const fromName = Deno.env.get("DIGEST_FROM_NAME")?.trim() || "Remember When";
    const zone = Deno.env.get("DIGEST_TIMEZONE")?.trim() || "America/Los_Angeles";
    const week = weekFor(reference, zone);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: recipients, error: recipientsError } = await admin
      .from("access_grants")
      .select("email, user_id")
      .eq("status", "active");
    if (recipientsError) throw recipientsError;
    const results: Array<Record<string, unknown>> = [];

    for (const recipient of (recipients ?? []) as Recipient[]) {
      if (!recipient.user_id) {
        results.push({ email: recipient.email, skipped: true, reason: "No linked account." });
        continue;
      }
      const { data: threads, error: threadsError } = await admin
        .from("threads")
        .select("id, owner_id, owner_email")
        .eq("owner_id", recipient.user_id);
      if (threadsError) throw threadsError;
      const threadIds = (threads ?? []).map((thread: Thread) => thread.id);
      if (!threadIds.length) {
        results.push({ email: recipient.email, skipped: true, reason: "No interview." });
        continue;
      }
      const { data: answers, error: answersError } = await admin
        .from("responses")
        .select("id, question, transcript, storage_object_name, timestamp, metadata")
        .in("thread_id", threadIds)
        .eq("status", "answered")
        .gte("timestamp", week.start)
        .lt("timestamp", week.end)
        .not("storage_object_name", "is", null)
        .order("timestamp", { ascending: true });
      if (answersError) throw answersError;
      const weeklyAnswers = ((answers ?? []) as DigestAnswer[]).sort((a, b) => sequenceOrder(a) - sequenceOrder(b) || a.timestamp.localeCompare(b.timestamp));
      if (!weeklyAnswers.length) {
        results.push({ email: recipient.email, skipped: true, reason: "No answers recorded this week." });
        continue;
      }
      const { data: previous, error: stateError } = await admin
        .from("digest_state")
        .select("metadata")
        .eq("owner_email", recipient.email)
        .maybeSingle<DigestState>();
      if (stateError) throw stateError;
      const answerIds = weeklyAnswers.map((answer) => answer.id).sort();
      const priorWeek = previous?.metadata?.lastWeekKey;
      const priorIds = previous?.metadata?.answerIds;
      if (!force && priorWeek === week.weekKey && Array.isArray(priorIds) && priorIds.length === answerIds.length && priorIds.every((id, index) => id === answerIds[index])) {
        results.push({ email: recipient.email, skipped: true, reason: "Digest already sent for this week." });
        continue;
      }
      const linkedAnswers = await createAudioLinks(admin, weeklyAnswers);
      const message = buildEmail(recipient.email, week, linkedAnswers, zone, fromName);
      await sendEmail(message, sendGridKey, fromEmail, fromName);
      const now = new Date().toISOString();
      const { error: writeStateError } = await admin.from("digest_state").upsert({
        owner_email: recipient.email,
        owner_id: recipient.user_id,
        last_digest_at: now,
        updated_at: now,
        metadata: { lastWeekKey: week.weekKey, answerIds, answerCount: answerIds.length, sentAt: now }
      }, { onConflict: "owner_email" });
      if (writeStateError) throw writeStateError;
      results.push({ email: recipient.email, skipped: false, weekKey: week.weekKey, answerCount: answerIds.length, subject: message.subject });
    }
    return json({ ok: true, weekKey: week.weekKey, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weekly digest failed.";
    console.error("send-weekly-digest failed:", message);
    return json({ ok: false, error: message }, 500);
  }
});
