-- Admin-controlled delivery defaults for MarketLink Gambia.
-- Riders may override these defaults with their own per-kilometre tariff and
-- pickup-to-destination rates while rider overrides remain enabled.
INSERT INTO public.system_settings (key,value,category)
VALUES (
  'delivery_pricing_policy',
  '{"baseFeeGmd":150,"perKmFeeGmd":10,"minimumFeeGmd":150,"minimumAllowedFeeGmd":1,"maximumFeeGmd":5000,"allowRiderOverrides":true}'::jsonb,
  'delivery'
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.system_settings IS
  'MarketLink runtime settings, including the administrator-controlled delivery pricing policy.';
