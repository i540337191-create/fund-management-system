alter table meetings add column if not exists schedule_status text not null default 'unknown' check (schedule_status in ('unknown','scheduled','in_progress','ended','cancelled'));
alter table meetings add column if not exists starts_at timestamptz;
alter table meetings add column if not exists ends_at timestamptz;
alter table meetings add constraint meeting_schedule_time_order check (ends_at is null or starts_at is not null and ends_at > starts_at);
