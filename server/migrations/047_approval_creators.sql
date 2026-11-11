alter table reports add column if not exists created_by_user_id text;
alter table meetings add column if not exists created_by_user_id text;
alter table capital_records add column if not exists created_by_user_id text;
