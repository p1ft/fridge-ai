# FridgeOps

Turn the ingredients in your fridge into meal ideas. Add products manually or upload photos, review the inventory, and get up to three recipes with estimated nutrition per serving.

**[Open the web app](https://fridge-ai-p1ft.vercel.app)**

The main application lives in **`hosted/`**: a browser interface, Node.js API functions on Vercel, Supabase storage, and Google Gemini for photo recognition and recipe generation. It has no runtime npm dependencies. The repository contains only this hosted application.

## What you can do

- Recognize ingredients from up to three JPEG, PNG, or WebP photos, or enter them yourself.
- Review and save up to 30 ingredients with quantities in pieces, grams, or millilitres.
- Request recipes for 1–8 servings, with preferences and ingredient exclusions.
- Keep ingredient lists and the latest recipes in browser-specific sessions.
- See estimated nutrition from the bundled USDA snapshot, including missing coverage.

Recipes are checked against the saved inventory. If AI is unavailable or its response fails validation, the app tries explicitly labelled recipe templates. Photo recognition still requires AI, and session storage requires a working database.

## Run the web app locally

Requirements: Node.js 22, a Supabase project, and a Gemini API key.

1. In Supabase's SQL Editor, run [`hosted/supabase.sql`](hosted/supabase.sql) to create the tables and the rate-limit function.
2. From the repository root:

   ```powershell
   cd hosted
   Copy-Item .env.example .env.local
   ```

3. Fill in `.env.local` with your server-side credentials, then start:

   ```powershell
   node --env-file=.env.local dev.mjs
   ```

4. Open [localhost:3000](http://localhost:3000). Check `/api/health`, add ingredients, save them, and request recipes.

The development server does not load environment files automatically; `--env-file` loads the file explicitly. No npm install or build step is needed.

### Environment variables

| Variable                    | Purpose                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Project URL, such as `https://<project-ref>.supabase.co`.                                                                                       |
| `SUPABASE_SECRET_KEY`       | Server-only Supabase `sb_secret_...` key.                                                                                                       |
| `GEMINI_API_KEY`            | Server-side Google Gemini API key.                                                                                                              |
| `GEMINI_MODEL`              | Optional model override; use a model available to your API project. See [hosted configuration](hosted/.env.example) for the configured default. |
| `FRIDGEOPS_WEB_ACCESS_CODE` | Optional shared code for demo access. Without it, visitors receive anonymous signed sessions.                                                   |
| `FRIDGEOPS_SESSION_SECRET`  | Optional session-signing secret; otherwise derived from the Supabase secret key.                                                                |
| `PORT`                      | Local server port; defaults to `3000`.                                                                                                          |

Keep credentials in ignored environment files and Vercel settings. Never put server keys in browser JavaScript or `NEXT_PUBLIC_` variables.

## Deploy to Vercel

Import this repository and use:

| Setting           | Value         |
| ----------------- | ------------- |
| Production branch | `main`        |
| Root Directory    | `hosted`      |
| Framework Preset  | Other         |
| Build Command     | No build step |
| Output Directory  | `public`      |

Create the Supabase schema first. Add the required environment variables in Vercel for Production and any Preview environments you use, then deploy. Redeploy after changing environment variables so the new deployment receives them.

A healthy `/api/health` returns HTTP 200 with `ready: true`. This checks required configuration and a database read; it does **not** verify the Gemini key, model availability, or remaining AI quota. Verify recipe generation separately and check whether the result is labelled AI or a template.

For a private repository on a Vercel Hobby team, the deployment commit author must belong to the team owner's connected GitHub account.

### If the site stops working

| Symptom                                | Check                                                                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health reports `reason: configuration` | Required Vercel environment variables and the deployment receiving them.                                                                                                    |
| Health reports `reason: database`      | Supabase project status, URL, server key, and whether `supabase.sql` has been applied. If the dashboard says the project is paused, restore it there and wait for recovery. |
| Recipes show a template warning        | Function logs, Gemini key/model, provider availability, and daily limits.                                                                                                   |
| Session changed warning                | Refresh; another tab may have saved a newer revision.                                                                                                                       |

The hosted quota is four AI attempts per visitor per day and twenty globally per day. Recognition and recipe generation share that quota. Manual inventory and template recipes can still work after the quota is reached, provided Supabase is available.

## Tests

From the repository root:

```powershell
npm ci
npm run check
npm run format:check
npm test
```

The tests cover session authentication, inventory persistence, photo drafts, recipe validation, fallback recipes, and nutrition. Provider and database calls are mocked; passing tests do not establish production service availability.

## Repository layout

```text
hosted/
  public/          Browser UI: HTML, CSS, JavaScript
  api/             Vercel functions: auth, sessions, vision, recipes, health
  lib/             Shared server helpers and recipe validation
  data/            Bundled nutrition snapshot
  tests/           Node.js tests
  supabase.sql     Database schema and AI quota function
  vercel.json      Function limits and response headers
scripts/          JavaScript verification tools
docs/             Architecture and operations guides
```

## Data and limitations

Photos are resized in the browser and sent through the server to Google Gemini; the application does not store them in Supabase. Confirmed inventory, preferences, and recipe results are saved in Supabase. A signed, HttpOnly cookie identifies the browser for seven days; clearing or losing it removes access to that browser's sessions. This is a demo session system, not a cross-device user account.

Recognition needs human review. Nutrition estimates use a limited food mapping and may be partial. Check ingredient availability, allergens, and cooking instructions before using a recipe. The interface and generated recipe instructions are English.

## Engineering documentation

- [Architecture and tradeoffs](docs/architecture.md)
- [Deployment and operations](docs/operations.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Nutrition data provenance](hosted/data/usda/README.md)
