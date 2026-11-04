-- Protect each order's authoritative settlement rows against accidental duplication.
-- Live duplicate checks were run before this migration; all returned zero rows.
-- Partial predicates retain compatibility with non-delivery or legacy records.

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_records_order
  ON public.commission_records (order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_earnings_delivery_order
  ON public.rider_earnings (order_id)
  WHERE type = 'delivery' AND order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_order_settlement_credit
  ON public.transactions (wallet_id, reference_type, reference_id)
  WHERE reference_type IN (
    'order_vendor_payout',
    'order_rider_payout',
    'order_affiliate_payout'
  )
  AND reference_id IS NOT NULL;
