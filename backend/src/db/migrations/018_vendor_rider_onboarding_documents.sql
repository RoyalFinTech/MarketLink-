ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS id_document_url TEXT,
  ADD COLUMN IF NOT EXISTS shop_photo_url TEXT;
ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS id_document_url TEXT,
  ADD COLUMN IF NOT EXISTS license_document_url TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_photo_url TEXT;
