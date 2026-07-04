import sgMail from "@sendgrid/mail";
import type { DigestAnswer, DigestWeek } from "./digest-week";
import { readRuntimeEnv } from "./runtime-env";

function requireEnv(name: "SENDGRID_API_KEY" | "DIGEST_FROM_EMAIL") {
  const value = readRuntimeEnv(name)?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAnsweredAt(iso: string) {
  const zone = readRuntimeEnv("DIGEST_TIMEZONE") ?? "America/Los_Angeles";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function buildHtml(week: DigestWeek, audioLinks: Map<string, string>, zipUrl: string) {
  const fromName = readRuntimeEnv("DIGEST_FROM_NAME") ?? "Remember When";
  const items = week.answers
    .map((answer) => renderAnswer(answer, audioLinks.get(answer.questionId) ?? "#"))
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f3ee;font-family:Georgia,'Times New Roman',serif;color:#1f1a17;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f3ee;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffdf9;border:1px solid #e6ddd2;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#7a6f66;">${escapeHtml(fromName)}</p>
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;font-weight:500;">This week&apos;s stories</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#4f4640;">Week of ${escapeHtml(week.label)} — ${week.answers.length} answer${week.answers.length === 1 ? "" : "s"} recorded.</p>
                <p style="margin:0 0 28px;">
                  <a href="${zipUrl}" style="display:inline-block;background:#1f1a17;color:#fffdf9;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:600;">Download all recordings (.zip)</a>
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${items}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderAnswer(answer: DigestAnswer, audioUrl: string) {
  const transcript = answer.transcript?.trim();
  return `<tr>
    <td style="padding:20px 0;border-top:1px solid #ece4da;">
      <p style="margin:0 0 6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#7a6f66;">${escapeHtml(answer.branchLabel)} · ${formatAnsweredAt(answer.answeredAt)}</p>
      <p style="margin:0 0 12px;font-size:18px;line-height:1.45;color:#1f1a17;">${escapeHtml(answer.question)}</p>
      ${
        transcript
          ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#5f564f;font-style:italic;">${escapeHtml(transcript.slice(0, 280))}${transcript.length > 280 ? "…" : ""}</p>`
          : ""
      }
      <a href="${audioUrl}" style="font-size:14px;color:#1f1a17;font-weight:600;text-decoration:underline;">Download recording</a>
    </td>
  </tr>`;
}

function buildText(week: DigestWeek, audioLinks: Map<string, string>, zipUrl: string) {
  const lines = [
    `Remember When — week of ${week.label}`,
    "",
    `Download all recordings: ${zipUrl}`,
    ""
  ];

  for (const answer of week.answers) {
    lines.push(`${answer.branchLabel} — ${formatAnsweredAt(answer.answeredAt)}`);
    lines.push(answer.question);
    if (answer.transcript?.trim()) {
      lines.push(answer.transcript.trim());
    }
    lines.push(`Download: ${audioLinks.get(answer.questionId) ?? ""}`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function sendDigestEmail(
  recipientEmail: string,
  week: DigestWeek,
  audioLinks: Map<string, string>,
  zipUrl: string
) {
  const apiKey = requireEnv("SENDGRID_API_KEY");
  const fromEmail = requireEnv("DIGEST_FROM_EMAIL");
  const fromName = readRuntimeEnv("DIGEST_FROM_NAME") ?? "Remember When";
  const to = recipientEmail.trim();

  sgMail.setApiKey(apiKey);

  const subject = `Remember When — week of ${week.label} (${week.answers.length} recording${week.answers.length === 1 ? "" : "s"})`;

  await sgMail.send({
    to,
    from: { email: fromEmail, name: fromName },
    subject,
    text: buildText(week, audioLinks, zipUrl),
    html: buildHtml(week, audioLinks, zipUrl)
  });

  return { subject, recipients: [to] };
}
