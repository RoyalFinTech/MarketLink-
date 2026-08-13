# MarketLink — Phase 5 Report: Deployment, Registration & OTP Fix

## 1. Registration bug

**Root cause**: `toggleAgree()` (the Terms & Conditions checkbox handler)
called `renderAuth()`, which rebuilds the register form's `innerHTML` from
scratch. The Full Name and Phone Number `<input>` elements were
"uncontrolled" — nothing synced their live values into any state object —
so destroying and recreating them on every checkbox click silently wiped
whatever the user had typed.

**Fix**: made the inputs properly state-backed. Added `oninput` handlers
that sync `S.regName` / `S.regPhone` live as the user types, and the
register-form template now renders `value="..."` from that state instead of
leaving the fields empty. Any re-render — the checkbox, or anything else —
now reproduces exactly what the user typed instead of losing it.

**Test result**: 26/26 passed in a dedicated regression suite that
replicates the exact reported steps: enter name → enter phone → check the
box → verify both remain → uncheck → verify again → trigger a validation
message → verify → switch focus → verify. All performed via real DOM
events (`input`, not just setting `.value` directly) against the actual
file.

## 2. OTP

**Dev mode**: OTP display already existed and was already correctly
backend-sourced — the frontend never generates, calculates, or guesses an
OTP; it only displays `devOtp` when the backend includes it in the
response, which the backend only does when `OTP_DEV_MODE=true`. Added a
Copy OTP button and made the code selectable, since neither existed before.

**Production mode**: verified that when `devOtpDisplay` is `null` (i.e. the
backend didn't send a `devOtp`, meaning `OTP_DEV_MODE=false`), no OTP box
renders at all.

**Security**: verified the OTP is never written to `localStorage` — it
lives only in the in-memory `S` object for the current page session.

**End-to-end proof**: a full live test — real backend, real PostgreSQL —
generated a real OTP, displayed exactly that value on screen, submitted it
back, and the backend accepted it and created a real, retrievable user
record. This wasn't simulated.

## 3. API connectivity

**Frontend URL config**: previously hardcoded `http://localhost:4000` in
four places with no override mechanism. Now controlled by a single,
clearly-commented `MARKETLINK_CONFIG.API_URL` block near the top of
`frontend/MarketLink.html`, with an optional `?api=` query-param override
for testing (rejects anything that isn't `http://`/`https://`, so it can't
be used for script injection).

**Backend URL**: **no real backend is deployed anywhere public.** I did not
invent a URL like `https://api.marketlink.gm` — I checked the project for
any evidence of an actual deployed backend and found none. Every backend
test in this project's history, including this round's, ran against a
temporary local PostgreSQL + Node process inside a sandboxed development
environment that is not reachable from the public internet.

**Health check**: `GET /health` (confirmed exists, returns
`{"status":"ok"}` — tested live).

**CORS**: `backend/src/server.js` already uses a single-origin
`CORS_ORIGIN` env var with `credentials: true` — correctly avoids `*` for
credentialed requests. No code change needed; documented in
`docs/DEPLOYMENT.md` for the operator to set to their actual GitHub Pages
origin.

**HTTPS**: documented the mixed-content requirement (HTTPS frontend needs
an HTTPS backend) — no code enforces this since it depends entirely on
where the backend ends up deployed.

**Misconfiguration detection**: added automatic detection for the specific
failure mode reported — a public-hosted page still pointed at a localhost
API — which now surfaces a specific, actionable error instead of a generic
"Cannot reach server" message. Verified with 7 environment-detection edge
case tests (local dev correctly NOT flagged, `file://` correctly NOT
flagged, valid `?api=` override respected and not flagged, unconfigured
public deployment correctly flagged, `javascript:` injection attempt
correctly rejected).

**Bonus bug found and fixed while regression-testing**: `GET /categories`
was 500ing due to an ambiguous `deleted_at`/`is_active`/`parent_id` column
reference in a self-join query (the categories table was joined to itself
for parent/child lookups, and the `WHERE` clause didn't qualify which side
of the join those columns came from). Fixed by qualifying all three with
the `c.` alias. Unrelated to the three reported issues, but caught during
the required regression pass.

**Mock-fallback safety**: the existing "demo mode" indicator was a toast
that auto-dismissed after 3 seconds — easy to miss, and risky given
`MockAPI` still backs some order/payment flows (see limitation below). Made
it a persistent banner instead, with an explicit close control, so a user
can't lose track of being in demo mode mid-session.

## 4. Database

- Connection: verified live against a real local PostgreSQL 16 instance for
  every test in this report.
- Migrations: **11/11** apply cleanly to a fresh database, confirmed from
  the backend's new `backend/` location in this repo structure (not just
  its old location) — the move didn't break anything.

