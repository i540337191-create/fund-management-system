CREATE TABLE IF NOT EXISTS agent_workspace_state (
 id text PRIMARY KEY CHECK (id = 'workspace'),
 data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
