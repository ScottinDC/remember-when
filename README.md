# Remember When

Private family oral-history app: record answers, keep audio in private storage, generate follow-up questions, and explore the question progression.

This repository contains the recovered September 2026 Supabase application, the screenshot-matched Question Progression chart, an updated SendGrid v3 digest implementation, durable recording storage, a personal recording library, an Administration area, narrative choices, and MP3/Word/text story downloads. See [recovery provenance and limits](docs/SOURCE-RECOVERY.md).

## Development

Use Node 22 or later:

```sh
npm ci
cp -n .env.example .env.local
# Fill in the public Supabase URL and publishable/anon key.
npm run dev
```

Open http://127.0.0.1:5173. Keep an existing `.env.local`; the copy command above does not overwrite it. This file is ignored by Git. Never put a service-role, OpenAI, or SendGrid secret in a `VITE_` variable.

```sh
npm run check
```

Runs the regression tests and a TypeScript/Vite production build. During development, `/tests/preview.html` previews the real interview and chart components with synthetic data; it is not included in the production build. Do not record/save in that fixture page.

After dependency or build-plugin changes, stop and restart an already-running Vite server. A process started before the Tailwind 4 upgrade can otherwise keep the retired PostCSS plugin in memory.

### Browser checks

```sh
npx playwright install chromium webkit
npm run test:e2e
```

The default suite starts its own Vite server on port 5174 and uses synthetic users, backend responses, and generated audio. It never needs production credentials or a microphone. `npm run test:e2e:headed` uses the same isolated suite. CI runs Chromium on Linux and WebKit on macOS, matching the platform used for recording validation.

`npm run test:e2e:prod` is an explicit, separate public smoke check against the deployed site. It starts no local server, follows the Google sign-in redirect without completing login, and records no traces or screenshots. Set `E2E_PRODUCTION_URL` to check another deployment.

See [verification boundaries](docs/ARCHIVE-READINESS.md) and the [completed WebKit investigation](docs/qa/2026-10-05-webkit-drafts.md).

## Architecture

- React/TypeScript/Vite frontend, hosted as static files on Netlify.
- Supabase Auth (Google sign-in), Postgres, private `interview-audio` storage.
- Five Supabase Edge Functions: `claim-access`, `process-answer`, `archive-audio`, `delete-answer`, `send-weekly-digest`.
- Audio uploads are registered in Postgres before transcription or question generation. Failed AI work can be retried without re-recording; partial transcripts and recording versions are retained.
- Active members manage their own recordings. Administrator reads and membership changes require a database admin role and an MFA AAL2 session, checked on the server.
- OpenAI transcription/follow-up generation; SendGrid v3 weekly emails in the updated source. Email playback links open the signed-in archive.

## Deployment and operations

Run `npm run build` to produce `dist/`. Netlify builds require `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. These are public client configuration; the key alone is not authorization and database access must remain protected by RLS.

Current site: https://chic-sherbet-39bee5.netlify.app

Canonical repository: https://github.com/ScottinDC/remember-when

The current Netlify site was manually deployed and is not connected to Git. Connecting it is a separate production action. Supabase functions also require separate deployment; a frontend build does not deploy them.

Read [Supabase ownership, backups and release steps](docs/SUPABASE.md) and [SendGrid setup and verification](docs/SENDGRID.md) before a production release. See [narrative options and next-stage features](docs/NARRATIVE-OPTIONS.md). The included migrations target the existing database, not an empty project. The full baseline and audio backup were exported privately; they are deliberately excluded from Git. The archive migration also tightens storage policies, so the database, functions and frontend must be released together. See [readiness and release verification](docs/ARCHIVE-READINESS.md).

Security headers and the SPA fallback have one source of truth in `netlify.toml`. Keep `public/robots.txt`; do not reintroduce a conflicting `public/_headers` file. Recovery material, release backups and private recordings belong under ignored `local/`, not in commits or deployment packages.
