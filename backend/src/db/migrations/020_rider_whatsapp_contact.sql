ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30);

COMMENT ON COLUMN public.riders.whatsapp_number IS
  'Rider-provided WhatsApp contact number, shown only to customers/vendors on orders assigned to that rider.';
