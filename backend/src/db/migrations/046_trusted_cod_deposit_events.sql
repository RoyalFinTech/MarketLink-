-- Store normalized, authenticated provider deposit events for COD remittance matching.
-- No provider adapter is enabled by this migration; events must be inserted only
-- by a server-side adapter after signature/API verification.
CREATE TABLE IF NOT EXISTS public.cod_provider_deposit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('wave','afrimoney')),
  provider_event_id VARCHAR(180) NOT NULL,
  transaction_reference VARCHAR(180) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL CHECK (currency = 'GMD'),
  beneficiary_account_fingerprint CHAR(64) NOT NULL,
  beneficiary_name VARCHAR(160),
  provider_status VARCHAR(30) NOT NULL CHECK (provider_status = 'completed'),
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  payload_sha256 CHAR(64) NOT NULL,
  event_occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  match_status VARCHAR(20) NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched','matched','review_required')),
  matched_remittance_id UUID UNIQUE
    REFERENCES public.cod_cash_remittances(id) ON DELETE RESTRICT,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cod_provider_event_identity_unique
    UNIQUE (provider, provider_event_id),
  CONSTRAINT cod_provider_transaction_identity_unique
    UNIQUE (provider, beneficiary_account_fingerprint, transaction_reference),
  CONSTRAINT cod_provider_event_match_state_check CHECK (
    (match_status = 'matched' AND matched_remittance_id IS NOT NULL AND matched_at IS NOT NULL)
    OR
    (match_status <> 'matched' AND matched_remittance_id IS NULL AND matched_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cod_provider_deposit_match_candidates
  ON public.cod_provider_deposit_events
    (provider, transaction_reference, amount, currency, event_occurred_at)
  WHERE signature_verified = TRUE AND match_status = 'unmatched';

CREATE INDEX IF NOT EXISTS idx_cod_provider_deposit_review_queue
  ON public.cod_provider_deposit_events (received_at DESC)
  WHERE match_status = 'review_required';

-- Provider event payloads contain financial identifiers. Keep this ledger
-- inaccessible to browser roles; server adapters use the service database role.
ALTER TABLE public.cod_provider_deposit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cod_provider_deposit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cod_provider_deposit_events TO service_role;
