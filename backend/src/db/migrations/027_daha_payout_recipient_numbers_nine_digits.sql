-- DAHA Wallet payout recipients are nine-digit Gambian mobile-money numbers.
-- These are separate from MarketLink sign-in phones and may belong to another account.
ALTER TABLE public.vendor_payout_profiles
  ALTER COLUMN account_number TYPE VARCHAR(9);
ALTER TABLE public.vendor_payout_profiles
  DROP CONSTRAINT IF EXISTS vendor_payout_profiles_account_number_check;
ALTER TABLE public.vendor_payout_profiles
  ADD CONSTRAINT vendor_payout_profiles_account_number_gm_chk
  CHECK (account_number ~ '^(87|86|83)[0-9]{7}$');

ALTER TABLE public.rider_payout_profiles
  ALTER COLUMN account_number TYPE VARCHAR(9);
ALTER TABLE public.rider_payout_profiles
  DROP CONSTRAINT IF EXISTS rider_payout_profiles_account_number_check;
ALTER TABLE public.rider_payout_profiles
  ADD CONSTRAINT rider_payout_profiles_account_number_gm_chk
  CHECK (account_number ~ '^(87|86|83)[0-9]{7}$');
