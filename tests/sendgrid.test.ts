import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "../supabase/functions/send-weekly-digest/sendgrid";
const message = {
  recipient: "recipient@example.com",
  subject: "Weekly stories",
  text: "Plain text",
  html: "<p>Stories</p>",
};
test("SendGrid v3 request uses private recipient, text/HTML, no tracking or misleading idempotency header", async () => {
  let called = 0;
  const transport: typeof fetch = async (url, init) => {
    called++;
    assert.equal(url, "https://api.sendgrid.com/v3/mail/send");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer test-key");
    assert.equal(headers.has("Idempotency-Key"), false);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.personalizations, [
      { to: [{ email: message.recipient }] },
    ]);
    assert.deepEqual(
      body.content.map((c: { type: string }) => c.type),
      ["text/plain", "text/html"],
    );
    assert.equal(body.tracking_settings.click_tracking.enable, false);
    assert.deepEqual(body.from, {
      email: "sender@example.com",
      name: "Remember When",
    });
    return new Response(null, {
      status: 202,
      headers: { "x-message-id": "queued-123" },
    });
  };
  assert.equal(
    await sendEmail(
      message,
      "test-key",
      "sender@example.com",
      "Remember When",
      "digest-hash",
      transport,
    ),
    "queued-123",
  );
  assert.equal(called, 1);
});
test("202 without message ID is still accepted; no response body is required", async () => {
  assert.equal(
    await sendEmail(
      message,
      "key",
      "sender@example.com",
      "Name",
      "key",
      async () => new Response(null, { status: 202 }),
    ),
    null,
  );
});
test("non-202 and transport failure never retry or expose provider response bodies", async () => {
  for (const status of [200, 400, 401, 403, 429, 500]) {
    let called = 0;
    await assert.rejects(
      () =>
        sendEmail(
          message,
          "key",
          "sender@example.com",
          "Name",
          "key",
          async () => {
            called++;
            return new Response("private recipient details", { status });
          },
        ),
      new RegExp(`\\(${status}\\)`),
    );
    assert.equal(called, 1);
  }
  let called = 0;
  await assert.rejects(
    () =>
      sendEmail(
        message,
        "key",
        "sender@example.com",
        "Name",
        "key",
        async () => {
          called++;
          throw new Error("timeout");
        },
      ),
    /timeout/,
  );
  assert.equal(called, 1);
});
