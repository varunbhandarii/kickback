ALTER TABLE ai_calls ADD COLUMN thread_id text;
ALTER TABLE ai_calls ADD COLUMN run_id text;
ALTER TABLE ai_calls ADD COLUMN parent_run_id text;
ALTER TABLE ai_calls ADD COLUMN agent_id text;
ALTER TABLE ai_calls ADD COLUMN turn_index integer;
CREATE INDEX ai_calls_run_idx ON ai_calls(merchant_id,run_id);
CREATE TABLE ai_usage (
  merchant_id uuid NOT NULL REFERENCES merchants(id), run_id text NOT NULL,
  thread_id text NOT NULL, parent_run_id text, agent_id text NOT NULL,
  started_at timestamptz NOT NULL, finished_at timestamptz NOT NULL,
  status text NOT NULL, model text, turns integer NOT NULL, tool_calls integer NOT NULL,
  tool_errors integer NOT NULL, first_item_ms integer,
  PRIMARY KEY(merchant_id,run_id)
);
CREATE INDEX ai_usage_retention_idx ON ai_usage(finished_at);
