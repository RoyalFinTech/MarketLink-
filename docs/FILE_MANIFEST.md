# MarketLink — Repository File Manifest

Generated from the actual GitHub `main` tree on 2026-11-03. Total tracked files: **148**.

This is a repository path inventory, not a claim that every feature has passed production QA.

## GitHub automation (3 files)

- `.github/scripts/check-marketlink-frontend.mjs`
- `.github/workflows/generate-marketlink-brand-assets.yml`
- `.github/workflows/marketlink-frontend-check.yml`

## Scripts (1 files)

- `scripts/generate_marketlink_brand_assets.py`

## Frontend (25 files)

- `frontend/assets/apple-touch-icon-180.png`
- `frontend/assets/daha-wallet-eagle.webp`
- `frontend/assets/favicon-32.png`
- `frontend/assets/hero-marketlink-bag.webp`
- `frontend/assets/marketlink-app-icon-192.png`
- `frontend/assets/marketlink-app-icon-512.png`
- `frontend/assets/marketlink-app-icon-maskable-192.png`
- `frontend/assets/marketlink-app-icon-maskable-512.png`
- `frontend/assets/marketlink-app-icon-maskable.svg`
- `frontend/assets/marketlink-app-icon.svg`
- `frontend/assets/marketlink-category-atlas.webp`
- `frontend/assets/marketlink-logo.png`
- `frontend/assets/marketlink-og-preview.jpg`
- `frontend/assets/marketlink-promo-atlas.webp`
- `frontend/assets/promo-shopping.webp`
- `frontend/assets/promo-vendor.webp`
- `frontend/assets/whatsapp.svg`
- `frontend/firebase-messaging-sw.js`
- `frontend/index.html`
- `frontend/manifest.webmanifest`
- `frontend/MarketLink (7).html`
- `frontend/marketlink-i18n.js`
- `frontend/premium-marketlink.css`
- `frontend/premium-marketlink.js`
- `frontend/service-worker.js`

## Backend (109 files)

- `backend/.env.example`
- `backend/package-lock.json`
- `backend/package.json`
- `backend/RENDER_DEPLOYMENT.md`
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
- `backend/src/db/migrations/012_rider_location_pings.sql`
- `backend/src/db/migrations/015_marketplace_fee_model.sql`
- `backend/src/db/migrations/016_platform_earnings_ledger.sql`
- `backend/src/db/migrations/017_affiliate_commission_model.sql`
- `backend/src/db/migrations/018_customer_profile_customization.sql`
- `backend/src/db/migrations/018_vendor_rider_onboarding_documents.sql`
- `backend/src/db/migrations/019_database_profile_image_storage.sql`
- `backend/src/db/migrations/019_vendor_hours_and_direct_chat_uniqueness.sql`
- `backend/src/db/migrations/020_customer_language_preference.sql`
- `backend/src/db/migrations/020_rider_contact_delivery_tracking.sql`
- `backend/src/db/migrations/020_rider_contacts_and_live_tracking.sql`
- `backend/src/db/migrations/020_rider_whatsapp_contact.sql`
- `backend/src/db/migrations/020_rider_whatsapp_tracking.sql`
- `backend/src/db/migrations/021_vendor_taxonomy_whatsapp_gps_consent.sql`
- `backend/src/db/migrations/022_daha_wallet_deposits.sql`
- `backend/src/db/migrations/023_daha_vendor_payout_profiles.sql`
- `backend/src/db/migrations/024_daha_rider_payout_profiles.sql`
- `backend/src/db/migrations/025_affiliate_commission_max_2_percent.sql`
- `backend/src/db/migrations/026_affiliate_commission_fixed_2_percent.sql`
- `backend/src/db/migrations/027_daha_payout_recipient_numbers_nine_digits.sql`
- `backend/src/docs/swagger.js`
- `backend/src/integrations/modempay.js`
- `backend/src/knowledge/marketlink-kb.js`
- `backend/src/middleware/auth.js`
- `backend/src/middleware/errorHandler.js`
- `backend/src/middleware/validate.js`
- `backend/src/modules/admin/controller.js`
- `backend/src/modules/admin/routes.js`
- `backend/src/modules/admin/service.js`
- `backend/src/modules/affiliates/controller.js`
- `backend/src/modules/affiliates/routes.js`
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
- `backend/src/modules/promotions/controller.js`
- `backend/src/modules/promotions/routes.js`
- `backend/src/modules/promotions/service.js`
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
- `backend/src/modules/wallets/controller.js`
- `backend/src/modules/wallets/routes.js`
- `backend/src/modules/wallets/service.js`
- `backend/src/modules/withdrawals/pinLimiter.js`
- `backend/src/modules/withdrawals/routes.js`
- `backend/src/modules/withdrawals/service.js`
- `backend/src/server.js`
- `backend/src/utils/logger.js`
- `backend/src/utils/phone.js`

## Documentation (7 files)

- `docs/DEPLOYMENT.md`
- `docs/FILE_MANIFEST.md`
- `docs/GITHUB_UPLOAD.md`
- `docs/MARKETLINK_FRONTEND_PRODUCTION_HANDOVER.md`
- `docs/MARKETLINK_IMAGE_ASSET_QUEUE.md`
- `docs/MODEM_PAY_INTEGRATION_HANDOVER.md`
- `docs/PHASE5_REPORT.md`

## Root files (3 files)

- `.gitignore`
- `PROJECT_REPAIR_REPORT.md`
- `README.md`

## Brand asset dimensions

| Asset | Dimensions | Purpose |
|---|---:|---|
| `frontend/assets/marketlink-logo.png` | 220×177 | Original unmodified MarketLink artwork |
| `frontend/assets/marketlink-app-icon-192.png` | 192×192 | Standard PWA icon |
| `frontend/assets/marketlink-app-icon-512.png` | 512×512 | High-resolution PWA icon |
| `frontend/assets/marketlink-app-icon-maskable-192.png` | 192×192 | Mask-safe PWA icon |
| `frontend/assets/marketlink-app-icon-maskable-512.png` | 512×512 | Mask-safe high-resolution icon |
| `frontend/assets/apple-touch-icon-180.png` | 180×180 | iOS/iPadOS Home Screen icon |
| `frontend/assets/favicon-32.png` | 32×32 | Browser favicon |
| `frontend/assets/marketlink-og-preview.jpg` | 1200×630 | WhatsApp/social share preview |

## Reproducible image generation

`scripts/generate_marketlink_brand_assets.py` uses Pillow to generate the icon variants from the official original logo with aspect-ratio-preserving contain-fit placement. `.github/workflows/generate-marketlink-brand-assets.yml` runs when the logo or generator changes and commits generated files to `main`.

## Verification checklist

- [x] PWA manifest retains standalone display mode.
- [x] Standard and maskable 192×192 / 512×512 PNG icons exist.
- [x] Apple 180×180 Home Screen icon exists.
- [x] 32×32 favicon exists.
- [x] Public 1200×630 JPEG share preview exists.
- [x] Service-worker cache is v19 and precaches the new assets.
- [ ] Live WhatsApp crawler preview refresh and physical-device installation checks.
