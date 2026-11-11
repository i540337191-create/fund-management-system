create table if not exists business_notification_outbox (
 id uuid primary key,
 sequence bigserial not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 delivered_at timestamptz
);
create index if not exists business_notification_outbox_pending on business_notification_outbox(sequence) where delivered_at is null;
