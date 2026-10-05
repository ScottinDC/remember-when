# Remember When

Private family oral-history app: record answers, keep audio in private storage, generate follow-up questions, and explore the question progression.

This repository contains the recovered September 2026 Supabase application, the screenshot-matched Question Progression chart, an updated SendGrid v3 digest implementation, durable recording storage, a personal recording library, an administrator archive, narrative choices, and MP3/Word/text story downloads. See [recovery provenance and limits](docs/SOURCE-RECOVERY.md).

## Development

Use Node 22 or later:

```sh
npm ci
cp .env.example .env.local
# Fill in the public Supabase URL and publishable/anon key.
npm run dev
```

Open http://127.0.0.1:5173. The existing local `.env.local` already points to the current project. It is ignored by Git. Never put a service-role, OpenAI, or SendGrid secret in a `VITE_` variable.

```sh
npm run check
```

Runs the regression tests and a TypeScript/Vite production build. During development, `/tests/preview.html` previews the real interview and chart components with synthetic data; it is not included in the production build. Do not record/save in that fixture page.

## Architecture

- React/TypeScript/Vite frontend, hosted as static files on Netlify.
- Supabase Auth (Google sign-in), Postgres, private `interview-audio` storage.
- Five Supabase Edge Functions: `claim-access`, `process-answer`, `archive-audio`, `delete-answer`, `send-weekly-digest`.
- Audio uploads are registered in Postgres before transcription or question generation. Failed AI work can be retried without re-recording; partial transcripts and recording versions are retained.
- Active members manage their own recordings. Administrator reads and membership changes require a database admin role and an MFA AAL2 session, checked on the server.
- OpenAI transcription/follow-up generation; SendGrid v3 weekly emails in the updated source. Email playback links open the signed-in archive.

## Deployment and operations

Run `npm run build` to produce `dist/`. Netlify builds require `VITE_AUTH_PROVIDER=supabase`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. These are public client configuration; the key alone is not authorization and database access must remain protected by RLS.

Current site: https://chic-sherbet-39bee5.netlify.app

Canonical repository: https://github.com/ScottinDC/remember-when

The current Netlify site was manually deployed and is not connected to Git. Connecting it is a separate production action. Supabase functions also require separate deployment; a frontend build does not deploy them.

Read [Supabase ownership, backups and release steps](docs/SUPABASE.md) and [SendGrid setup and verification](docs/SENDGRID.md) before a production release. See [narrative options and next-stage features](docs/NARRATIVE-OPTIONS.md). The included migrations target the existing database; a full production schema baseline still needs exporting. The archive migration also tightens storage policies, so the database, functions and frontend must be released together. See [readiness and release verification](docs/ARCHIVE-READINESS.md).
