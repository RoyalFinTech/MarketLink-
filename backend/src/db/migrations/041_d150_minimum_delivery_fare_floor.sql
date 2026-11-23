-- Raise the initial administrator-approved delivery floor to the
-- requested Gambian D150 starter fare. Admin can later change it in Finance.
UPDATE public.system_settings
SET value = jsonb_set(
  COALESCE(value,'{}'::jsonb),
  '{minimumAllowedFeeGmd}',
  '150'::jsonb,
  true
),
updated_at = now()
WHERE key='delivery_pricing_policy'
  AND COALESCE((value->>'minimumAllowedFeeGmd')::numeric,0) < 150;

COMMENT ON COLUMN public.riders.delivery_min_fee_gmd IS
  'Rider-configured minimum delivery fare in GMD; quote service enforces the administrator-approved minimum and maximum.';
