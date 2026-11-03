-- DAHA Wallet: provider-backed wallet deposits.
-- The app server owns the wallet ledger; client roles receive no direct table access.
CREATE TABLE IF NOT EXISTS public.wallet_deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  provider VARCHAR(30) NOT NULL DEFAULT 'modempay' CHECK (provider IN ('modempay')),
  provider_ref VARCHAR(180),
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'modempay'
    CHECK (payment_method IN ('modempay','wave','afrimoney','qmoney')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'GMD' CHECK (currency = 'GMD'),
  status VARCHAR(20) NOT NULL DEFAULT 'initiating'
    CHECK (status IN ('initiating','pending','completed','failed','cancelled')),
  provider_status VARCHAR(40),
  provider_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_deposits_provider_ref
  ON public.wallet_deposits(provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_deposits_user_created
  ON public.wallet_deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_deposits_status_created
  ON public.wallet_deposits(status, created_at DESC);

ALTER TABLE public.wallet_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wallet_deposits FROM anon, authenticated;
