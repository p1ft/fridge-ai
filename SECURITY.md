# Security

Report a suspected vulnerability privately to the repository owner through the
contact details on their GitHub profile. Do not include credentials, private
images, or working exploits in public issues.

The browser calls same-origin API functions. Supabase secret keys and Gemini keys
are server-side only. Database tables enable RLS and deny direct access to the
anonymous and authenticated database roles. Server queries scope sessions by the
signed visitor ID and writes use revision checks.

Anonymous sessions are a demo access mechanism. The global AI quota bounds provider
requests; the per-visitor quota is not strong identity-based abuse prevention.
A shared demo code is not a substitute for individual user accounts. See
[operations](docs/operations.md) before opening the app to substantial traffic.
