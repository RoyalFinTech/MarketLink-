-- Persist vendor opening schedules and offering types as structured data.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS services_offered VARCHAR(120),
  ADD COLUMN IF NOT EXISTS working_days TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS opening_time TIME,
  ADD COLUMN IF NOT EXISTS closing_time TIME;

-- Ensure concurrent requests cannot create duplicate customer/vendor direct chats.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_unique_direct_pair
  ON conversations (participant_a, participant_b)
  WHERE order_id IS NULL;
