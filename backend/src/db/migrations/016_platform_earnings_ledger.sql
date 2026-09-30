-- Migration 016: platform earnings ledger
-- Records MarketLink's retained commission separately from vendor and rider balances.
-- This is an accounting ledger: customer payment remains with the configured payment merchant
-- until payout/settlement flows are executed; this table records what MarketLink has earned.

CREATE TABLE IF NOT EXISTS platform_earnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  gross_merchandise DECIMAL(10,2) NOT NULL CHECK (gross_merchandise >= 0),
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  commission_pct DECIMAL(5,2) NOT NULL CHECK (commission_pct >= 0 AND commission_pct <= 100),
  commission_amount DECIMAL(10,2) NOT NULL CHECK (commission_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'earned' CHECK (status IN ('earned','reversed')),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_platform_earnings_earned_at ON platform_earnings(earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_status ON platform_earnings(status);
