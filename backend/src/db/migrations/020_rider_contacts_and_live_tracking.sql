-- Rider contact details and consent-scoped delivery location sharing.
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(24),
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(24),
  ADD COLUMN IF NOT EXISTS location_sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS location_sharing_delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL;

-- Keep legacy riders reachable on the primary account number until they add a separate mobile number.
UPDATE public.riders r
SET mobile_number = u.phone
FROM public.users u
WHERE u.id = r.user_id
  AND (r.mobile_number IS NULL OR btrim(r.mobile_number) = '')
  AND u.phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rider_location_pings_delivery_recorded
  ON public.rider_location_pings (delivery_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_riders_location_sharing
  ON public.riders (location_sharing_delivery_id, location_sharing_enabled)
  WHERE location_sharing_enabled = TRUE;

COMMENT ON COLUMN public.riders.whatsapp_number IS 'Rider-supplied WhatsApp number, shown to the customer only for the delivery assigned to that rider.';
COMMENT ON COLUMN public.riders.location_sharing_enabled IS 'True only while the rider has explicitly enabled GPS sharing for an active delivery.';
COMMENT ON COLUMN public.riders.location_sharing_delivery_id IS 'The active delivery for which the rider consented to share GPS coordinates.';
