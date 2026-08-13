# MarketLink — Deployment Configuration

## What is and isn't actually deployed

**Frontend**: intended for GitHub Pages or similar static hosting once you
push this repo.

**Backend**: as of this writing, **no real backend has been deployed
publicly**. Every backend test in this project's history ran against a
temporary local PostgreSQL + Node server inside a sandboxed development
environment — that server does not exist on the public internet and cannot
be reached by real visitors. If you deploy `backend/` (Railway/Render/Fly/a
VPS/etc.) and a real PostgreSQL instance, follow the configuration below.
**Do not point production at a placeholder URL** — use the actual URL your
backend is reachable at once it's deployed.

## Why "Cannot reach server" happens without configuration

`frontend/MarketLink.html` talks to the backend at `window.ML_API_URL`.
Without an explicit override, that defaults to `http://localhost:4000`
everywhere in the file. When a real visitor's browser loads the page from
GitHub Pages, `localhost` resolves to **that visitor's own computer** — not
the MarketLink backend — so every API call fails immediately with a
connection error. This isn't a bug in the request logic; it's a missing
production configuration step.

## Fixing it: the deployment config block

Near the top of `frontend/MarketLink.html`, right after the CSP `<meta>`
tag, there's a clearly marked configuration block:

```html
<script>
(function(){
  var CONFIG = {
    API_URL: '',   // e.g. 'https://api.marketlink.gm' — leave '' for local dev
  };
  ...
})();
</script>
```

**For local development**: leave `API_URL: ''`. The app defaults to
`http://localhost:4000` and everything works against a locally-running
backend with no changes needed.

**For any public deployment** (GitHub Pages, staging, production): set
`API_URL` to your real, reachable backend URL, e.g.
`'https://api.marketlink.gm'`. You must **also** add that same origin to
the CSP `connect-src` directive in the `<meta http-equiv="Content-Security-Policy">`
tag directly above the config block, or the browser will silently block the
request even with the right URL configured.

A one-off manual override is also available for testing without editing the
file: append `?api=https://your-backend` to the URL. This is never used
automatically — a deployer must explicitly type it. (Only `http://` /
`https://` values are accepted — anything else, such as a `javascript:` URI,
is rejected and the default is used instead.)

### Automatic misconfiguration detection

If the page is running on a non-local host (not `localhost`/`127.0.0.1`/
`file://`) but `ML_API_URL` still resolves to a localhost address, the app
sets `window.MARKETLINK_BACKEND_MISCONFIGURED = true`, logs a clear console
warning, and any resulting request failure surfaces a specific "MarketLink
server is not configured for this deployment" message instead of a generic
connection error.

## Backend environment variables

Copy `backend/.env.example` to `backend/.env` and fill in real values
(never commit `.env`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Long random strings, ≥32 chars, different from each other |
| `PORT` | Port the backend listens on (default 4000) |
| `CORS_ORIGIN` | The exact frontend origin allowed to call this API with credentials — e.g. `https://youruser.github.io`. A single origin string; **not** `*`, since requests carry auth credentials |
| `OTP_DEV_MODE` | `true` shows the OTP on-screen after registration for testing without SMS; **must be `false` in production** — the backend will not return `devOtp` in responses when this is off |
| `AFRICASTALKING_API_KEY` + related vars | Required for real SMS delivery once `OTP_DEV_MODE=false` |

## HTTPS

If the frontend is served over HTTPS (GitHub Pages always is), the backend
must also be HTTPS — browsers block mixed-content requests from an HTTPS
page to an HTTP API.

## Database setup

1. Create the database: `createdb marketlink` (or via your hosting
   provider's dashboard/CLI for a managed Postgres instance).
2. Set `DATABASE_URL` in `backend/.env` to point at it.
3. From `backend/`, run `npm install` then `npm run migrate` — this applies
   all 11 migration files in `backend/src/db/migrations/` in order.
4. Verify: `npm start`, then `curl http://localhost:4000/health` should
   return `{"status":"ok"}`. A real end-to-end check is attempting
   registration — that route touches PostgreSQL directly, so success there
   confirms the database connection is actually working, not just that the
   process is running.

## Health check

`GET /health` (not under `/api/v1`) returns `{"status":"ok"}` when the
backend process is up. This does not by itself confirm the database is
reachable — a registration or login attempt is the practical end-to-end
check.

## Demo mode

If the backend is unreachable, the app falls back to local demo behavior
for some flows (via the pre-existing `MockAPI` object) so the UI remains
usable for local UI development without a running backend. When this
happens, a **persistent** banner is shown at the top of the screen (not a
toast that disappears) reading "Demo mode — not connected to a live
MarketLink server," specifically so a user can never mistake a simulated
account/order/payment for a real one.

**Known limitation, stated honestly**: some order/payment/vendor/rider
action flows still route through this same `MockAPI` object even when a
real backend *is* connected, rather than the real `ML_API` calls that
authentication, registration, orders (accept/reject), and withdrawals
already use. This was flagged but not fixed in this round of work, since
the requested scope was the registration bug, OTP display, and deployment
connectivity — not a full audit of every remaining mock code path. See
`docs/PHASE5_REPORT.md`.
