-- Admin-authored knowledge entries for the MarketLink Assistant.
-- These layer on top of the 35 default/static entries in
-- src/knowledge/marketlink-kb.js — that file is untouched; this table is
-- purely additive. Revision history reuses the existing admin_action_logs
-- table (entity_type='knowledge_entry') rather than a parallel table.
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(200) NOT NULL,
  category        VARCHAR(40) NOT NULL DEFAULT 'general',
  roles           TEXT[] NOT NULL DEFAULT ARRAY['all'],       -- subset of: all, customer, vendor, rider, admin
  question        VARCHAR(500) NOT NULL,
  answer          TEXT NOT NULL,
  details         TEXT,
  keywords        TEXT[] NOT NULL DEFAULT '{}',
  synonyms        TEXT[] NOT NULL DEFAULT '{}',
  examples        TEXT[] NOT NULL DEFAULT '{}',
  related_topics  TEXT[] NOT NULL DEFAULT '{}',
  follow_ups      TEXT[] NOT NULL DEFAULT '{}',
  tone            VARCHAR(20) NOT NULL DEFAULT 'friendly',    -- friendly | neutral | formal
  priority        INT NOT NULL DEFAULT 0,                     -- higher wins ties against default KB
  status          VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_status   ON knowledge_entries(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_category ON knowledge_entries(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_roles    ON knowledge_entries USING GIN(roles);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_keywords ON knowledge_entries USING GIN(keywords);
