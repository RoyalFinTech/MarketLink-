CREATE TABLE banners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(150),
  image_url VARCHAR(500) NOT NULL,
  link_url VARCHAR(500),
  placement VARCHAR(30) NOT NULL DEFAULT 'homepage_slider' CHECK (placement IN ('homepage_slider','category_top','flash_deal')),
  sort_order INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES admins(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE flash_deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(150) NOT NULL,
  description TEXT,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(user_id) ON DELETE CASCADE,
  discount_pct DECIMAL(5,2) NOT NULL,
  banner_url VARCHAR(500),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','expired','disabled')),
  created_by UUID REFERENCES admins(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_settings (
  key VARCHAR(80) PRIMARY KEY,
  value JSONB NOT NULL,
  category VARCHAR(40) NOT NULL,
  updated_by UUID REFERENCES admins(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  metadata JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id, created_at DESC);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES admins(user_id),
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40),
  target_id UUID,
  before_state JSONB,
  after_state JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_id, created_at DESC);

CREATE TABLE suspensions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  fraud_score SMALLINT,
  suspended_by UUID REFERENCES admins(user_id),
  appeal_status VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (appeal_status IN ('none','pending','approved','denied')),
  appeal_text TEXT,
  investigation_notes TEXT,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_at TIMESTAMPTZ
);

CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  file_url VARCHAR(500) NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  purpose VARCHAR(40) NOT NULL,
  file_size_kb INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
