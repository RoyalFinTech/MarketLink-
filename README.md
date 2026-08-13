# MarketLink

The Gambia's local multi-vendor marketplace — customers, vendors, riders,
and admins in one app, built for Royal FinTech Company.

## Project structure

```
MarketLink/
├── frontend/
│   └── MarketLink.html      ← single-file app (all UI, no build step, no separate assets)
├── backend/
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   ├── .gitignore
│   └── src/
│       ├── server.js
│       ├── config/           (db connection, etc.)
│       ├── db/migrations/    (11 SQL migrations, run in order)
│       ├── middleware/       (auth, validation, error handling)
│       ├── modules/          (one folder per domain: auth, orders, vendors,
│       │                      riders, payments, admin, assistant, ...)
│       ├── knowledge/        (static MarketLink Assistant knowledge base)
│       └── utils/
├── docs/
│   ├── DEPLOYMENT.md
│   ├── PHASE5_REPORT.md
│   ├── FILE_MANIFEST.md
│   └── GITHUB_UPLOAD.md
├── .env.example              (copy of backend/.env.example — the one that matters)
├── .gitignore
└── README.md                 (this file)
```

The frontend is intentionally a single self-contained HTML file — no
external CSS/JS/image files, no build step. This was verified directly:
there are no local relative asset references anywhere in it, so nothing was
lost or needs separating out to preserve import paths.

The backend uses `src/` internally (`backend/src/server.js`, not
`backend/server.js`) — that's its actual existing structure and hasn't been
flattened or reorganized.

## Quick start (local development)

```bash
# Backend
cd backend
cp .env.example .env        # fill in real values — never commit .env
npm install
npm run migrate             # applies all 11 migrations to your local PostgreSQL
npm start                   # listens on :4000 by default

# Frontend
# Just open frontend/MarketLink.html in a browser, or serve it statically.
# It talks to http://localhost:4000 automatically — no configuration needed
# for local development.
```

## Deploying for real (GitHub Pages + a real backend)

See **`docs/DEPLOYMENT.md`** — it explains exactly what "Cannot reach
server" means on a public deployment, where to put your real backend URL,
CORS, HTTPS, and environment variables.

## Current status

See **`docs/PHASE5_REPORT.md`** for exact test results and an honest
statement of what is and isn't actually deployed anywhere public right now.

## Uploading this to GitHub

See **`docs/GITHUB_UPLOAD.md`** for both the GitHub website method and the
git command-line method.
