# Weekly digests with SendGrid v3

The recovered production function used Resend. The updated source uses `POST https://api.sendgrid.com/v3/mail/send` with a server-side `SENDGRID_API_KEY`; no additional Node SDK is required in the Deno Edge Function.

Set the following Supabase function secrets through the dashboard:

- `SENDGRID_API_KEY`: an active key with Mail Send permission.
- `DIGEST_FROM_EMAIL`: a sender verified in that SendGrid account (or covered by its authenticated domain).
- `DIGEST_FROM_NAME`: defaults to Remember When.
- `DIGEST_TIMEZONE`: defaults to America/Los_Angeles.
- `DIGEST_SCHEDULE_SECRET`: existing private scheduler authorization secret.

The dashboard already listed these names during recovery. Values, sender verification, account delivery permissions and cron execution were not verified. Keep existing credentials until their ownership and validity are confirmed; do not paste secrets in GitHub or chat.

Each request has one recipient, plain text and HTML content, a digest correlation key, and disabled click/open tracking. Private audio links expire after seven days. A `202` response means queued/accepted, not delivered. The optional `X-Message-Id` is recorded; no JSON success body is expected.

## Duplicate prevention and failures

Apply `20261005010000_digest_deliveries.sql` before deploying. The unique digest key reserves one attempt atomically before sending. Concurrent calls, repeated cron runs and `force` cannot send the identical digest twice. Existing successful `digest_state` checks remain in place across the provider migration.

A failed or interrupted attempt keeps its reservation. There is deliberately no automatic retry or expiry, because a network failure can occur after SendGrid accepts the message. Inspect the reservation and SendGrid Email Activity using its correlation/message ID before deciding whether an operator should release a reservation and retry. An accepted request followed by a database-write failure also remains blocked from automatic resend. This prioritizes avoiding duplicates and may require manual recovery of an unsent digest.

The recovered time window is Monday at midnight in the configured time zone through the supplied/current reference time. This update preserves that behavior. Confirm that this matches the desired schedule before enabling email; it is not a rolling seven-day window. `force` bypasses legacy digest-state filtering but never the reservation guard.

## Validation

`npm run test:unit` tests the v3 payload, acceptance without a response body/message ID, rejection statuses, and transport failures using a mocked transport. No network email is sent by tests.

After migration and deployment, choose a recipient and approve the exact subject/content before sending a real test. Verify Email Activity or a signed Event Webhook for actual delivery; a function success response only proves provider acceptance. The current code has no delivery webhook receiver.

[SendGrid v3 Mail Send reference](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)
