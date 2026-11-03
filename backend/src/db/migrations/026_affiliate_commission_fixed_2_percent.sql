-- The current MarketLink affiliate program is fixed at exactly 2%.
UPDATE public.affiliates
SET commission_pct = 2.00
WHERE commission_pct IS DISTINCT FROM 2.00;

ALTER TABLE public.affiliates
  ALTER COLUMN commission_pct SET DEFAULT 2.00;

ALTER TABLE public.affiliates
  DROP CONSTRAINT IF EXISTS affiliates_commission_pct_max_2_chk;

ALTER TABLE public.affiliates
  DROP CONSTRAINT IF EXISTS affiliates_commission_pct_fixed_2_chk;

ALTER TABLE public.affiliates
  ADD CONSTRAINT affiliates_commission_pct_fixed_2_chk
  CHECK (commission_pct = 2.00);
