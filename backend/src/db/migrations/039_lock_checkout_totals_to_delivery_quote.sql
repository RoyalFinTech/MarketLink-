-- Snapshot the all-in customer total into each expiring rider quote.
-- This prevents product/commission changes during the quote window from
-- silently increasing the amount after the customer has selected a rider.
ALTER TABLE public.delivery_fee_quotes
  ADD COLUMN IF NOT EXISTS estimated_customer_total numeric(10,2),
  ADD COLUMN IF NOT EXISTS payout_fee_recovery_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS checkout_fingerprint varchar(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='delivery_fee_quotes_estimated_total_nonnegative'
  ) THEN
    ALTER TABLE public.delivery_fee_quotes
      ADD CONSTRAINT delivery_fee_quotes_estimated_total_nonnegative
      CHECK (estimated_customer_total IS NULL OR estimated_customer_total >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='delivery_fee_quotes_recovery_pct_range'
  ) THEN
    ALTER TABLE public.delivery_fee_quotes
      ADD CONSTRAINT delivery_fee_quotes_recovery_pct_range
      CHECK (payout_fee_recovery_pct IS NULL OR payout_fee_recovery_pct BETWEEN 0 AND 10);
  END IF;
END $$;

COMMENT ON COLUMN public.delivery_fee_quotes.estimated_customer_total IS
  'Server-calculated all-in amount previewed to the customer before order placement; includes merchandise, selected rider fare and payout cost recovery.';
COMMENT ON COLUMN public.delivery_fee_quotes.payout_fee_recovery_pct IS
  'Payout recovery setting captured when this expiring checkout quote was generated.';
COMMENT ON COLUMN public.delivery_fee_quotes.checkout_fingerprint IS
  'SHA-256 fingerprint of authoritative cart prices, coupon/referral, commission settings, delivery fare and customer/address to prevent quote tampering or price drift.';
