# MarketLink Gambia — Modem Pay Integration Handover

Last reviewed: 13 October 2026

## Supported checkout paths

### Hosted Merchant API (default)

- API mode: `MODEM_PAY_API_MODE=merchant` (the code default if unset).
- API base defaults to `https://api.modempay.com/v1`.
- MarketLink sends the customer to Modem Pay's hosted payment page; the customer chooses from methods enabled on the merchant account.
- MarketLink does not collect a Wave/AfriMoney/QMoney number itself in this mode.
- Do not treat a return redirect or a closed browser window as payment success. The signed webhook updates the order when the provider reports `charge.succeeded` with `status: completed`.
- The official Merchant API quickstart says hosted payments are in GMD and the minimum amount is D 10.00.

### Direct mobile money (H2H)

- API mode: `MODEM_PAY_API_MODE=h2h`.
- API base defaults to `https://api.modempay.com/h2h/v1`.
- This is a separate contract from hosted Merchant API and requires Modem Pay to approve/activate the merchant for H2H direct charge.
- `MODEM_PAY_H2H_APPROVED=true` is an explicit local activation gate. Set it only after Modem Pay has confirmed the account is enabled for H2H. A key alone does not prove H2H permission.
- When enabled, MarketLink collects the local 7-digit mobile-money number (without +220), then follows the provider's actual `next_step`: Wave redirects externally, AfriMoney uses confirmation, and QMoney/APS can request a temporary PIN/OTP. Never store that code.
- Verify final status by webhook or H2H transaction status. Only `completed` represents a confirmed payment. Polling is every 5 seconds, stopping at a final state or after 5 minutes.

## Backend environment variables

Enter secrets directly in Render's Environment page. Never paste production secrets into source code, public repository files or chat.

| Variable | Purpose | Secret? |
|---|---|---|
| `MODEM_PAY_API_KEY` | Modem Pay test/live secret API key for backend requests | Yes |
| `MODEM_PAY_API_MODE` | `merchant` or `h2h`; defaults to `merchant` | No |
| `MODEM_PAY_H2H_APPROVED` | Must be `true` only after Modem Pay confirms H2H partner activation | No |
| `MODEM_PAY_BASE_URL` | Optional override; code resolves the proper `/v1` or `/h2h/v1` suffix | No, but must be HTTPS in production |
| `MODEM_PAY_WEBHOOK_SECRET` | Dashboard-level webhook signing secret for global webhook | Yes |
| `MODEM_PAY_SECRET_HASH` | SHA-256 hash of the API secret for a per-payment `callback_url` webhook, as documented by Modem Pay | Yes |
| `MODEM_PAY_CALLBACK_URL` | Optional callback endpoint for individual payment intents; use the deployed backend callback URL | No |
| `MODEM_PAY_RETURN_URL` | Customer return destination for hosted checkout | No |
| `MODEM_PAY_CANCEL_URL` | Customer cancellation destination for hosted checkout | No |

For the default hosted Merchant API mode, configure `MODEM_PAY_WEBHOOK_SECRET` (or the documented `MODEM_WEBHOOK_SECRET`) from Developers → Webhooks. `MODEM_PAY_SECRET_HASH` alone does not unlock hosted Merchant checkout; it is accepted only for H2H mode when a per-payment `MODEM_PAY_CALLBACK_URL` is configured. The backend now fails closed if the selected checkout mode has no matching webhook signing secret. Use one webhook signing arrangement at a time and configure the corresponding secret. The backend webhook endpoint is `https://marketlink-gambia.onrender.com/api/v1/payments/webhook/modempay`. The handler expects the `x-modem-signature` header and verifies HMAC-SHA512 with a timing-safe comparison. It accepts the exact raw JSON body and the canonical `JSON.stringify(parsedBody)` form used in Modem Pay's Node example.

The current rider COD deposit workflow is manual: MarketLink publishes the official Wave/AfriMoney collection account numbers and names, riders upload a receipt and enter the provider reference, and Admin manually matches it against the company account statement. The `WAVE_API_KEY` and `AFRIMONEY_API_KEY` placeholders are not wired into this workflow; do not assume setting them enables automatic provider verification. Configure `MARKETLINK_COD_WAVE_ACCOUNT_NUMBER`, `MARKETLINK_COD_WAVE_ACCOUNT_NAME`, `MARKETLINK_COD_AFRIMONEY_ACCOUNT_NUMBER`, and `MARKETLINK_COD_AFRIMONEY_ACCOUNT_NAME` for the rider instructions.

## Implemented safeguards

- Server checks order ownership, amount, currency and provider setup before initiating a payment.
- Pending provider attempts are reserved in the database, with unique per-attempt idempotency keys.
- A transport timeout is treated as an unknown/pending outcome, not automatically as a failed payment.
- Payment UI keeps the order pending and warns the customer not to pay again while status is unresolved.
- Customer status/continue routes check payment ownership before contacting the provider.
- Provider callback signature uses `x-modem-signature` with timing-safe comparison.
- Webhook event IDs are de-duplicated; non-completed success events, amount mismatches and currency mismatches do not mark orders paid.
- A pending payment can be resumed after refresh from session-level metadata and server-side payment status.
- Customer mobile-money number is used only for an H2H initiation and is not saved to profile/local storage. A provider PIN/OTP is sent only to the provider for that request and is not persisted.

## Tests still blocked

No real Modem Pay test payment has been initiated in this code session. Provider credentials, merchant-enabled methods, approved callback/webhook configuration, and (for H2H) explicit partner approval are required before the full payment lifecycle can be accepted. When test credentials are ready, start in test mode and verify: initiation, all three direct-charge variants, callback signature, duplicate callback, pending/timeout recovery, incorrect amount/currency, cancellation, failure, successful settlement, and that no redirect alone marks the order paid.

## Official references

- [Modem Pay Merchant API quickstart](https://docs.modempay.com/documentation/quickstart)
- [Create a Merchant API Payment Intent](https://docs.modempay.com/documentation/payment-intents/create)
- [Modem Pay H2H Direct Charge](https://h2h-docs.modempay.com/docs/payment-intents/direct-charge)
- [Modem Pay H2H Webhooks and signature validation](https://h2h-docs.modempay.com/docs/webhooks)
