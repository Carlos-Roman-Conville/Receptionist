-- Receptionist initial schema (Phase 1)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('phone', 'web_chat')),
  external_session_id TEXT NOT NULL,
  visitor_email TEXT,
  caller_phone TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (client_slug, channel, external_session_id)
);

CREATE INDEX idx_sessions_client_started ON sessions (client_slug, started_at DESC);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_session ON messages (session_id, created_at);

CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug TEXT NOT NULL,
  session_id UUID REFERENCES sessions (id) ON DELETE SET NULL,
  telnyx_call_control_id TEXT,
  caller_number TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  recording_declined BOOLEAN NOT NULL DEFAULT FALSE,
  classifier_result TEXT,
  outcome TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_calls_client_started ON calls (client_slug, started_at DESC);

CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls (id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions (id) ON DELETE SET NULL,
  verbatim TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retain_until TIMESTAMPTZ
);

CREATE INDEX idx_transcripts_retain ON transcripts (retain_until) WHERE retain_until IS NOT NULL;

CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
  storage_path TEXT,
  deleted_at TIMESTAMPTZ,
  retain_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recordings_retain ON recordings (retain_until) WHERE deleted_at IS NULL;

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug TEXT NOT NULL,
  session_id UUID REFERENCES sessions (id) ON DELETE SET NULL,
  email TEXT,
  phone TEXT,
  lead_score TEXT CHECK (lead_score IN ('hot', 'warm', 'cold')),
  intent TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_leads_client_created ON leads (client_slug, created_at DESC);

CREATE TABLE daily_briefing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug TEXT NOT NULL,
  item_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  included_in_briefing_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_briefing_items_client_pending
  ON daily_briefing_items (client_slug, occurred_at DESC)
  WHERE included_in_briefing_id IS NULL;

CREATE TABLE interaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug TEXT NOT NULL,
  session_id UUID REFERENCES sessions (id) ON DELETE SET NULL,
  call_id UUID REFERENCES calls (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interaction_logs_client ON interaction_logs (client_slug, created_at DESC);

CREATE TABLE rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  client_slug TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
