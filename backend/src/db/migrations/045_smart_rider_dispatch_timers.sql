-- Smart rider dispatch deadlines, reminder idempotency and pickup recovery.
ALTER TABLE public.rider_assignments
  ADD COLUMN IF NOT EXISTS response_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_reminder_sent_at TIMESTAMPTZ;

-- Preserve sensible deadlines for assignments created before this feature.
UPDATE public.rider_assignments
SET response_deadline_at = created_at + INTERVAL '90 seconds'
WHERE status = 'pending' AND response_deadline_at IS NULL;

UPDATE public.rider_assignments
SET pickup_deadline_at = COALESCE(responded_at, created_at) + INTERVAL '8 minutes'
WHERE status = 'accepted' AND pickup_deadline_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rider_assignments_pending_dispatch_deadline
  ON public.rider_assignments (response_deadline_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_rider_assignments_accepted_pickup_deadline
  ON public.rider_assignments (pickup_deadline_at, responded_at)
  WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_rider_assignments_delivery_rider_status
  ON public.rider_assignments (delivery_id, rider_id, status);
