# FridgeOps Web

This directory contains the main FridgeOps application: a browser UI, Node.js Vercel Functions, Supabase persistence, and Gemini-powered recognition and recipes. There are no runtime npm dependencies.

See the [root README](../README.md) for features, environment variables, deployment, troubleshooting.

## Local development

Use Node.js 22. Create a Supabase project and run [`supabase.sql`](supabase.sql) in its SQL Editor, then:

```powershell
Copy-Item .env.example .env.local
# Fill in the server-side credentials in .env.local.
node --env-file=.env.local dev.mjs
```

Open [localhost:3000](http://localhost:3000). The environment file must be loaded explicitly; `node dev.mjs` only uses variables already present in the process environment.

```powershell
npm test
```

Tests mock external services. Use `/api/health` to check live configuration and database access, then verify recognition and recipe generation separately.

## Vercel

- Repository: `p1ft/fridge-ai`; production branch: `main`.
- Root Directory: `hosted`; Framework Preset: Other.
- No build step; static files are served from `public/`, functions from `api/`.
- Add `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `GEMINI_API_KEY` to the appropriate Vercel environments. Redeploy after variable changes.
- `GEMINI_MODEL` overrides the default in [`lib/shared.js`](lib/shared.js). Availability and quota depend on the Gemini API project; verify the chosen model with a real request.

Use a server-only `sb_secret_...` Supabase key. Tables have RLS enabled with no public-user policies; database requests go through the server. Keep secret keys out of public files and version control.

Without `FRIDGEOPS_WEB_ACCESS_CODE`, each browser receives an anonymous signed session. An optional access code restricts demo entry. Photos are sent to Gemini but not saved in Supabase; confirmed inventory, preferences, and recipe results are persisted.

Recognition and generation share a global 20/day and per-visitor 4/day AI-attempt limit. When AI is unavailable, recipe generation can return explicitly labelled templates. A paused or unreachable Supabase project prevents session storage and must be restored before the application can work normally.
