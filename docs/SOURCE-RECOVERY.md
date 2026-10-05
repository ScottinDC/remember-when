# Source recovery — October 4, 2026

The source of truth for the recovered frontend is `chic-sherbet-39bee5.netlify.app`, Netlify site `02d2c622-3a93-42d5-b4dc-6101f8a00704`, published deploy `6aac0b09ddfcb5b58599dcde` (September 17, 2026). It has no attached source repository or commit.

The starting source was the existing `supabase-native-spa` branch, commit `ccd5e1c6180cd8b292fc5e5994419f94a90dabc5`. The published JavaScript (`index-DpSMW92c.js`), stylesheet (`index-BJH-pMCR.css`), HTML and public icons were compared and used to recover missing interface behavior. Interview/profile navigation, save progress, microphone waveform, question replacement, and re-recording were reconstructed as editable TypeScript components. This is a source reconstruction, not a byte-for-byte recovery of the original development tree.

The four deployed Edge Functions were downloaded through the authenticated Supabase dashboard. `process-answer`, `delete-answer`, and `claim-access` retain the recovered implementation. `send-weekly-digest` was subsequently changed at the owner's request from Resend to SendGrid v3, with a new server-only reservation migration.

The Question Progression chart was rebuilt from the owner's Claude Design screenshot: shared origin, five branch colors, center labels, serif heading and pale chart background. Follow-up ribbons use actual parent IDs and conserve flow widths. Width indicates descendant terminal-question count, not recording duration. The origin is a visual grouping, not a stored question. The chart supports keyboard selection and a text connection list.

Local pre-recovery work was preserved in a Git stash named `Remember When pre-Supabase reconciliation 2026-10-04` and in ignored `local/recovery/pre-supabase-2026-10-04.tar.gz`. Downloaded bundles and other recovery scratch files remain ignored under `local/recovery/`.

## Verified and unresolved

- Local TypeScript/Vite build, nine graph/SendGrid/reservation regression tests, and Deno type-check of the email function pass.
- Synthetic browser preview confirms initial/follow-up ribbons, selection, interview and profile views. At 390px, the page width stays 390px and the 640px chart scrolls inside its 314px panel.
- Original frontend source maps, commit history for the manual deployment, and the full database schema/RLS/cron baseline were not available in the source branch.
- Existing Supabase project was inspected without changing production data, accounts, secrets, schedules or deployments.
- Real recording/transcription and SendGrid delivery have not been exercised by this recovery. No emails were sent.
- Current production still runs the manually published frontend and the recovered Resend digest until a separate release is performed.
