-- Keep free customer Referrers non-earning at both the data and schema levels.
-- Only an Admin-approved Affiliate Marketer may carry a commission rate.
ALTER TABLE public.affiliates
  ALTER COLUMN commission_pct SET DEFAULT 0.00;

UPDATE public.affiliates
SET commission_pct = 0.00
WHERE marketer_status <> 'approved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'affiliates_commission_requires_approved_marketer'
      AND conrelid = 'public.affiliates'::regclass
  ) THEN
    ALTER TABLE public.affiliates
      ADD CONSTRAINT affiliates_commission_requires_approved_marketer
      CHECK (
        (marketer_status = 'approved' AND commission_pct >= 0 AND commission_pct <= 2.00)
        OR
        (marketer_status <> 'approved' AND commission_pct = 0.00)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.affiliates.commission_pct IS
  'Affiliate commission rate. Must be zero unless marketer_status is approved; capped at 2 percent.';
