alter table funds add column revision integer not null default 1 check (revision > 0);
create table fund_write_requests (
  request_id uuid primary key,
  actor_id text not null,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
