CREATE TABLE cockpit_states (
 merchant_id uuid PRIMARY KEY REFERENCES merchants(id), state jsonb NOT NULL,
 studio_version text NOT NULL, updated_by text REFERENCES "user"(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cockpit_threads (
 thread_id text PRIMARY KEY, merchant_id uuid NOT NULL REFERENCES merchants(id),
 summary jsonb NOT NULL, messages jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cockpit_threads_tenant_idx ON cockpit_threads(merchant_id, updated_at);
CREATE TABLE ai_turn_cache (
 tool_use_id text PRIMARY KEY, merchant_id uuid NOT NULL REFERENCES merchants(id),
 content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_turn_cache_retention_idx ON ai_turn_cache(created_at);
CREATE TABLE digests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id uuid NOT NULL REFERENCES merchants(id),
 week_start text NOT NULL, body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE UNIQUE INDEX digests_week_idx ON digests(merchant_id, week_start);
