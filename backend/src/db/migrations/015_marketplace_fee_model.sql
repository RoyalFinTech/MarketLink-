-- Migration 015: transparent marketplace fee model
-- MarketLink charges a modest 5% platform commission on the discounted merchandise subtotal.
-- Delivery is a separate, customer-visible fee and is reserved for the assigned rider.
-- This avoids hiding rider compensation inside product prices or silently inflating vendor prices.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS platform_fee_pct DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS vendor_payout DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_payout DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS rider_payout DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_pct DECIMAL(5,2) NOT NULL DEFAULT 5.00;

-- Preserve historical records; new orders use the 5% model.
CREATE INDEX IF NOT EXISTS idx_orders_vendor_payout ON orders(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_platform_fee ON orders(created_at DESC);

COMMENT ON COLUMN orders.platform_fee_pct IS 'MarketLink platform commission percentage applied to discounted merchandise subtotal.';
COMMENT ON COLUMN orders.vendor_payout IS 'Net merchandise payout owed to vendor after discount and MarketLink platform commission; excludes delivery fee.';
COMMENT ON COLUMN orders.rider_payout IS 'Delivery payout reserved for the rider; sourced from the customer-facing delivery fee.';
COMMENT ON COLUMN commission_records.rider_payout IS 'Delivery payout reserved for the rider for this order.';
