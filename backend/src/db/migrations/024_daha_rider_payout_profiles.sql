-- DAHA Wallet: private rider payout destination.
-- Kept separate from the public rider profile and accessible only through the backend.
CREATE TABLE IF NOT EXISTS public.rider_payout_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.riders(user_id) ON DELETE CASCADE,
  payout_method VARCHAR(20) NOT NULL CHECK (payout_method IN ('wave','afrimoney')),
  account_number VARCHAR(7) NOT NULL CHECK (account_number ~ '^[0-9]{7}$'),
  beneficiary_name VARCHAR(150) NOT NULL CHECK (length(trim(beneficiary_name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_payout_profiles_method
  ON public.rider_payout_profiles(payout_method);

ALTER TABLE public.rider_payout_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rider_payout_profiles FROM anon, authenticated;
