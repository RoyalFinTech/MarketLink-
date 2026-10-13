ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(24);
CREATE INDEX IF NOT EXISTS idx_riders_whatsapp_number
  ON public.riders (whatsapp_number)
  WHERE whatsapp_number IS NOT NULL;
