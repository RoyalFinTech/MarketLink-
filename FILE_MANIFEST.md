# MarketLink — File Manifest

Generated directly from the actual repository file tree — **87 files total**. This list is not hand-typed; it was produced by walking the real directory after everything else was written, so it's accurate as of the final package.

## Frontend (1 file)

- `frontend/MarketLink.html`

## Backend (79 files, including 11 migrations)

- `backend/.env.example`
- `backend/.gitignore`
- `backend/README.md`
- `backend/package-lock.json`
- `backend/package.json`
- `backend/src/config/db.js`
- `backend/src/db/migrate.js`
- `backend/src/db/migrations/001_core_users.sql`
- `backend/src/db/migrations/002_catalog.sql`
- `backend/src/db/migrations/003_orders_delivery.sql`
- `backend/src/db/migrations/004_payments_wallets.sql`
- `backend/src/db/migrations/005_reviews_messaging.sql`
- `backend/src/db/migrations/006_cms_settings_logs.sql`
- `backend/src/db/migrations/007_categories_soft_delete.sql`
- `backend/src/db/migrations/008_vendors_extended.sql`
- `backend/src/db/migrations/009_riders_extended.sql`
- `backend/src/db/migrations/010_customers_extended.sql`
- `backend/src/db/migrations/011_assistant_knowledge.sql`
- `backend/src/db/seeds/README.md`
- `backend/src/docs/swagger.js`
- `backend/src/knowledge/marketlink-kb.js`
- `backend/src/middleware/auth.js`
- `backend/src/middleware/errorHandler.js`
- `backend/src/middleware/validate.js`
- `backend/src/modules/admin/controller.js`
- `backend/src/modules/admin/routes.js`
- `backend/src/modules/admin/service.js`
- `backend/src/modules/analytics/routes.js`
- `backend/src/modules/assistant/adminController.js`
- `backend/src/modules/assistant/controller.js`
- `backend/src/modules/assistant/conversationContext.js`
- `backend/src/modules/assistant/knowledgeRepo.js`
- `backend/src/modules/assistant/knowledgeService.js`
- `backend/src/modules/assistant/liveData.js`
- `backend/src/modules/assistant/providers.js`
- `backend/src/modules/assistant/responseBuilder.js`
- `backend/src/modules/assistant/routes.js`
- `backend/src/modules/assistant/service.js`
- `backend/src/modules/auth/controller.js`
- `backend/src/modules/auth/routes.js`
- `backend/src/modules/auth/service.js`
- `backend/src/modules/categories/controller.js`
- `backend/src/modules/categories/routes.js`
- `backend/src/modules/categories/service.js`
- `backend/src/modules/customers/controller.js`
- `backend/src/modules/customers/routes.js`
- `backend/src/modules/customers/service.js`
- `backend/src/modules/delivery/controller.js`
- `backend/src/modules/delivery/routes.js`
- `backend/src/modules/delivery/service.js`
- `backend/src/modules/messaging/routes.js`
- `backend/src/modules/notifications/controller.js`
- `backend/src/modules/notifications/routes.js`
- `backend/src/modules/notifications/service.js`
- `backend/src/modules/orders/controller.js`
- `backend/src/modules/orders/routes.js`
- `backend/src/modules/orders/service.js`
- `backend/src/modules/payments/controller.js`
- `backend/src/modules/payments/routes.js`
- `backend/src/modules/payments/service.js`
- `backend/src/modules/products/controller.js`
- `backend/src/modules/products/routes.js`
- `backend/src/modules/products/service.js`
- `backend/src/modules/reports/routes.js`
- `backend/src/modules/reviews/routes.js`
- `backend/src/modules/riders/controller.js`
- `backend/src/modules/riders/routes.js`
- `backend/src/modules/riders/service.js`
- `backend/src/modules/settings/routes.js`
- `backend/src/modules/uploads/controller.js`
- `backend/src/modules/uploads/routes.js`
- `backend/src/modules/uploads/service.js`
- `backend/src/modules/users/routes.js`
- `backend/src/modules/vendors/controller.js`
- `backend/src/modules/vendors/routes.js`
- `backend/src/modules/vendors/service.js`
- `backend/src/modules/withdrawals/service.js`
- `backend/src/server.js`
- `backend/src/utils/logger.js`

## Documentation (4 files)

- `docs/DEPLOYMENT.md`
- `docs/FILE_MANIFEST.md`
- `docs/GITHUB_UPLOAD.md`
- `docs/PHASE5_REPORT.md`

## Root config (3 files)

- `.env.example`
- `.gitignore`
- `README.md`

## Verification checklist

- [x] Every source file exists (79 files under `backend/`)
- [x] Every migration exists (11 files in `backend/src/db/migrations/`)
- [x] Frontend exists (`frontend/MarketLink.html`)
- [x] Backend exists (`backend/` — server.js, package.json, package-lock.json, src/)
- [x] Documentation exists (README.md, docs/DEPLOYMENT.md, docs/PHASE5_REPORT.md, this manifest, docs/GITHUB_UPLOAD.md)
- [x] `.env.example` exists (root and `backend/`)
- [x] `.gitignore` exists (root and `backend/`)
- [x] No real secrets present (scanned for API key/token/credential patterns — only placeholder values found in both `.env.example` files)
- [x] No `node_modules/` included
- [x] No temporary test database files or dumps included
- [x] No `.log` files included
- [x] No broken imports (verified: `npm install` + all 11 migrations + full live backend regression suite passed from this exact file layout)
- [x] No accidental localhost production dependency (verified: `MARKETLINK_CONFIG.API_URL` override mechanism tested against a simulated public deployment)
