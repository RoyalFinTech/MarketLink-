-- MarketLink Admin CRM and support operations
-- Additive only: preserves the existing customer support-ticket schema.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_queue
  ON support_tickets(status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket_created
  ON support_ticket_replies(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS admin_crm_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  note TEXT NOT NULL CHECK (char_length(note) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_crm_notes_user_created
  ON admin_crm_notes(user_id, created_at DESC);
