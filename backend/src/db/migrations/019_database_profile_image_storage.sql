-- Durable database-backed fallback for public profile photographs when object storage credentials are not configured.
ALTER TABLE public.file_uploads
  ADD COLUMN IF NOT EXISTS content_bytes BYTEA,
  ADD COLUMN IF NOT EXISTS content_type VARCHAR(120),
  ADD COLUMN IF NOT EXISTS storage_backend VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_file_uploads_storage_backend_active
  ON public.file_uploads (storage_backend, created_at DESC)
  WHERE deleted_at IS NULL;
