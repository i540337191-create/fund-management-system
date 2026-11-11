-- Separate identity metadata revisions from approval and investment state.
alter table portfolio_companies add column if not exists revision integer not null default 1 check (revision > 0);
alter table projects add column if not exists master_revision integer not null default 1 check (master_revision > 0);
create table if not exists master_write_requests (
  request_id uuid primary key,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
