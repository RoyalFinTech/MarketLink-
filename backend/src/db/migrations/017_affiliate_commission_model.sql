-- Migration 017: affiliate attribution and commission allocation
-- Default affiliate reward: 2% of the discounted merchandise subtotal.
-- It is funded from MarketLink's 5% platform commission, never added to the customer's price.
-- Therefore MarketLink retains 3% gross platform commission before payment/operating costs.

ALTER TABLE affiliates
  ALTER COLUMN commission_pct SET DEFAULT 2.00;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS affiliate_user_id UUID REFERENCES affiliates(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS affiliate_commission_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_net_fee DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS affiliate_user_id UUID REFERENCES affiliates(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS affiliate_commission_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_net_amount DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_user ON orders(affiliate_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_affiliate_user ON commission_records(affiliate_user_id);

COMMENT ON COLUMN affiliates.commission_pct IS 'Affiliate reward percentage funded from MarketLink platform commission; default 2%. Not charged to customer.';
COMMENT ON COLUMN orders.affiliate_commission_amount IS 'Affiliate reward paid from MarketLink commission after successful delivery.';
COMMENT ON COLUMN orders.platform_net_fee IS 'MarketLink commission retained after affiliate reward; excludes payment processing/operating costs.';
