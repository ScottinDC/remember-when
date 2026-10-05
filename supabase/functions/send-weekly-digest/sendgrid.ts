export type DigestMessage = {
  recipient: string;
  subject: string;
  text: string;
  html: string;
};

/** A 202 means accepted into SendGrid's queue, not delivered. Never retry here. */
export async function sendEmail(
  message: DigestMessage,
  apiKey: string,
  fromEmail: string,
  fromName: string,
  digestKey: string,
  request: typeof fetch = fetch,
): Promise<string | null> {
  const response = await request("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.recipient }] }],
      from: { email: fromEmail, name: fromName },
      subject: message.subject,
      content: [
        { type: "text/plain", value: message.text },
        { type: "text/html", value: message.html },
      ],
      categories: ["weekly_digest"],
      custom_args: { digest_key: digestKey },
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
      },
    }),
  });
  if (response.status !== 202) {
    // Provider bodies can contain private recipient/content details. Keep them out of logs.
    throw new Error(
      `SendGrid did not accept the digest (${response.status}). Review the reserved delivery before retrying.`,
    );
  }
  // Accepted responses normally have no JSON body. A missing header is not a failed send.
  return response.headers.get("x-message-id");
}
