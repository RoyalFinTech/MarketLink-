-- Migration 010: Customer profile extensions, wishlist backend

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- PostgreSQL does not support `CREATE TRIGGER IF NOT EXISTS` (no version does) —
-- drop-then-create is the correct idempotent pattern here.
DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Ensure wishlist_items table exists (defined in 003 but check idempotently)
CREATE TABLE IF NOT EXISTS wishlist_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(user_id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_customer ON wishlist_items(customer_id, added_at DESC);

-- Loyalty point transactions log
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  UUID NOT NULL REFERENCES customers(user_id) ON DELETE CASCADE,
  points       INT  NOT NULL,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('earned','redeemed','expired','adjustment')),
  description  VARCHAR(255),
  reference_id UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customer_id, created_at DESC);
