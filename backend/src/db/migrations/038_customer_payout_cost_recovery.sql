-- Customers pay one all-in order total that includes a small provision for
-- the later provider transfer costs on vendor, rider and affiliate payouts.
-- Existing orders remain unchanged; the setting is snapshotted on new orders.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payout_fee_recovery_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_fee_recovery_amount numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.platform_earnings
  ADD COLUMN IF NOT EXISTS payout_fee_recovery_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_fee_recovery_amount numeric(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='orders_payout_fee_recovery_pct_range'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payout_fee_recovery_pct_range
      CHECK (payout_fee_recovery_pct BETWEEN 0 AND 10);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='orders_payout_fee_recovery_amount_nonnegative'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payout_fee_recovery_amount_nonnegative
      CHECK (payout_fee_recovery_amount >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='platform_earnings_payout_fee_recovery_pct_range'
  ) THEN
    ALTER TABLE public.platform_earnings
      ADD CONSTRAINT platform_earnings_payout_fee_recovery_pct_range
      CHECK (payout_fee_recovery_pct BETWEEN 0 AND 10);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='platform_earnings_payout_fee_recovery_amount_nonnegative'
  ) THEN
    ALTER TABLE public.platform_earnings
      ADD CONSTRAINT platform_earnings_payout_fee_recovery_amount_nonnegative
      CHECK (payout_fee_recovery_amount >= 0);
  END IF;
END $$;

INSERT INTO public.system_settings (key,value,category)
VALUES ('payout_fee_recovery_pct','2.00'::jsonb,'finance')
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.orders.payout_fee_recovery_pct IS
  'Payout cost recovery percentage included in the all-in customer total for this order, calculated on vendor, rider and affiliate wallet payouts.';
COMMENT ON COLUMN public.orders.payout_fee_recovery_amount IS
  'Payout cost recovery amount included in the all-in customer order total; not part of the marketplace 5% commission pool.';
COMMENT ON COLUMN public.platform_earnings.payout_fee_recovery_amount IS
  'Customer-funded payout provider cost provision recognized after order payment confirmation and delivery.';
