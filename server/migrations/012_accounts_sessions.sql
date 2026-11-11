alter table users add column enabled boolean not null default true;
alter table users add column revision integer not null default 1 check (revision >= 1);

create table auth_sessions (
  session_hash text primary key check (length(session_hash)=64),
  actor_id text not null,
  expires_at timestamptz not null
);
create index auth_sessions_actor on auth_sessions(actor_id);
create index auth_sessions_expiry on auth_sessions(expires_at);

create table account_requests (
  request_id text primary key,
  actor_id text not null,
  fingerprint text not null check (length(fingerprint)=64),
  result jsonb not null,
  created_at timestamptz not null default now()
);
