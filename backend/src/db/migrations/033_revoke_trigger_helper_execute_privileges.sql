-- MarketLink security hardening: trigger helper functions are not RPC endpoints.
-- Existing triggers continue to execute these functions; application/browser roles
-- do not need direct EXECUTE permission on trigger-only functions.
REVOKE EXECUTE ON FUNCTION public.record_marketlink_platform_earning()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
