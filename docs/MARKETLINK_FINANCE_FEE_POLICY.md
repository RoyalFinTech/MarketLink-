# MarketLink Gambia — DAHA Wallet and Marketplace Fee Policy

This document records the finance rules used by the MarketLink production application.

## Marketplace order commission

The marketplace commission pool remains **5% of discounted merchandise subtotal**. It is deducted from merchandise proceeds and is never added to the customer's checkout total.

For an eligible affiliate-referred order, the 5% pool is divided into:
- **2% affiliate reward**
- **3% MarketLink retained commission**

Without a qualifying affiliate referral, MarketLink retains the full 5%. Affiliate rewards are credited only after the order has been delivered and payment is confirmed. The vendor controls the displayed product price; that listed price is not increased by this commission setting.

## DAHA Wallet withdrawal service fee

A separate **2% DAHA Wallet withdrawal service fee** applies when a customer, vendor, rider or affiliate withdraws money from their DAHA Wallet. It also applies when the wallet was funded by a deposit and the user withdraws without making a marketplace purchase.

The amount entered in the withdrawal form is the amount requested for the recipient. The 2% fee is added on top and shown in the review step before the user enters their MarketLink PIN.

Example:
- Requested payout to recipient: **D100.00**
- DAHA Wallet withdrawal service fee (2%): **D2.00**
- Total wallet debit: **D102.00**

The fee is not charged on a deposit, a product purchase, the marketplace checkout total or the rider's delivery charge. It is independent of the marketplace 5% commission.

## Modem Pay payout cost and MarketLink margin

Before initiating a supported transfer, MarketLink requests a payout-fee quote from Modem Pay. The quote and the fee returned by a completed transfer are kept separately from the DAHA service fee.

MarketLink's payout margin is calculated as:

`DAHA withdrawal service fee - Modem Pay transfer fee`

A positive value is the amount left with MarketLink before other operating costs. A negative value means the payout partner's cost exceeded the 2% service fee and the difference is absorbed by MarketLink, not deducted from the user's requested payout or the vendor's merchandise proceeds.

The Admin finance page reconciles DAHA service fees, Modem Pay payout fees and MarketLink's resulting margin. Where the provider's completed transfer does not return a separate fee, the pre-transfer quote is retained and labelled as a quote estimate.

## Payout confirmation and wallet safety

A withdrawal request is reserved against the user's available wallet balance, including the service fee. No wallet debit occurs just because the user submits a request. The payout and service fee are debited only after a matching provider-confirmed transfer. A failed or unaccepted transfer releases the full reservation. If a completed transfer is later reversed by the provider, the payout amount and DAHA service fee are returned to the user's wallet.

The existing D50 minimum payout, 4-digit MarketLink PIN confirmation, request-specific beneficiary details, provider reference checks and transfer idempotency remain in place.

## Supported payout methods

Wave and AfriMoney are the active mobile-money withdrawal methods in the current detailed Modem Pay payout contract.

QMoney and APS are shown in the withdrawal method picker as clearly disabled options until Modem Pay confirms their outgoing-transfer API support for this merchant account. Their appearance in a deposit or collection selector does not by itself prove that a payout is supported.

## Customer delivery charges

Delivery remains a separate amount from the product subtotal and marketplace commission. The current production order-creation source still uses a server-side base delivery fee; a rider-controlled location/distance fare system is a separate required change and must not be represented as complete until rider rates can be saved, quoted before order placement and locked to the order.
