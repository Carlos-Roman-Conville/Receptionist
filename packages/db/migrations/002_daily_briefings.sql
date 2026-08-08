-- Phase 4: daily briefing delivery tracking

CREATE TABLE daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug TEXT NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_daily_briefings_client_delivered
  ON daily_briefings (client_slug, delivered_at DESC);
