-- Rider contact details and indices for delivery-scoped live tracking.
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(24),
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(24);

-- Existing verified user phone remains the fallback when older rider profiles
-- have not yet supplied a separate delivery mobile number.
UPDATE public.riders r
SET mobile_number = u.phone
FROM public.users u
WHERE u.id = r.user_id
  AND (r.mobile_number IS NULL OR btrim(r.mobile_number) = '')
  AND u.phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rider_location_pings_delivery_recorded
  ON public.rider_location_pings (delivery_id, recorded_at DESC);
