-- Rider-controlled delivery prices and expiring GPS-based checkout quotes.
-- New orders must carry a quote ID; legacy orders remain unchanged.
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS delivery_pricing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_base_fee_gmd numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_per_km_fee_gmd numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_min_fee_gmd numeric(10,2);

ALTER TABLE public.riders
  ADD CONSTRAINT riders_delivery_base_fee_range CHECK (delivery_base_fee_gmd IS NULL OR delivery_base_fee_gmd BETWEEN 0 AND 2000),
  ADD CONSTRAINT riders_delivery_per_km_fee_range CHECK (delivery_per_km_fee_gmd IS NULL OR delivery_per_km_fee_gmd BETWEEN 0 AND 500),
  ADD CONSTRAINT riders_delivery_min_fee_range CHECK (delivery_min_fee_gmd IS NULL OR delivery_min_fee_gmd BETWEEN 0.01 AND 5000);

CREATE TABLE IF NOT EXISTS public.rider_delivery_rates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id uuid NOT NULL REFERENCES public.riders(user_id) ON DELETE CASCADE,
  origin_area varchar(120) NOT NULL,
  destination_area varchar(120) NOT NULL,
  fixed_fee_gmd numeric(10,2) NOT NULL CHECK (fixed_fee_gmd BETWEEN 0.01 AND 5000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(origin_area)) > 0),
  CHECK (length(trim(destination_area)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_delivery_rates_route
  ON public.rider_delivery_rates (rider_id, lower(trim(origin_area)), lower(trim(destination_area)));
CREATE INDEX IF NOT EXISTS idx_rider_delivery_rates_rider
  ON public.rider_delivery_rates (rider_id, is_active);

CREATE TABLE IF NOT EXISTS public.delivery_fee_quotes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid NOT NULL REFERENCES public.customers(user_id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(user_id) ON DELETE RESTRICT,
  delivery_address_id uuid NOT NULL REFERENCES public.delivery_addresses(id) ON DELETE RESTRICT,
  rider_id uuid NOT NULL REFERENCES public.riders(user_id) ON DELETE RESTRICT,
  origin_area varchar(500) NOT NULL,
  destination_area varchar(500) NOT NULL,
  pickup_lat numeric(10,7) NOT NULL,
  pickup_lng numeric(10,7) NOT NULL,
  dropoff_lat numeric(10,7) NOT NULL,
  dropoff_lng numeric(10,7) NOT NULL,
  straight_line_distance_km numeric(8,2) NOT NULL CHECK (straight_line_distance_km > 0),
  route_distance_km numeric(8,2) NOT NULL CHECK (route_distance_km > 0),
  pricing_mode varchar(20) NOT NULL CHECK (pricing_mode IN ('route_fixed','per_kilometre')),
  base_fee_gmd numeric(10,2),
  per_km_fee_gmd numeric(10,2),
  minimum_fee_gmd numeric(10,2),
  delivery_fee_gmd numeric(10,2) NOT NULL CHECK (delivery_fee_gmd > 0),
  status varchar(20) NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted','consumed','expired','cancelled')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  order_id uuid UNIQUE REFERENCES public.orders(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_fee_quotes_customer_expiry
  ON public.delivery_fee_quotes (customer_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_delivery_fee_quotes_rider_expiry
  ON public.delivery_fee_quotes (rider_id, status, expires_at);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee_quote_id uuid REFERENCES public.delivery_fee_quotes(id);

ALTER TABLE public.rider_delivery_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_fee_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_delivery_rates FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.delivery_fee_quotes FROM anon, authenticated, PUBLIC;

COMMENT ON COLUMN public.riders.delivery_pricing_enabled IS 'Rider must explicitly configure a price before appearing in customer delivery quotes.';
COMMENT ON TABLE public.rider_delivery_rates IS 'Optional fixed rider fees for exact pickup-area to dropoff-area lanes; these override the per-kilometre formula.';
COMMENT ON TABLE public.delivery_fee_quotes IS 'Server-only, expiring delivery price snapshots. A quote is consumed once when the customer places an order.';
COMMENT ON COLUMN public.orders.delivery_fee_quote_id IS 'Delivery fee and selected rider locked before the customer pays.';
