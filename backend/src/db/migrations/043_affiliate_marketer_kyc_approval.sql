-- Separate free customer referrers from the paid, Admin-approved Affiliate Marketer programme.
-- All private KYC uploads remain in the existing private uploads store.
ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS marketer_status text NOT NULL DEFAULT 'referrer',
  ADD COLUMN IF NOT EXISTS marketer_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketer_approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.affiliates
  DROP CONSTRAINT IF EXISTS affiliates_marketer_status_check;
ALTER TABLE public.affiliates
  ADD CONSTRAINT affiliates_marketer_status_check
  CHECK (marketer_status IN ('referrer','pending','approved','rejected','suspended'));

INSERT INTO public.roles(name)
VALUES ('affiliate_marketer')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.affiliate_marketer_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','suspended')),
  legal_name text NOT NULL,
  residential_address text NOT NULL,
  marketing_channels text[] NOT NULL DEFAULT '{}',
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  marketing_plan text NOT NULL,
  identity_document_file_id uuid NOT NULL REFERENCES public.file_uploads(id) ON DELETE RESTRICT,
  selfie_file_id uuid NOT NULL REFERENCES public.file_uploads(id) ON DELETE RESTRICT,
  address_proof_file_id uuid REFERENCES public.file_uploads(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_marketer_channels_nonempty CHECK (cardinality(marketing_channels) > 0),
  CONSTRAINT affiliate_marketer_plan_length CHECK (char_length(marketing_plan) BETWEEN 30 AND 3000),
  CONSTRAINT affiliate_marketer_rejection_reason_length CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000)
);

CREATE INDEX IF NOT EXISTS affiliate_marketer_applications_status_submitted_idx
  ON public.affiliate_marketer_applications(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_marketer_applications_user_idx
  ON public.affiliate_marketer_applications(user_id);

ALTER TABLE public.affiliate_marketer_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.affiliate_marketer_applications FROM anon, authenticated;
REVOKE ALL ON public.affiliate_marketer_applications FROM PUBLIC;

COMMENT ON TABLE public.affiliate_marketer_applications IS
  'Private Affiliate Marketer KYC and Admin approval records. Access only through authenticated backend routes.';
COMMENT ON COLUMN public.affiliates.marketer_status IS
  'referrer is the default free customer referral state; only approved is commission eligible.';
