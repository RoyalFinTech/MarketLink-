-- Migration 007: Add soft delete and update tracking to categories
-- Also adds a general-purpose admin_actions audit log that doesn't require
-- the admin to already exist (categories can be seeded before admin exists)

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS meta_title VARCHAR(150),
  ADD COLUMN IF NOT EXISTS meta_description VARCHAR(300),
  ADD COLUMN IF NOT EXISTS product_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id) WHERE deleted_at IS NULL;

-- Trigger for updated_at on categories
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Generic action log (lighter than audit_logs which requires admin FK)
-- Used for category CRUD, system actions, etc.
CREATE TABLE IF NOT EXISTS admin_action_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role  VARCHAR(30),
  action      VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id   VARCHAR(60),
  before_data JSONB,
  after_data  JSONB,
  ip_address  VARCHAR(45),
  user_agent  VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_action_logs_actor ON admin_action_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_entity ON admin_action_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action ON admin_action_logs(action, created_at DESC);

-- Seed default Gambian marketplace categories
INSERT INTO categories (name, slug, icon, sort_order, description) VALUES
  ('Gambian Food',    'gambian-food',    '🍲', 1,  'Traditional Gambian dishes and local cuisine'),
  ('Nigerian Food',   'nigerian-food',   '🍛', 2,  'Nigerian meals and West African dishes'),
  ('International',   'international',   '🌍', 3,  'International cuisine and imported foods'),
  ('Restaurants',     'restaurants',     '🍽️', 4,  'Restaurant orders and dine-in'),
  ('Groceries',       'groceries',       '🛒', 5,  'Fresh produce, pantry staples and household essentials'),
  ('Pharmacies',      'pharmacies',      '💊', 6,  'Medicines, health products and pharmacy items'),
  ('Electronics',     'electronics',     '📱', 7,  'Smartphones, laptops, TVs and electronics'),
  ('Fashion',         'fashion',         '👗', 8,  'Clothing, shoes, bags and accessories'),
  ('Beauty',          'beauty',          '✨', 9,  'Cosmetics, skincare, salons and beauty products'),
  ('Household',       'household',       '🏠', 10, 'Home appliances, furniture and household items'),
  ('Construction',    'construction',    '🏗️', 11, 'Building materials and construction supplies'),
  ('Vehicles',        'vehicles',        '🚗', 12, 'Cars, motorcycles and vehicle accessories'),
  ('Services',        'services',        '🔧', 13, 'Cleaning, plumbing, electrical and other services'),
  ('Digital Goods',   'digital-goods',   '💾', 14, 'Software, e-books and digital products')
ON CONFLICT (slug) DO NOTHING;
