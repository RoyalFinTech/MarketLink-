-- MarketLink vendor taxonomy, direct WhatsApp contacts, and consent-scoped rider location fields.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS business_category_group VARCHAR(80),
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30);

ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(30),
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30),
  ADD COLUMN IF NOT EXISTS location_sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS location_sharing_delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL;

UPDATE public.riders r
SET mobile_number = u.phone
FROM public.users u
WHERE u.id = r.user_id
  AND (r.mobile_number IS NULL OR btrim(r.mobile_number) = '')
  AND u.phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_category_group ON public.vendors (business_category_group);
CREATE INDEX IF NOT EXISTS idx_vendors_whatsapp_number ON public.vendors (whatsapp_number) WHERE whatsapp_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_riders_whatsapp_number ON public.riders (whatsapp_number) WHERE whatsapp_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rider_location_pings_delivery_recorded ON public.rider_location_pings (delivery_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_riders_location_sharing ON public.riders (location_sharing_delivery_id, location_sharing_enabled) WHERE location_sharing_enabled = TRUE;

COMMENT ON COLUMN public.vendors.business_category_group IS 'Customer-facing top-level marketplace group for the vendor business category.';
COMMENT ON COLUMN public.vendors.whatsapp_number IS 'Vendor-supplied WhatsApp contact, separate from the MarketLink account phone.';
COMMENT ON COLUMN public.riders.whatsapp_number IS 'Rider-supplied WhatsApp contact, shown only when appropriate for an assigned delivery.';
COMMENT ON COLUMN public.riders.location_sharing_enabled IS 'True only while rider explicitly consents to GPS sharing for an active delivery.';
COMMENT ON COLUMN public.riders.location_sharing_delivery_id IS 'Active delivery for which rider has consented to share GPS coordinates.';
