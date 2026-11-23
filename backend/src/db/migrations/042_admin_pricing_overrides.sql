-- Admin pricing override controls.
-- Preserve vendor-listed product prices and rider-owned tariffs as the base
-- values. Admin overrides are separately snapshotted and auditable.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS admin_price_override numeric(12,2),
  ADD COLUMN IF NOT EXISTS admin_price_override_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_price_override_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_price_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_price_override_note text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_admin_price_override_range') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_admin_price_override_range
      CHECK (admin_price_override IS NULL OR (admin_price_override >= 0.01 AND admin_price_override <= 1000000));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_admin_price_override_enabled_has_price') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_admin_price_override_enabled_has_price
      CHECK (admin_price_override_enabled = false OR admin_price_override IS NOT NULL);
  END IF;
END $$;

ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS admin_delivery_pricing_override jsonb,
  ADD COLUMN IF NOT EXISTS admin_delivery_pricing_override_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_delivery_pricing_override_at timestamptz;

COMMENT ON COLUMN public.products.admin_price_override IS
  'Optional Admin-controlled customer-facing retail price. The vendor-listed products.price remains unchanged underneath.';
COMMENT ON COLUMN public.products.admin_price_override_enabled IS
  'When true, the customer catalogue and checkout use admin_price_override instead of the vendor-listed price.';
COMMENT ON COLUMN public.products.admin_price_override_note IS
  'Admin reason for the current retail-price override.';
COMMENT ON COLUMN public.riders.admin_delivery_pricing_override IS
  'Optional Admin-controlled rider fare policy JSON. The rider-owned delivery tariff columns and route-rate rows remain unchanged underneath.';
COMMENT ON COLUMN public.riders.admin_delivery_pricing_override_by IS
  'Administrator who last changed this rider delivery pricing override.';
COMMENT ON COLUMN public.riders.admin_delivery_pricing_override_at IS
  'Timestamp of the last rider delivery pricing override change.';
