# MarketLink Admin Two-Factor Authenticator Operations

## Behaviour
- Admin accounts keep the existing 4-digit PIN flow while authenticator protection is disabled.
- Once an Admin enables TOTP, Admin login requires the PIN followed by a current six-digit authenticator code. The PIN-only login response is a short-lived challenge and contains no access or refresh token.
- Sensitive Admin money actions use the same account setting: TOTP is required when enabled; otherwise the existing Admin PIN is required. There is no silent fallback from an enabled authenticator to PIN.
- Enabling requires a current Admin PIN, a QR/manual secret scan, and successful verification of the first TOTP code.
- Disabling requires both the Admin PIN and a valid authenticator code.
- Login challenges are single-use, expire after five minutes, and authenticator/financial verification endpoints are rate-limited.

## Authenticator compatibility
The implementation uses RFC 6238 TOTP, SHA-1, six digits, and a 30-second period. It is compatible with Google Authenticator, Microsoft Authenticator, and other standard TOTP apps.

## Encryption key
The API encrypts TOTP secrets using AES-256-GCM. Set a stable, randomly generated `ADMIN_TOTP_ENCRYPTION_KEY` of at least 32 characters in the backend environment. If it is not set, the API derives the encryption key from `JWT_ACCESS_SECRET`; that fallback is for compatibility, not the preferred long-term production configuration.

**Do not rotate or replace the active TOTP encryption key without a planned re-encryption migration.** Existing authenticator secrets cannot be decrypted after an unplanned key change. Keep the key in Render's protected environment settings; never place it in frontend code, source control, chat, or logs.

## Deployment sequence
1. Review and merge the pull request after CI passes.
2. Apply migration `047_admin_totp_authenticator.sql` to the production Supabase database through the approved migration process.
3. Configure and securely preserve `ADMIN_TOTP_ENCRYPTION_KEY` in the Render backend environment.
4. Deploy the backend and frontend together. Do not enable TOTP before both deployments and migration are complete.
5. Sign in to the Admin portal with PIN, open the hamburger menu, choose **Two-Factor Authenticator**, scan the QR code, and verify a current code to enable it.
6. Test a fresh login and a controlled non-production financial approval before using it for live money operations.

## Recovery
If the authenticator device is lost, an administrator cannot use PIN-only fallback while TOTP is enabled. Recovery must be performed through a separately authorized account-recovery procedure after identity verification; do not manually clear the encrypted secret in production without an audited recovery plan.

## Current limitation
No recovery-code workflow or multi-device enrollment is implemented in this first version. Keep the authenticator device available and retain the recovery procedure. A future version should add one-time hashed recovery codes and audited device replacement.
