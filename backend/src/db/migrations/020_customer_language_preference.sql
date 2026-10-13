ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(12) NOT NULL DEFAULT 'en';
