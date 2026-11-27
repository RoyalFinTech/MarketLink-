# MarketLink COD remittance: trusted deposit matching design

## Purpose

Move from manual receipt checking to automatic matching only when a Wave, AfriMoney or APS integration can provide a trusted, authenticated record of a deposit into a verified MarketLink collection account. A rider-uploaded image or PDF is supporting evidence; it is never, by itself, proof that funds arrived.

## Rider submission

The rider submits against the exact delivered COD payment:

- provider/channel (Wave, AfriMoney, or APS only after its account and integration are configured);
- receipt image or PDF uploaded using the private `cod-remittance-document` purpose;
- provider transaction reference copied exactly from the receipt;
- the amount is derived from the locked COD payment, not accepted from the rider;
- currency is GMD;
- the destination shown to the rider is the configured MarketLink company beneficiary name and account number.

The API must continue to verify that the rider is assigned to the delivery, the delivery and order are delivered, the payment is COD and pending, the amount matches, the receipt belongs to the rider, and the provider reference is not already used.

## Trusted deposit event intake

Each provider needs a separately reviewed adapter. Do not enable an adapter until its official API/webhook contract, signature method, retry semantics, event identifiers, beneficiary/account fields and test environment are confirmed.

A verified adapter must:
1. Authenticate the provider notification (signature/HMAC or provider-authenticated API retrieval) using a secret stored in Render environment variables, never source code or chat.
2. Validate the event is a completed/settled inbound deposit, not pending, reversed, failed or merely initiated.
3. Normalize provider, immutable provider event ID, transaction reference, amount, currency, beneficiary account, beneficiary name, received timestamp and provider status.
4. Persist the event idempotently. Replayed events must not create a second deposit or a second settlement.
5. Keep a hash and limited audit metadata for the raw event; do not retain unnecessary sensitive payload data.
6. Never accept a client/rider request as a trusted deposit event.

## Automatic matching rules

A submitted remittance may be auto-verified only if one trusted, completed inbound deposit uniquely matches all of:

- provider/channel;
- exact normalized transaction reference;
- exact amount in GMD (no tolerance that could conceal a short payment);
- configured MarketLink beneficiary account;
- configured MarketLink beneficiary name where the provider supplies it;
- event time after the COD delivery/cash collection window;
- the same event has not already been consumed by another remittance;
- the remittance is still submitted and the COD payment is still pending.

The match and remittance claim must happen under database row locks in one transaction, with unique constraints on provider event IDs and provider transaction references. A trusted deposit event can settle at most one remittance. After a successful match, use the existing payment confirmation and idempotent order settlement path exactly once.

## Manual exception queue

Send the record to Admin review (do not auto-confirm) when:
- no trusted deposit event arrives within the configured waiting window;
- the reference is absent, duplicated or does not match;
- amount or currency differs;
- beneficiary details differ or are unavailable;
- provider status is pending, unknown, reversed or failed;
- two candidate deposits match;
- the provider feed is delayed or unavailable.

Admin must compare the receipt with the actual company account statement and enter the current four-digit MarketLink PIN before approving or rejecting. Record Admin ID, decision, timestamp, reason, matched event ID and before/after state in the audit log. Two-factor authentication is a later separate project.

## Safety and reconciliation

- Do not confirm the COD payment merely because the rider uploaded a screenshot.
- Do not create wallet credits or release vendor/rider/affiliate/platform settlement before verification.
- Never delete original deposit events or settlement ledger entries; use append-only audit and compensating records for corrections.
- Reconcile provider deposit totals, matched remittances, unmatched deposits, duplicate events and payment settlements daily.
- A provider timeout or webhook outage must leave the remittance pending for Admin review, not silently approve it.
- Keep all provider secrets in Render secret environment variables and rotate them using the provider's documented procedure.

## Provider readiness checklist

For each provider separately obtain and verify:
- official product/API or webhook documentation for inbound deposits;
- merchant/company account ownership and exact beneficiary details;
- signed webhook or authenticated statement API contract;
- test/sandbox access and sample successful, pending, failed, reversed and duplicate events;
- provider event/reference uniqueness guarantees and retry policy;
- settlement/availability timing and currency representation;
- support contact and production activation approval.

Until this checklist is complete, the channel remains manual-review-only. The current code's `WAVE_API_KEY` and `AFRIMONEY_API_KEY` placeholders do not activate a deposit feed. APS must not be enabled until its exact provider identity and official integration contract are confirmed.
