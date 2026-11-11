alter table meetings add column deleted_at timestamptz;
alter table meetings add column deleted_by text;
alter table meetings add column revision integer not null default 1;
