-- MarketLink Admin notification campaigns and per-recipient delivery audit
CREATE TABLE IF NOT EXISTS notification_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  body TEXT,
  audience VARCHAR(30) NOT NULL CHECK (audience IN ('all','customers','vendors','riders','admins')),
  channels JSONB NOT NULL DEFAULT '{"inapp":true}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','partial','failed')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_created ON notification_campaigns(created_at DESC);
CREATE TABLE IF NOT EXISTS notification_campaign_recipients (
  id BIGSERIAL PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES notification_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','partial','failed')),
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  delivery_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempted_at TIMESTAMPTZ,
  UNIQUE(campaign_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_campaign_recipients_campaign ON notification_campaign_recipients(campaign_id,status);
