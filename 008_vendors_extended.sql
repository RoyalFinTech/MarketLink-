-- Migration 008: Extended vendor fields for full workflow support

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS phone           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS email           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description     TEXT,
  ADD COLUMN IF NOT EXISTS banner_url      VARCHAR(500),
  ADD COLUMN IF NOT EXISTS return_policy   TEXT,
  ADD COLUMN IF NOT EXISTS min_order_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_time_min INT,
  ADD COLUMN IF NOT EXISTS delivery_time_max INT,
  ADD COLUMN IF NOT EXISTS total_sales     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_revenue   DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS kyc_notes       TEXT;

CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_vendors_location ON vendors(latitude, longitude)
  WHERE kyc_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_vendors_open ON vendors(is_open)
  WHERE kyc_status = 'approved' AND vacation_mode = FALSE;

-- Vendor analytics snapshots (daily rollup — populated by a cron job)
CREATE TABLE IF NOT EXISTS vendor_analytics_daily (
  id          BIGSERIAL PRIMARY KEY,
  vendor_id   UUID NOT NULL REFERENCES vendors(user_id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  orders      INT NOT NULL DEFAULT 0,
  revenue     DECIMAL(12,2) NOT NULL DEFAULT 0,
  items_sold  INT NOT NULL DEFAULT 0,
  new_reviews INT NOT NULL DEFAULT 0,
  avg_rating  DECIMAL(3,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, date)
);
CREATE INDEX IF NOT EXISTS idx_vendor_analytics_vendor ON vendor_analytics_daily(vendor_id, date DESC);
