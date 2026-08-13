# MarketLink Project Repair Report

## Problems Found

- Backend, migration, package, documentation, and frontend files were flattened into the project root.
- `package.json` already pointed to `src/server.js` and `src/db/migrate.js`, but those paths did not exist before repair.
- SQL migrations were in the root instead of `backend/src/db/migrations/`.
- `server.js` mounted many historical modules that are not present in this pasted workspace.
- `controller.js` and `routes.js` are vendor files by comments and route content, but the only `service.js` present is the withdrawals service.
- `MarketLink (6).html` was in root, while documentation consistently referred to `frontend/MarketLink.html`.
- Local `npm install` was blocked by registry TLS certificate errors and exited with an npm internal error, leaving a partial `node_modules`.
- Git status could not be read because Git marked the repo as a dubious-ownership directory for the sandbox user.

## Files Moved

- `package.json` -> `backend/package.json`
- `package-lock.json` -> `backend/package-lock.json`
- `.env.example` -> `backend/.env.example`
- `server.js` -> `backend/src/server.js`
- `db.js` -> `backend/src/config/db.js`
- `migrate.js` -> `backend/src/db/migrate.js`
- `auth.js` -> `backend/src/middleware/auth.js`
- `errorHandler.js` -> `backend/src/middleware/errorHandler.js`
- `validate.js` -> `backend/src/middleware/validate.js`
- `logger.js` -> `backend/src/utils/logger.js`
- `swagger.js` -> `backend/src/docs/swagger.js`
- `marketlink-kb.js` -> `backend/src/knowledge/marketlink-kb.js`
- `controller.js` -> `backend/src/modules/vendors/controller.js`
- `routes.js` -> `backend/src/modules/vendors/routes.js`
- `service.js` -> `backend/src/modules/withdrawals/service.js`
- Assistant files -> `backend/src/modules/assistant/`
- `001_*.sql` through `011_*.sql` -> `backend/src/db/migrations/`
- `MarketLink (6).html` -> `frontend/MarketLink.html`
- deployment/history docs -> `docs/`

## Files Renamed

- `MarketLink (6).html` was renamed by location to `frontend/MarketLink.html`.

## Imports Fixed

- Existing imports mostly already matched the intended `src/` layout after moving files.
- `server.js` now dynamically mounts only route files that exist and load successfully.
- `server.js` no longer crashes if Swagger docs dependencies are missing locally.
- `logger.js` now falls back to console logging if `winston` is unavailable because of an incomplete local dependency install.

## Missing Files

The previous manifest listed many backend modules that are absent from this pasted workspace, including:

- `auth`, `users`, `customers`, `riders`, `admin`, `products`, `categories`, `orders`, `payments`, `delivery`, `notifications`, `reviews`, `messaging`, `reports`, `settings`, `uploads`, and `analytics` route modules.
- `backend/src/modules/vendors/service.js`, required by the vendor controller.
- `backend/src/modules/assistant/routes.js` and `backend/src/modules/assistant/controller.js`.
- `backend/src/modules/admin/routes.js`, which would be needed to mount assistant admin knowledge routes under admin.

These were not invented or rewritten.

## Missing Dependencies

`backend/package.json` declares the dependencies used by the code. Local installation did not finish because npm failed with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` and `Exit handler never called`. The partial `node_modules` created by that failed install was removed so the workspace is not left with a broken dependency tree. A Render build with normal registry TLS should run `npm install` cleanly.

During local startup after the partial install, before removing the broken `node_modules`:

- `swagger-ui-dist` was missing, so `/api-docs` was disabled.
- `express-validator` was missing, so the `vendors` route module was skipped.

After cleanup, the backend needs `npm install` before `npm start` can run.

## Final Folder Structure

```text
MarketLink-/
  README.md
  PROJECT_REPAIR_REPORT.md
  backend/
    .env.example
    package-lock.json
    package.json
    RENDER_DEPLOYMENT.md
    src/
      server.js
      config/db.js
      db/migrate.js
      db/migrations/001_core_users.sql ... 011_assistant_knowledge.sql
      docs/swagger.js
      knowledge/marketlink-kb.js
      middleware/auth.js
      middleware/errorHandler.js
      middleware/validate.js
      modules/assistant/
      modules/vendors/
      modules/withdrawals/
      utils/logger.js
  docs/
    DEPLOYMENT.md
    FILE_MANIFEST.md
    GITHUB_UPLOAD.md
    PHASE5_REPORT.md
  frontend/
    MarketLink.html
```

## How To Run Locally

```bash
cd backend
npm install
copy .env.example .env
# edit .env and set DATABASE_URL plus JWT secrets
npm run migrate
npm start
```

Then test:

```bash
curl http://localhost:4000/health
```

## How To Deploy To Render

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Set the environment variables listed in `backend/RENDER_DEPLOYMENT.md`.

## How To Connect PostgreSQL Or Supabase

Create a PostgreSQL database, copy its connection string to `DATABASE_URL`, set `DB_SSL=true` for managed providers, deploy the backend, then run:

```bash
npm run migrate
```

## Frontend Change After Render URL Is Ready

In `frontend/MarketLink.html`:

1. Replace `API_URL: ''` with `API_URL: 'YOUR_REAL_RENDER_BACKEND_URL'`.
2. Add that same origin to the CSP `connect-src` list.
3. In Render, set `CORS_ORIGIN` to the exact GitHub Pages origin serving the frontend.

Do not invent the URL and do not leave `YOUR_RENDER_BACKEND_URL` as the final production value.

## Verification Performed

- Read and analyzed requested key files and all JavaScript/SQL files present in this workspace.
- Searched for `require(`, `import`, `module.exports`, `exports.`, `localhost`, `API_URL`, `DATABASE_URL`, and `process.env`.
- Ran `node --check` over all backend JavaScript files successfully.
- Verified all 11 migration files are under `backend/src/db/migrations/` in numeric filename order.
- Verified `backend/package.json` scripts point to existing paths.
- Started the server on port `4011` and confirmed `GET /health` returned JSON.
- Listed route definitions found in the present workspace.

## API Endpoints Found

Always available:

- `GET /health`
- `GET /api/v1`

Found in `vendors/routes.js`, but currently skipped locally until dependencies and `vendors/service.js` are restored:

- `GET /api/v1/vendors`
- `GET /api/v1/vendors/withdrawals`
- `POST /api/v1/vendors/withdrawals`
- `POST /api/v1/vendors/register`
- `PUT /api/v1/vendors/profile`
- `GET /api/v1/vendors/me/analytics`
- `GET /api/v1/vendors/:id`
- `PUT /api/v1/vendors/:id/profile`
- `POST /api/v1/vendors/:id/approve`
- `POST /api/v1/vendors/:id/reject`
- `POST /api/v1/vendors/:id/suspend`
- `POST /api/v1/vendors/:id/reinstate`
- `GET /api/v1/vendors/:id/analytics`
