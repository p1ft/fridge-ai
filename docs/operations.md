# Operations

## Deploy

Use the Vercel project connected to `main`, with Root Directory `hosted`, Framework
Preset Other, no build command, and static output `public`. Functions live in `api/`.
Set the required variables listed in the root README. Apply `hosted/supabase.sql`
to the intended Supabase project before first use. Never run schema changes against
an unidentified project; review migrations and take backups for later changes.

## Release checks

1. Run `npm ci`, `npm run check`, `npm run format:check`, and `npm test`.
2. Verify the Vercel production deployment uses the intended commit.
3. Verify `/api/health` returns HTTP 200 and `ready: true`.
4. Create a session, save a small ingredient list, and reload to verify persistence.
5. Generate recipes and inspect the source label. An HTTP 200 template result does
   not establish Gemini availability. Recognition requires a separate photo check.

These actions create session data and may consume AI quota. Never use private
photos for routine release checks.

## Database unavailable

If health reports `reason: database`, inspect the Supabase project dashboard first.
A paused project must be resumed; wait until services are healthy before retrying.
If the project is healthy, check the URL, server-only key, schema, and Vercel runtime
logs. A redeploy alone does not restore a paused database.

## AI unavailable

Check the Gemini model configured for the API project, credentials, quota, and
runtime logs. Requests have bounded timeouts and do not retry automatically.
Every attempted model call uses an admission slot, including failed calls. The
database allows 20 attempts globally and four per visitor per UTC day. The recipe
endpoint can return templates; photo recognition reports failure.

## Rollback and maintenance

Use Vercel's deployment history to restore a known working application deployment.
Environment variable changes require a new deployment. Database changes and data
are separate from application rollbacks; use Supabase backups when needed.

Monitor health, API errors, fallback frequency, and provider usage. Configure backups,
data retention, individual identity, and stronger traffic controls before treating
the demo as a service with availability or privacy guarantees.
