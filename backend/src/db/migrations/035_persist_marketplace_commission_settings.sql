-- Persist the commission model used by order creation.
-- Existing environment-based 5% / 2% defaults are copied as initial values.
-- Existing orders are untouched; rates are snapshotted only on future orders.
INSERT INTO public.system_settings (key,value,category,updated_by)
VALUES
  ('marketplace_commission_pct','5.00'::jsonb,'finance',NULL),
  ('affiliate_commission_pct','2.00'::jsonb,'finance',NULL)
ON CONFLICT (key) DO NOTHING;
COMMENT ON COLUMN public.vendors.commission_pct IS
  'Legacy field retained for compatibility; current order settlement uses the global marketplace commission settings in system_settings.';
COMMENT ON COLUMN public.orders.platform_fee_pct IS
  'Snapshot of the gross marketplace commission pool percentage at order placement; affiliate reward is funded within this pool.';
COMMENT ON COLUMN public.orders.affiliate_commission_pct IS
  'Snapshot of the affiliate reward percentage funded from the marketplace commission pool; never added to customer checkout.';
COMMENT ON COLUMN public.orders.platform_net_fee IS
  'MarketLink retained commission after any qualifying affiliate reward; excludes payment processing and operating costs.';