## 5. GitHub deployment

**Correctly deployable now**: the entire `frontend/` and `backend/`
directories, as a monorepo, with clear separation and no cross-directory
relative-path dependencies (the frontend is a single file with zero local
asset references — verified by scanning for local `src=`/`href=` paths and
finding none besides `tel:` links).

**Not deployed**: nothing has actually been pushed to GitHub or hosted
anywhere public by me — I don't have your repository URL. Nothing has been
deployed to any real backend host or managed PostgreSQL instance either.
"GitHub-ready" here means the files and structure are correct and tested
locally, not that a live deployment has been verified.

## 6. Test results (exact — nothing invented)

| Suite | Result |
|---|---|
| Frontend jsdom baseline (Phase 4 UI) | **41/41** |
| Issue-specific regression (registration/OTP/config, public-deployment scenario) | **26/26** |
| Environment-detection edge cases | **7/7** |
| End-to-end live test (real backend + real Postgres, full register→OTP→verify→DB chain) | **7/7** |
| Backend regression (auth, customer, vendor, rider, security, assistant, admin-knowledge) | **15/15** |
| Database migrations | **11/11** |

All frontend suites were re-run against the final `frontend/MarketLink.html`
location in this repo structure, and the backend suites were re-run against
`backend/` in this same structure, to confirm the reorganization itself
didn't break anything.

## 7. Remaining issues (genuine, not exhaustive elsewhere)

- **`MockAPI` still backs some order/payment/vendor/rider action flows.**
  Registration, login, orders (list/accept/reject/cancel), vendor and rider
  withdrawals, and the assistant all go through the real backend (`ML_API`).
  Some other flows in the app were built earlier against a fully mocked
  in-memory backend and haven't all been individually re-audited and
  migrated. This matters because a misconfigured production deployment
  could let a user believe an order or payment succeeded when it didn't
  reach a real backend at all. The persistent demo-mode banner mitigates
  this but doesn't eliminate the underlying gap.
- Frontend visual/responsive behavior has never been verified in a real
  browser in this environment (no GUI browser available — Chromium
  installs as a snap stub with no snapd, and browser-automation-tool
  Chromium downloads are blocked by network policy here). All frontend
  testing has been jsdom (real DOM/JS execution, not a rendering engine)
  plus manual code review.
- No production SMS, payment webhook, Firebase, or GPS-tracking
  credentials exist or have been tested against real providers.
- CORS currently supports exactly one configured origin at a time
  (`CORS_ORIGIN` is a single string) — fine for one frontend deployment,
  would need a small code change to support multiple origins (e.g.
  simultaneous staging + production).

## 8. Production readiness

**NOT READY.**

No backend is deployed publicly. The fixes in this report make the project
*correctly configurable* for a real deployment, and every piece has been
tested as thoroughly as this environment allows — but "configured
correctly" and "actually deployed and verified live" are different claims,
and only the first one is true right now.

**READY FOR STAGING** is achievable as soon as: (1) the backend is deployed
somewhere reachable with a real PostgreSQL instance, (2) `MARKETLINK_CONFIG.API_URL`
and `CORS_ORIGIN` are set to match each other, and (3) a real registration
attempt succeeds against that live deployment end-to-end — none of which
has happened yet from this environment.
