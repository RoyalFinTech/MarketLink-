CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(user_id) ON DELETE CASCADE,
  rider_id UUID REFERENCES riders(user_id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(user_id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('published','flagged','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_review_target CHECK (
    (CASE WHEN product_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN vendor_id  IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN rider_id   IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_vendor ON reviews(vendor_id);
CREATE INDEX idx_reviews_customer ON reviews(customer_id);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(150) NOT NULL,
  body TEXT,
  reference_type VARCHAR(30),
  reference_id UUID,
  channel_inapp BOOLEAN NOT NULL DEFAULT TRUE,
  channel_email BOOLEAN NOT NULL DEFAULT FALSE,
  channel_sms BOOLEAN NOT NULL DEFAULT FALSE,
  channel_push BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_a, participant_b, order_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT,
  attachment_url VARCHAR(500),
  status VARCHAR(10) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','read')),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number VARCHAR(20) NOT NULL UNIQUE,
  raised_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  against_user UUID REFERENCES users(id),
  category VARCHAR(30) NOT NULL CHECK (category IN ('complaint','feedback','vendor_report','rider_report','appeal')),
  order_id UUID REFERENCES orders(id),
  subject VARCHAR(200),
  description TEXT NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','escalated','resolved','closed')),
  assigned_to UUID REFERENCES admins(user_id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_raised_by ON support_tickets(raised_by);

CREATE TABLE support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
