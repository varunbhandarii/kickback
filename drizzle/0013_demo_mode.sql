ALTER TABLE ai_calls ADD COLUMN actor_kind text NOT NULL DEFAULT 'owner';
ALTER TABLE ai_calls ADD COLUMN actor_key text;
CREATE INDEX ai_calls_day_idx ON ai_calls(created_at);
CREATE TABLE demo_buyers (
  slot integer PRIMARY KEY,
  merchant_slug text NOT NULL,
  email text NOT NULL UNIQUE,
  purpose text NOT NULL DEFAULT 'pay',
  published boolean NOT NULL DEFAULT true,
  vault_enc text,
  customer_key text,
  status text NOT NULL DEFAULT 'cooling',
  reserved_until timestamptz,
  reserved_by text,
  last_reward_at timestamptz,
  last_staged_at timestamptz,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_buyers_purpose_check CHECK (purpose IN ('pay','watch')),
  CONSTRAINT demo_buyers_status_check CHECK (status IN ('ready','staging','cooling','reserved','disabled'))
);
CREATE TABLE demo_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'watch',
  ip_hash text,
  buyer_slot integer,
  state text NOT NULL DEFAULT 'queued',
  order_id text,
  capture_id text,
  reward_id uuid,
  refund_id text,
  note text,
  progress_json jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX demo_runs_created_idx ON demo_runs(created_at);
CREATE TABLE soak_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean NOT NULL DEFAULT false,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure text
);
CREATE INDEX soak_runs_started_idx ON soak_runs(started_at);
