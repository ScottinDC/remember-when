---
name: qa-flow
description: >-
  Run the Remember When end-to-end QA flow. Trigger when the user says
  "run the qa flow", "qa flow", "run QA", "run qa", or asks to verify
  production / smoke-test the app with all QA tools.
---

# Remember When QA Flow

When the user asks to run the QA flow, **do it immediately** — do not ask for confirmation first.

## Hard constraints

- **Do not** `git push`, trigger Netlify production deploys, or run `netlify deploy --prod`.
- **Do not** send weekly digests with `force=1` unless the user explicitly asks.
- Prefer the local orchestrator: `npm run qa`.

## Steps (agent checklist)

1. Read this skill (done) and run from the repo root.
2. Ensure dependencies exist (`npm install` only if `node_modules` is missing).
3. Run the orchestrator:

```bash
npm run qa
```

Optional flags the user may request:

| Phrase / intent | Command |
|---|---|
| Default | `npm run qa` |
| Include local e2e | `npm run qa -- --local` (needs `npm run dev:local` already up) |
| Skip Playwright | `npm run qa -- --skip-e2e` |
| Skip build | `npm run qa -- --skip-build` |
| Skip digest checks | `npm run qa -- --skip-digest` |

4. If Playwright browsers are missing, install once: `npx playwright install chromium`.
5. Write a short pass/fail summary for the user from the console output and `e2e-results/qa-flow.json`.
6. On failure: name the failing step, quote the error, and suggest the smallest fix — do not start unrelated refactors.

## What the orchestrator covers

1. **Build** — `npm run build` (`tsc` + Vite)
2. **Production smoke** — `scripts/verify-production.mjs` (homepage, OAuth capture, health, session, interview auth, Identity)
3. **Digest route smoke** — confirms `/api/digest/send` is live (expects `Invalid digest secret` with a probe secret)
4. **Optional digest send** — only if `DIGEST_SECRET` is in the environment; **no** `force=1`
5. **Playwright production** — `e2e/production-flow.spec.ts`
6. **Playwright local** — only with `--local`

## Manual Google login

Full Google OAuth + recording cannot be automated end-to-end. After automated steps pass, tell the user the one remaining manual check:

> Sign in with an allowlisted Google account and confirm you only see **your** interview (per-user isolation).

## Reporting template

```
QA flow: PASS|FAIL
- Build: …
- Production smoke: …
- Digest route: …
- Playwright production: …
- Local (if run): …
Manual remaining: Google sign-in + per-user interview
```
