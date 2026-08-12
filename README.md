# MarketLink — Phase 4 Complete Package

This package contains the cumulative MarketLink project through Phase 4
(AI Knowledge Center). See `PHASE4_REPORT.md` for the full completion
report, test results, and production-readiness assessment.

## Contents

- `MarketLink.html` — the single-file frontend (all customer/vendor/rider/admin UI)
- `marketlink-backend/` — Node.js 20 + Express 4 + PostgreSQL 16 backend

## Setup

```bash
cd marketlink-backend
cp .env.example .env        # fill in real values — never commit .env
npm install
npm run migrate             # applies all 11 migrations
npm start
```

The frontend defaults to `http://localhost:4000` for `ML_API_URL`; open
`MarketLink.html` directly or serve it statically, and set
`window.ML_API_URL` before load if your backend runs elsewhere.

## Security note

No `.env` file, API keys, database passwords, or test tokens are included
in this package. `.env.example` in `marketlink-backend/` contains only
placeholder values.
