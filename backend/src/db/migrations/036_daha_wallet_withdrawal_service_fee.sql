-- DAHA Wallet withdrawal service-fee accounting.
-- Existing withdrawals are preserved at their original requested payout amount;
-- the new fee applies only to withdrawals requested after the application release.
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS wallet_debit_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS service_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_fee_quote NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS provider_fee_quoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_fee_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS provider_fee_source VARCHAR(40),
  ADD COLUMN IF NOT EXISTS platform_fee_margin NUMERIC(10,2);

UPDATE public.withdrawals
SET wallet_debit_amount = amount
WHERE wallet_debit_amount IS NULL;

ALTER TABLE public.withdrawals
  ALTER COLUMN wallet_debit_amount SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.withdrawals'::regclass
      AND conname = 'withdrawals_wallet_debit_covers_payout_and_fee'
  ) THEN
    ALTER TABLE public.withdrawals
      ADD CONSTRAINT withdrawals_wallet_debit_covers_payout_and_fee
      CHECK (wallet_debit_amount = amount + service_fee_amount);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.withdrawals'::regclass
      AND conname = 'withdrawals_service_fee_pct_range'
  ) THEN
    ALTER TABLE public.withdrawals
      ADD CONSTRAINT withdrawals_service_fee_pct_range
      CHECK (service_fee_pct >= 0 AND service_fee_pct <= 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.withdrawals'::regclass
      AND conname = 'withdrawals_provider_fee_amount_nonnegative'
  ) THEN
    ALTER TABLE public.withdrawals
      ADD CONSTRAINT withdrawals_provider_fee_amount_nonnegative
      CHECK (provider_fee_quote IS NULL OR provider_fee_quote >= 0);
    ALTER TABLE public.withdrawals
      ADD CONSTRAINT withdrawals_provider_fee_actual_nonnegative
      CHECK (provider_fee_amount IS NULL OR provider_fee_amount >= 0);
  END IF;
END $$;

INSERT INTO public.system_settings (key,value,category,updated_by)
VALUES ('withdrawal_service_fee_pct','2.00'::jsonb,'finance',NULL)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.withdrawals.amount IS
  'Net GMD payout amount sent to the recipient, excluding the DAHA Wallet withdrawal service fee.';
COMMENT ON COLUMN public.withdrawals.wallet_debit_amount IS
  'Total amount reserved/debited from the user wallet: payout amount plus DAHA Wallet service fee.';
COMMENT ON COLUMN public.withdrawals.service_fee_pct IS
  'DAHA Wallet withdrawal service-fee percentage snapshotted when the request is submitted.';
COMMENT ON COLUMN public.withdrawals.service_fee_amount IS
  'DAHA Wallet withdrawal service-fee amount snapshotted when the request is submitted.';
COMMENT ON COLUMN public.withdrawals.provider_fee_quote IS
  'Modem Pay transfer fee quoted before the payout is initiated.';
COMMENT ON COLUMN public.withdrawals.provider_fee_amount IS
  'Actual Modem Pay fee returned on transfer completion, or the prior quote when the signed webhook omits actual fee metadata.';
COMMENT ON COLUMN public.withdrawals.provider_fee_source IS
  'Source of provider fee accounting: confirmed_transfer_response, provider_quote_estimate, or missing.';
COMMENT ON COLUMN public.withdrawals.platform_fee_margin IS
  'DAHA service fee less Modem Pay transfer fee; can be negative when MarketLink absorbs a provider cost above 2%.';
