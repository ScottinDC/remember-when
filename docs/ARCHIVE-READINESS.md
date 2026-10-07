# Recording and family archive release

## Implemented in this branch

The personal interview offers recording, a searchable library, playback/download, earlier versions, reversible archive/restore, and transcription/follow-up retry, question pass/regeneration, and story options/downloads. See `NARRATIVE-OPTIONS.md` for the source-based scope and next-stage plan. Stopped drafts are retained on the same device in IndexedDB and recover when that question is opened. Navigation/sign-out is disabled while recording or holding an unsaved draft. Active microphone capture is not crash-proof: a browser/device failure before stopping can still lose that capture. Recordings are limited to five minutes and 25 MB.

An upload is registered as a durable recording before AI starts. A leased processing job preserves partial transcripts, prevents simultaneous duplicate workers, and prevents stale completions from replacing newer recordings. A failed AI request does not delete the audio. Limits are five attempts per saved job and fifty AI attempts per owner per day. Question generation uses the current answer and bounded interview history, with a prompt against invented details and duplicate-question validation. The initial five questions are curated; follow-ups use OpenAI. Automated tests use mocked providers, not real AI calls.

The administrator archive lists members, questions, transcripts, processing states and recording history across the family, with owner filtering, pagination, JSON metadata export, playback/download, retry, and member approval/revocation. It requires an active database admin role plus AAL2 two-step verification. Administrator promotion is deliberately absent from the web UI. JSON exports do not contain audio bytes; download audio separately. Access and processing actions are recorded in a private audit table.

Storage stays private. Direct authenticated playback signing and Storage deletion are blocked by additional restrictive policies. The playback function checks current membership, ownership or administrator AAL2, and validates the object's owner/thread/question path before issuing a five-minute link. Permanent deletion runs through an owner-authorized Edge Function with an explicit confirmation flag and resumable database lock; it never accepts caller-supplied storage paths. A newly revoked account cannot obtain new links. Already issued links remain usable until expiry; audio already downloaded cannot be recalled. Existing public/anonymous policies and bucket configuration must be rechecked during release.

## Verification and remaining boundaries

The tests execute all four migration files in isolated PostgreSQL (PGlite) with representative existing tables and ownership policies. They check active membership, initialization rollback, cross-owner access, null owners, forged audio paths, admin MFA, processing leases, partial transcripts, history and reversible archive behavior. This does not reproduce every production trigger, Storage gateway behavior or real concurrent connection. Live schema types and role/status constraints were inspected for compatibility; the full baseline was subsequently exported privately and rehearsed as described in `SUPABASE.md`.

The frontend compiles with TypeScript/Vite; Edge Functions are checked with Deno. Synthetic browser previews cover the interview, library, story choices and administrator layouts. A downloaded Word file was checked as a valid OOXML package, including selection order and missing-transcript markers. The browser also exported two synthetic WAV clips through the actual decoder/worker pipeline; ffprobe verified a 2.0375-second, 44.1 kHz mono MP3. Real recordings and device codec support still require release checks. They do not prove real Google OAuth, authenticator enrollment, microphone recording on the intended device, provider credentials, AI output quality or email delivery.

The Tailwind 3 build chain was upgraded to Tailwind 4 with its Vite plugin. The October 5 npm audit reports zero known dependency advisories. This is not a comprehensive penetration test or proof that the application has no vulnerabilities.

The browser suite now runs the real app against isolated synthetic backend responses. It checks member/admin separation, rejected membership, microphone denial, stopped-draft recovery, upload retry, audio preservation after AI failure, question pass/regeneration and the AAL1 administration gate. The authenticator regression test uses the installed Supabase SDK to turn a raw SVG response into its image URI and confirms that the browser actually decodes the image. It also covers manual setup, cleanup of this app's unfinished enrollments, and rejection of an invalid code. These mocks do not prove live account isolation or actual authenticator enrollment. OAuth callback tokens are removed from the address bar synchronously before session restoration; unit tests cover complete and partial callback fragments.

October 5 follow-up: all 21 Playwright checks passed across desktop Chromium, mobile Chromium and iPhone-style WebKit; all 39 unit/database checks passed and the production build succeeded. WebKit testing exposed Blob draft persistence failures. Drafts now store bytes plus MIME type, read older Blob drafts, and wait for the storage transaction before releasing the recording guard. The two focused WebKit recording/refresh runs also passed. The administration heading and navigation now say “Administration.” The MFA image uses the SDK-provided URI directly, with Google Authenticator instructions and a manual-key option for same-phone setup. The administrator subsequently completed enrollment; the live Administration page loaded 35 questions with no MFA prompt and enabled export controls. This confirms that account’s access, not other users’ device readiness.

## Release gates

The coordinated database, five-function and frontend release was completed October 5, 2026; see the live evidence and remaining user checks in `SUPABASE.md`. Google login, the MFA gate and existing private-audio playback were verified on production. Future releases should follow that document in order. Keep the existing project and back up both the database and actual Storage objects. Do not copy account emails or credentials into the public repository. Local code or a passing GitHub/Netlify preview alone does not prove a production release.

Before family use, verify:

- An approved member signs in with Google, creates exactly one initialized interview and records on their actual device.
- A stopped draft survives refresh when reopening its question. Failed uploads leave the draft available.
- A saved recording remains playable if AI is unavailable; retry completes without duplicate follow-up questions. Replacement keeps the previous version.
- Members cannot read another member's rows, audio, processing jobs or admin RPCs. Revocation blocks new API access and signed links.
- The intended administrator completes their own authenticator enrollment, sees the complete paginated archive and can play a member's recording only after AAL2.
- Archive/restore, downloads and pagination work with real data. Backups can be restored and include audio bytes.
- An explicitly approved test email is accepted by SendGrid and independently confirmed delivered. Repeated scheduler calls do not duplicate it.

Only after these checks should the site be described as ready for family recording.

## Maintenance follow-up — October 6, 2026

The isolated browser suite now also checks successful AAL2 archive loading. MFA denial checks target the actual export control and verify that no archive RPC was requested. Production smoke checks use a separate opt-in configuration; ordinary test commands stay local. See the [WebKit investigation](qa/2026-10-05-webkit-drafts.md) for CI platform coverage and the corrected assertions.
