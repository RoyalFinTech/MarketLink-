-- Admin authenticator (TOTP) support. Secrets are AES-256-GCM encrypted by the API.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_totp_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS admin_totp_pending_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS admin_totp_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_totp_last_used_step BIGINT;

CREATE TABLE IF NOT EXISTS admin_totp_login_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_jti TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_totp_challenges_user_expiry
  ON admin_totp_login_challenges(user_id, expires_at)
  WHERE consumed_at IS NULL;
ALTER TABLE admin_totp_login_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_totp_login_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_totp_login_challenges TO service_role;
