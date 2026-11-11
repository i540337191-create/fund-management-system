alter table reports add column if not exists content_sections jsonb not null default '[]';
alter table report_exports add column if not exists sections_snapshot jsonb not null default '[]';
