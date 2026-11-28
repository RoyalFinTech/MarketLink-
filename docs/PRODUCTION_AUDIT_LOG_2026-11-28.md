# MarketLink Production Audit & Release Log — 2026-11-28

## Release status

- Repository: `RoyalFinTech/MarketLink-`, branch: `main`.
- Final release commit: `955e0b04b1786fcdbbaae42543afe7423a0e4d69`.
- Pull request #77 (Admin TOTP + COD remittance safeguards): merged as `4330b5e6622b75e2473e331614a806c57611bc79`.
- Pull request #79 (integrated settled-order refund reversals): merged as `955e0b04b1786fcdbbaae42543afe7423a0e4d69`.
- Superseded original PR #78 was closed after its safe changes were integrated into PR #79.
- CI for PR #79 passed: backend tests, frontend checks, and frontend JavaScript syntax.
- Render backend, customer frontend, and separate Admin static site all report `live` on commit `955e0b0`.
- Vercel production deployment reports `READY` on the same commit.

## Changes committed to main

1. **Admin security and COD remittance**
   - Added the Two-Factor Authenticator page to the Admin navigation and hamburger drawer.
   - Added RFC 6238 TOTP enrollment, QR/manual setup, first-code verification, protected login challenges, replay protection, rate limiting, and PIN + TOTP protection for sensitive Admin financial actions.
   - Authenticator remains opt-in; it is not automatically enabled for Admin accounts.
   - Added a trusted Wave/AfriMoney deposit-event ledger foundation. This does not enable automatic provider matching or claim a provider adapter is live.
   - A stable random `ADMIN_TOTP_ENCRYPTION_KEY` is configured in the Render backend environment. Its value is intentionally not recorded in source control or this log.

2. **Affiliate onboarding presentation**
   - Reduced social-platform logo/emoji sizes, tile heights, card padding, and heading sizes.
   - Kept a two-column mobile layout for platform selection and compact social-handle cards.
   - CSS is committed in `bbc9629ba189974a78c834c5c8a401b2de4044ae`.

3. **DAHA Wallet balance privacy**
   - Added a visible eye control to hide/show the available balance.
   - Hidden mode replaces the amount with asterisks; the control updates its accessible label and pressed state.
   - Committed in `eca7f0dc0c8a285e8b6e8849eac3cc709197c5b2`.

4. **Vendor, rider, affiliate and platform settlement audit**
   - Verified `settleOrderFinancials` only settles delivered, payment-confirmed orders with a matching pending commission record and validated order/commission snapshots.
   - The transaction writes vendor wallet credit + `order_vendor_payout`, rider wallet credit + `order_rider_payout` + `rider_earnings`, affiliate wallet credit + `order_affiliate_payout`, platform earnings, and marks the commission record paid.
   - Missing settlement records block wallet credits; mismatched snapshots block settlement.
   - Added Admin reconciliation checks for missing credits, wrong beneficiary/amount, rider earning records, platform earning snapshots, wallet-vs-transaction differences, and refund recovery cases.
   - Corrected rider earnings summaries so `deduction` entries subtract from total, paid, and pending earnings.
   - Pending withdrawal states `initiating`, `processing`, and `payout_pending` are treated as reserved funds.

5. **Settled-order refund reversals**
   - Added a unique financial reversal record and immutable beneficiary lines.
   - The workflow verifies original vendor/rider/affiliate credit owner and amount, rider earnings record, platform earnings, wallet currency, and pending withdrawal reservations before reversing.
   - Original credit transactions are not deleted or edited. Reversals append compensating debit transactions.
   - The customer DAHA Wallet is credited only after the required beneficiary reversals can complete in the same database transaction.
   - Insufficient funds or mismatched evidence creates a `recovery_required` case; balances remain unchanged and the same refund can be retried after reconciliation.
   - Full refunds only. Partial refunds remain blocked.

## Production database migrations applied

- `046_trusted_cod_deposit_events`
- `047_admin_totp_authenticator`
- `048_financial_refund_reversal_ledger`

All three are present in Supabase migration history. The new event/authenticator/reversal tables have RLS enabled and direct privileges revoked from `PUBLIC`, `anon`, and `authenticated`; backend service-role access is granted. Migration 048 also permits `commission_records.status='reversed'`.

## Production deployment verification

- Render backend service `srv-d9utunmgekts73dakq40`: deploy `dep-dc5fgg8ae00c73eogq60`, status `live`, application commit `955e0b0`.
- Render customer frontend `srv-db3rtgijnfac738i81mg`: status `live`; latest static-site commit `23a4737` is documentation-only and includes the deployed application release `955e0b0`.
- Render Admin site `srv-dbunj95g1s2s73cdi7m0`: status `live`; latest static-site commit `23a4737` is documentation-only and includes the deployed application release `955e0b0`.
- Vercel production deployment: `READY`, latest commit `23a4737` (documentation-only; application release `955e0b0` is included).
- At the end of this audit, there are zero open pull requests in the repository; PR #77 and #79 are merged and the superseded PR #78 is closed.

## Production data reality — no fabricated settlement records

A read-only production count returned:

| Table | Rows |
|---|---:|
| orders | 0 |
| payments | 0 |
| wallets | 1 |
| transactions | 0 |
| commission_records | 0 |
| platform_earnings | 0 |
| withdrawals | 0 |
| rider_earnings | 0 |
| cod_cash_remittances | 0 |
| affiliate_marketer_applications | 0 |

Therefore, the settlement code and reconciliation controls are deployed, but there are no real production orders or settlement transactions to certify as paid. No sample/fake transactions were inserted and no live wallet balances were changed during this work.

## Explicit remaining boundaries

- **External provider refunds:** deliberately blocked before any external call or local balance change. Modem Pay/Wave/AfriMoney refund execution requires a verified provider refund API, signed webhook/status contract, and idempotency handling. Do not enable it before that work is complete.
- **Provider COD auto-matching:** migration foundation is present; no provider adapters are enabled. APS remains pending verified provider documentation.
- **DAHA wallet-to-wallet transfer:** not implemented. Await the original DAHA wallet integration/API details and credentials before designing or enabling transfers.
- **Live financial acceptance test:** still requires a controlled test order with verified payment, vendor/rider/affiliate settlement, withdrawal reservation, COD remittance review, and Admin reconciliation. Do not use real customer funds as a test.
- **Authenticator acceptance test:** the Admin menu is present in the deployed Admin source and the backend encryption key is configured. An authorized Admin still needs to enroll an authenticator on the live Admin portal and verify a fresh login before treating the operational flow as user-tested.

## Audit notes

- Supabase health advisor returned no health lints at the time of review.
- Security advisor reports informational RLS-enabled/no-policy findings on existing tables; the new tables added in this release explicitly deny direct anonymous/authenticated access and are accessed through the backend service role.
- No user/provider secrets are included in this document.
