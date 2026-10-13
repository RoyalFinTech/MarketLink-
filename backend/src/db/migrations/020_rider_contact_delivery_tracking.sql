-- Rider contact channels for customer delivery tracking.
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30),
  ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_rider_location_pings_delivery_recorded
  ON public.rider_location_pings (delivery_id, recorded_at DESC);
