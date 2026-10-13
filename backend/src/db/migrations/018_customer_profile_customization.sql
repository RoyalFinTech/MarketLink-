-- Custom customer profile fields used by the MarketLink profile editor.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(80),
  ADD COLUMN IF NOT EXISTS bio VARCHAR(280);
