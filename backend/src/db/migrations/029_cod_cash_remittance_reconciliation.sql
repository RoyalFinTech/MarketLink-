CREATE TABLE cod_cash_remittances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  rider_id UUID NOT NULL REFERENCES riders(user_id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'GMD' CHECK (currency='GMD'),
  deposit_method VARCHAR(20) NOT NULL DEFAULT 'wave' CHECK (deposit_method IN ('wave','afrimoney')),
  provider_reference VARCHAR(120) NOT NULL,
  proof_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','verified','rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_cod_remittance_provider_reference
  ON cod_cash_remittances(provider_reference);
CREATE INDEX idx_cod_remittance_status_submitted
  ON cod_cash_remittances(status, submitted_at);
CREATE INDEX idx_cod_remittance_rider
  ON cod_cash_remittances(rider_id, submitted_at DESC);
