-- Permit the Admin communications centre to target explicitly selected users.
ALTER TABLE public.notification_campaigns
  DROP CONSTRAINT IF EXISTS notification_campaigns_audience_check;

ALTER TABLE public.notification_campaigns
  ADD CONSTRAINT notification_campaigns_audience_check
  CHECK (audience IN ('all','customers','vendors','riders','admins','selected'));

-- Keep direct Data API roles away from destructive/DDL-related table privileges.
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;
