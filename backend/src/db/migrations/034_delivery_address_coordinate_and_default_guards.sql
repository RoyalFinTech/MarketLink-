-- Guard customer delivery pins and default-address uniqueness.
-- Existing production table is empty; these constraints are safe to add without backfill.
ALTER TABLE public.delivery_addresses
  ADD CONSTRAINT delivery_addresses_coordinates_pair_check
  CHECK ((latitude IS NULL) = (longitude IS NULL));

ALTER TABLE public.delivery_addresses
  ADD CONSTRAINT delivery_addresses_latitude_range_check
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);

ALTER TABLE public.delivery_addresses
  ADD CONSTRAINT delivery_addresses_longitude_range_check
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_addresses_one_default_per_customer
  ON public.delivery_addresses (customer_id)
  WHERE is_default = TRUE;
