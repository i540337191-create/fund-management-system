CREATE TABLE IF NOT EXISTS fund_lifecycle_states (
  fund_id text PRIMARY KEY REFERENCES funds(id),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
