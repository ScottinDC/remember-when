# Keep the existing Supabase project

Use project `medtlhjhoqrlzycgujcj` in the owner's current Supabase organization. It already holds authentication, recordings and interview data. Do not create an empty replacement or run a database reset as part of this recovery.

Dashboard: https://supabase.com/dashboard/project/medtlhjhoqrlzycgujcj

The dashboard shows GitHub integration with `ScottinDC/remember-when`. This does not make the manually deployed Netlify site Git-connected, and does not prove functions deploy automatically.

## Ownership and recovery

1. Confirm the organization owner, billing contact and recovery access are under your control.
2. Export the current database schema, policies, functions and triggers using the authenticated Supabase CLI/dashboard before applying migrations. Keep a private database backup and a separate backup of Storage objects; a schema export alone contains no recordings.
3. Check backup availability for the current plan in Database → Backups. Do not assume a backup exists from the presence of the menu.
4. Retain the existing Google provider and approved redirect URLs. Add the exact local/review URL when needed; avoid broad production wildcards. The intended live URL is `https://chic-sherbet-39bee5.netlify.app`.
5. Keep `interview-audio` private. Review owner-based policies on `threads`, `responses`, `ledger`, `digest_state`, `access_grants` and Storage. The current recovery is not a complete authorization audit.

## Release order for this update

- Export/reconcile the existing migration history first. The repository does not yet contain a full baseline; do not use it to rebuild the database from scratch.
- Review and apply only `supabase/migrations/20261005010000_digest_deliveries.sql` to the existing project. It creates a new service-role-only reservation table and does not alter existing interview data.
- Confirm the SendGrid secrets and verified sender described in `SENDGRID.md`.
- Deploy the updated `send-weekly-digest` function only after that table exists. Preserve its current gateway/JWT settings; the function additionally requires `x-digest-secret`.
- Inspect the existing cron job before enabling a replacement. Keep one scheduler. Its configured timing was not verified in this recovery.
- Deploy the frontend with the public Supabase build variables, then verify Google sign-in, private playback, a real recording and follow-up generation with an authorized test account.
- Connect the current Netlify project to the canonical repository when ready for Git-based releases. Check build settings and the production branch before merging; another older Netlify project may already follow `main`.

Secrets stay in Supabase Edge Function secrets: `OPENAI_API_KEY`, `SENDGRID_API_KEY`, `DIGEST_FROM_EMAIL`, `DIGEST_FROM_NAME`, `DIGEST_SCHEDULE_SECRET`, `DIGEST_TIMEZONE`. A configured secret name does not prove the credential is valid or its account/sender is ready.

Official references: [CLI schema pull](https://supabase.com/docs/reference/cli/supabase-db-pull), [database backups](https://supabase.com/docs/guides/platform/backups), [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets).
