# Remember When

Private family oral-history app: record answers, store private audio, generate follow-up questions, and view the interview tree.

## Architecture

The React SPA talks directly to Supabase. Google OAuth and the family allowlist use Supabase Auth; interview data uses Postgres RLS; audio lives in private Supabase Storage; secret-bearing processing and weekly digests run in Supabase Edge Functions. Netlify hosts only static files.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set the two public Supabase values in `.env.local`. Open `http://127.0.0.1:5173`.

## Static deployment

```bash
npm run build
```

Upload the contents of `dist/` to Netlify. In Supabase Auth URL Configuration, add the deployment URL as the Site URL and a Redirect URL. Netlify environment variables are not required for the static app.

## Operations

Configure OpenAI, SendGrid, and digest scheduling values as Supabase Edge Function secrets. See [`../docs/integrations/supabase-weekly-digest.md`](../docs/integrations/supabase-weekly-digest.md) for digest setup and current verification status.
