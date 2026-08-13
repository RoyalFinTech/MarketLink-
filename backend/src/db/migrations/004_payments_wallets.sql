CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method VARCHAR(30) NOT NULL,
  provider_ref VARCHAR(120),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'GMD',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed','refunded','partially_refunded')),
  refund_status VARCHAR(20) CHECK (refund_status IN ('none','requested','processed','denied')) DEFAULT 'none',
  refund_amount DECIMAL(10,2) DEFAULT 0,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);

CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'GMD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('credit','debit')),
  category VARCHAR(40) NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  balance_after DECIMAL(12,2) NOT NULL,
  reference_type VARCHAR(30),
  reference_id UUID,
  description VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_wallet ON transactions(wallet_id, created_at DESC);

CREATE TABLE commission_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(user_id) ON DELETE CASCADE,
  order_total DECIMAL(10,2) NOT NULL,
  commission_pct DECIMAL(5,2) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  vendor_payout DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commission_records_vendor ON commission_records(vendor_id);

CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payout_method VARCHAR(30) NOT NULL,
  payout_details JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','rejected')),
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_withdrawals_user ON withdrawals(user_id);

CREATE TABLE affiliates (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  affiliate_code VARCHAR(20) NOT NULL UNIQUE,
  commission_pct DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  total_clicks INT NOT NULL DEFAULT 0,
  total_orders INT NOT NULL DEFAULT 0,
  total_earnings DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
