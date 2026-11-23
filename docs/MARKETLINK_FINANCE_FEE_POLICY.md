# MarketLink Gambia — Finance, Delivery and Payout Fee Policy

## 1. Marketplace commission

The marketplace commission pool remains **5% of the discounted merchandise subtotal**. It is deducted from the merchandise proceeds; it is not an additional line added to vendor-listed prices.

For a qualifying affiliate referral, the current split is:
- Vendor: 95% of discounted merchandise subtotal.
- Affiliate: 2% of discounted merchandise subtotal, funded from the 5% marketplace commission pool.
- MarketLink retained share: 3% of discounted merchandise subtotal.

Without a qualifying referral, MarketLink retains the full 5% pool. The affiliate amount is not added on top of the 5%.

## 2. Customer-funded payout-cost recovery

New orders include a configurable **2% payout-cost recovery provision** in the customer's one all-in payable total. The calculation base is the total amount that will later be credited to wallet holders for the order:

`vendor payout + rider delivery payout + qualifying affiliate payout`

The 2% provision is not a second marketplace commission and does not alter product listing prices. It is stored as its own order snapshot and is included in the customer total without exposing a separate commission, gateway-fee or processing-fee row during checkout or wallet payment.

Illustrative examples (delivery fare D25):

| Component | Qualifying affiliate | No affiliate |
|---|---:|---:|
| Merchandise subtotal | D100.00 | D100.00 |
| Marketplace commission pool (5%) | D5.00 | D5.00 |
| Vendor payout | D95.00 | D95.00 |
| Affiliate payout | D2.00 | D0.00 |
| MarketLink retained commission | D3.00 | D5.00 |
| Rider delivery payout | D25.00 | D25.00 |
| Payout-cost recovery base | D122.00 | D120.00 |
| Customer-funded recovery at 2% | D2.44 | D2.40 |
| **Customer all-in total** | **D127.44** | **D127.40** |

The recovery percentage is configurable by Admin from 0% to 10%. The percentage and amount are recorded on each new order. The amount is recognized in the platform earnings ledger only when the order is paid and successfully delivered. Existing orders keep their original pricing; previous orders are not recalculated.

## 3. DAHA Wallet withdrawals

The DAHA Wallet withdrawal service fee remains **2% by default for customers, vendors, riders and affiliates** (Admin can change the percentage within the existing 0%–10% control). It applies to cash-outs, including funds that were deposited directly and withdrawn without a marketplace purchase. There is no DAHA withdrawal fee on deposits or product purchases.

The fee is shown transparently in the withdrawal review before the user enters their PIN. For example, to receive D100, a user pays D2 DAHA service fee and the wallet debit is D102. The fee is calculated on the amount the recipient receives, not on the fee-inclusive debit.

The customer-funded order provision in section 2 is separate: it helps offset actual outgoing provider transfer costs when vendor, rider or affiliate funds are later withdrawn. It does not replace the DAHA service fee.

## 4. Provider transfer fee reconciliation

Modem Pay fee quotes and returned provider fees are recorded separately from the DAHA withdrawal service fee and the customer-funded order provision. Admin Finance reconciles:

- DAHA wallet withdrawal service fees collected;
- customer-funded payout-cost recovery recognized from completed orders;
- Modem Pay provider fees quoted/charged; and
- the net recovery or shortfall.

A positive net is retained by MarketLink. If the actual provider fee exceeds the amounts recovered, MarketLink bears the shortfall; it is not silently deducted from the vendor's merchandise payout or the rider's delivery fare. Fee quote data is labelled as an estimate when Modem Pay has not returned an actual fee.

Wave and AfriMoney are the configured outgoing mobile-money rails in the current integration. QMoney and APS remain visible as disabled options until outgoing payout support is confirmed and enabled. No production test transfer is assumed by this policy.

## 5. Rider-controlled delivery pricing

Riders can save:
- a default base delivery fee;
- a per-kilometre amount;
- a minimum fare; and
- fixed origin-area to destination-area fares for routes they serve regularly.

For a route without a matching fixed fare, the server calculates:

`max(minimum fare, base fee + estimated road kilometres × rider's per-kilometre rate)`

For a matching saved route pair, the rider's fixed fare overrides the calculator. Prices are stored in the rider tariff table.

The checkout route estimate uses the vendor's saved pickup GPS and the customer's saved delivery-address GPS. The current road-distance estimate applies a configurable distance factor (default 1.25) to straight-line GPS distance. It is an estimate, not live turn-by-turn navigation or a guaranteed road-route calculation.

Each rider quote is specific to the customer, vendor, saved address, cart, coupon/referral, relevant commission settings, delivery fare and rider. Quotes expire after 15 minutes. The full all-in customer total is calculated server-side and fingerprinted with the quote; if cart prices, discounts or commission settings change before order placement, the customer must refresh the quote and review the revised total. Once the order is placed, the selected rider and delivery fare are locked to that order.

A rider reserved by a placed order is excluded from further quotes and new assignments until that order is completed or cancelled. Vendors cannot silently replace the rider with a different fare.

Checkout displays the customer’s single all-in payable amount. The payment service, including DAHA Wallet, uses the order total saved by the server. The checkout does not add a second payment-step surcharge.

## 6. Settlement controls

Vendor, rider and qualifying affiliate wallet credits occur only after confirmed payment and successful delivery. The server validates the commission record, payout recovery snapshot, locked rider and order amounts before changing balances. A pending withdrawal reserves the full wallet debit (recipient payout plus DAHA withdrawal service fee). Failed payouts release the reserve; completed-payout reversals restore the full wallet debit.

No production transfer or customer charge should be initiated as a test without explicit authorization and a confirmed test merchant account.
