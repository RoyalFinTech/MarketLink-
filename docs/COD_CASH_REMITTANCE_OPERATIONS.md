# MarketLink Pay on Delivery cash remittance operations

## Customer payment choices

Checkout exposes two customer-facing choices:

- **Cash on Delivery** — the customer pays the rider in cash at delivery. The payment remains pending until the rider remits the exact order amount and an Admin verifies the deposit.
- **DAHA Wallet** — the backend debits the customer's available DAHA balance and records a confirmed payment. Delivery and the existing settlement process still control when vendor, rider, affiliate and platform shares are released.

The checkout does not present third-party provider branding as a customer payment choice.

## Cash collection and settlement sequence

1. The order is created with `payment_method='cod'`; the payment record remains `pending`.
2. The rider completes delivery. The delivery event does not itself confirm the COD payment or release the financial split.
3. The rider deposits the full customer payment into the official MarketLink collection account shown in the Rider Dashboard.
4. The rider submits the receipt reference and deposit method against the exact COD payment. The backend checks the assigned rider, delivered order, payment method, payment amount and duplicate reference.
5. An Admin checks the reference and amount against the official company account statement, then verifies or rejects the remittance.
6. Verification confirms the payment and invokes the existing idempotent order settlement. The settlement credits the vendor payout, rider earning and affiliate commission to their DAHA wallets and records MarketLink's net platform earning.
7. A rejection does not confirm payment or release any earnings. The rider can submit a corrected reference.

A personal rider wallet balance or a screenshot alone is not proof that cash reached MarketLink's company collection account. The Admin must match the receipt against the actual company account statement.

## Required Render environment configuration

Set these four non-secret collection-account values on the backend Render service before asking riders to use COD remittance:

- `MARKETLINK_COD_WAVE_ACCOUNT_NUMBER`
- `MARKETLINK_COD_WAVE_ACCOUNT_NAME`
- `MARKETLINK_COD_AFRIMONEY_ACCOUNT_NUMBER`
- `MARKETLINK_COD_AFRIMONEY_ACCOUNT_NAME`

Account numbers are validated as nine-digit local numbers beginning with 87, 86 or 83. A method is shown as configured only when both its account number and account name are valid. The rider submission API fails closed if the selected collection destination is not configured.

Do not substitute a rider's personal number or the general company contact number without confirming that it is the official company collection account. After setting these values, redeploy the backend and check the Rider Dashboard destination display.

## Admin controls and audit

Every Admin approval or rejection must include the current four-digit MarketLink account PIN. The backend verifies the PIN hash for the authenticated, active administrator inside the review transaction; an incorrect or missing PIN saves no decision. The clear PIN is not stored in the remittance record. Two-factor authentication is a separate future enhancement.


The Admin cash deposit verification desk lists submitted references, amounts, rider, vendor, order and optional proof link. Admin must verify against the actual account statement. Both verification and rejection are written to `admin_action_logs`. Duplicate receipt references are rejected by a unique database index. Each COD payment can have one current remittance record; a rejected record can be resubmitted with a corrected reference.

## Reconciliation behavior

A delivery may be marked delivered while its COD payment remains pending. In that state the settlement engine does not distribute any shares. Once the remittance is verified, the payment is confirmed and the existing order settlement allocates the precomputed order split. The settlement is idempotent; repeated Admin retries do not credit wallets twice.

The rider's delivery earning is shown separately from the full cash amount to remit. The full customer payment is deposited to MarketLink; the rider does not keep the vendor or platform portions.

## Operational limitation

Receipt submission is not automatic bank verification. Until a direct company-account statement feed is integrated, Admin performs the final manual match. Do not enable live COD operations until the official collection account values are configured and the Admin team knows how to check deposits.
