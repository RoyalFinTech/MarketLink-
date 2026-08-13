-- Migration 009: Extended rider fields and earnings table

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS full_name       VARCHAR(150),
  ADD COLUMN IF NOT EXISTS email           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address         TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS total_deliveries INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_earnings  DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS kyc_notes       TEXT,
  ADD COLUMN IF NOT EXISTS acceptance_rate DECIMAL(5,2) NOT NULL DEFAULT 100.00;

-- PostgreSQL does not support `CREATE TRIGGER IF NOT EXISTS` (no version does) —
-- drop-then-create is the correct idempotent pattern here.
DROP TRIGGER IF EXISTS trg_riders_updated_at ON riders;
CREATE TRIGGER trg_riders_updated_at BEFORE UPDATE ON riders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Rider earnings log (every delivery payout tracked here)
CREATE TABLE IF NOT EXISTS rider_earnings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id     UUID NOT NULL REFERENCES riders(user_id) ON DELETE CASCADE,
  delivery_id  UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  order_id     UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount       DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  type         VARCHAR(20) NOT NULL DEFAULT 'delivery'
                 CHECK (type IN ('delivery','bonus','adjustment','deduction')),
  description  VARCHAR(255),
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_rider ON rider_earnings(rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_delivery ON rider_earnings(delivery_id);

-- Rider availability zones (the regions a rider covers)
CREATE TABLE IF NOT EXISTS rider_zones (
  id         SERIAL PRIMARY KEY,
  rider_id   UUID NOT NULL REFERENCES riders(user_id) ON DELETE CASCADE,
  zone_name  VARCHAR(120) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rider_id, zone_name)
);
CREATE INDEX IF NOT EXISTS idx_rider_zones_rider ON rider_zones(rider_id);
