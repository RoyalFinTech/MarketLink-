-- Migration 012: rider_location_pings
--
-- Backend code in src/modules/riders/service.js (updateLocation) and
-- src/modules/delivery/service.js (getTracking) references this table,
-- but no prior migration ever created it. Schema below is derived
-- directly from those two usages, not invented:
--   - riders/service.js INSERT: (rider_id, delivery_id, lat, lng) —
--     delivery_id is explicitly optional (`deliveryId || null`)
--   - delivery/service.js SELECT: lat, lng, recorded_at, filtered by
--     delivery_id, ordered by recorded_at DESC, LIMIT 20
--
-- lat/lng precision (DECIMAL(10,7)) matches riders.current_lat/current_lng
-- exactly (migration 001) rather than introducing a new convention.
-- BIGSERIAL PK matches admin_action_logs (migration 007) — the only other
-- pure high-frequency append-only log table in this schema; a GPS ping
-- table is write-heavy and doesn't need UUID's randomness/overhead.
CREATE TABLE IF NOT EXISTS rider_location_pings (
  id           BIGSERIAL PRIMARY KEY,
  rider_id     UUID NOT NULL REFERENCES riders(user_id) ON DELETE CASCADE,
  delivery_id  UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  lat          DECIMAL(10,7) NOT NULL,
  lng          DECIMAL(10,7) NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Matches the exact query pattern in delivery/service.js getTracking():
-- WHERE delivery_id = $1 ORDER BY recorded_at DESC LIMIT 20
CREATE INDEX IF NOT EXISTS idx_rider_location_pings_delivery
  ON rider_location_pings(delivery_id, recorded_at DESC);

-- Supports any future "this rider's recent pings across deliveries" query;
-- not currently used by existing code, but a natural complement to the
-- delivery-scoped index above given rider_id is the other half of the
-- table's identity.
CREATE INDEX IF NOT EXISTS idx_rider_location_pings_rider
  ON rider_location_pings(rider_id, recorded_at DESC);
