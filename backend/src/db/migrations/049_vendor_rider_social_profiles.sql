-- Optional public social profile links for vendor discovery and private rider application review.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_social_links_object_check'
  ) THEN
    ALTER TABLE public.vendors
      ADD CONSTRAINT vendors_social_links_object_check
      CHECK (jsonb_typeof(social_links) = 'object');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'riders_social_links_object_check'
  ) THEN
    ALTER TABLE public.riders
      ADD CONSTRAINT riders_social_links_object_check
      CHECK (jsonb_typeof(social_links) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN public.vendors.social_links IS
  'Optional public business social profile URLs supplied during vendor onboarding.';
COMMENT ON COLUMN public.riders.social_links IS
  'Optional public social profile URLs supplied during rider onboarding.';