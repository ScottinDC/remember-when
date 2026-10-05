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

This is a coordinated production release, not a frontend-only deployment. See the full verification checklist in `ARCHIVE-READINESS.md`.

1. Export/reconcile the existing migration history and verify private database and Storage backups. The repository does not contain a full baseline: do not use it to rebuild/reset the database. Test restoration separately.
2. Prepare a short maintenance window and pause the digest scheduler. Inspect its current schedule first; retain one scheduler. Prevent old clients from saving during the backend change.
3. Review and apply all four migrations, in order, transactionally to the existing project: `20261005010000_digest_deliveries.sql`, `20261005020000_archive_readiness.sql`, `20261005030000_story_controls.sql`, then `20261005040000_recording_deletion.sql`. Reconcile already-applied migrations rather than rerunning them. The second adds recording history/jobs/admin RPCs and restrictive policies. Story controls add preferences and owner-scoped question actions; deletion adds an explicit, resumable purge workflow. The migration itself preserves valid existing Supabase audio paths, transcripts and timestamps; no audio files are moved or deleted. Inventory legacy GCS/external paths separately before release.
4. Deploy all five functions: `claim-access`, `process-answer`, `archive-audio`, `delete-answer`, `send-weekly-digest`. Preserve recovered gateway/JWT configuration; `send-weekly-digest` additionally requires the scheduler secret. The new email function depends on the archive and digest migrations.
5. After explicit approval of the intended account, assign its administrator database role through the trusted dashboard. No public signup, editable profile metadata or browser variable can grant this role. Other approved accounts remain members. The administrator must enroll and verify their own authenticator before accessing the family archive.
6. Deploy the new frontend using the existing public Supabase configuration. Verify the smoke checks below before ending maintenance. Do not roll back only the frontend: the old frontend cannot use the new private-playback policy. Prefer a forward fix; retain database changes and audio history during incident handling.
7. Validate SendGrid credentials/sender, then restore the existing scheduler only when ready. Sending a real test email requires a chosen recipient and approved content. Provider acceptance does not prove delivery.
8. Connect the intended Netlify project to the canonical repository for future releases. Another older Netlify project follows `main`, so review both sites' production settings before merging this PR.

Production checks: owner Google login; unapproved account denied; real microphone recording; durable playback despite AI failure; successful transcription/follow-up; retry without duplicate question; replacement history; archive/restore; deletion of a disposable test take and its earlier versions; story choice persistence, passing and regeneration; DOCX/text/MP3 downloads; revoked account denied new links; member denied admin; administrator denied at AAL1 and admitted after AAL2. Test on the family member's actual device. Newly signed playback links last five minutes; previously issued legacy links retain their original expiry (including seven-day email links).

Secrets stay in Supabase Edge Function secrets: `OPENAI_API_KEY`, `SENDGRID_API_KEY`, `DIGEST_FROM_EMAIL`, `DIGEST_FROM_NAME`, `DIGEST_SCHEDULE_SECRET`, `DIGEST_TIMEZONE`. A configured secret name does not prove the credential is valid or its account/sender is ready.

Official references: [CLI schema pull](https://supabase.com/docs/reference/cli/supabase-db-pull), [database backups](https://supabase.com/docs/guides/platform/backups), [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets).
