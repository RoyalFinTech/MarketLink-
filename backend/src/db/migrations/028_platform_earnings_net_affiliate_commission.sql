-- Migration 028: record MarketLink's retained commission after affiliate rewards.
-- Affiliate rewards are paid from the platform commission, so the platform
-- earnings ledger must store the net amount retained by MarketLink.
-- This is intentionally additive: it replaces the trigger function only and
-- does not rewrite existing platform_earnings or customer financial records.

CREATE OR REPLACE FUNCTION public.record_marketlink_platform_earning()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND COALESCE(OLD.status, '') <> 'paid' THEN
    INSERT INTO public.platform_earnings (
      order_id,
      gross_merchandise,
      discount_amount,
      commission_pct,
      commission_amount,
      status
    )
    SELECT
      o.id,
      o.subtotal,
      o.discount_amount,
      o.platform_fee_pct,
      GREATEST(
        0,
        CASE
          WHEN o.platform_net_fee <> 0 THEN o.platform_net_fee
          ELSE COALESCE(o.platform_fee, 0) - COALESCE(o.affiliate_commission_amount, 0)
        END
      ),
      'earned'
    FROM public.orders AS o
    WHERE o.id = NEW.order_id
    ON CONFLICT (order_id) DO UPDATE
      SET status = 'earned',
          commission_pct = EXCLUDED.commission_pct,
          commission_amount = EXCLUDED.commission_amount,
          reversed_at = NULL;
  END IF;
  RETURN NEW;
END;
$function$;
