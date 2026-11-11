-- Independent, evidence-backed classification. No production data is classified by migration.
create table source_record_purposes (
  record_type text not null check (length(record_type) > 0),
  record_id text not null check (length(record_id) > 0),
  project_id text not null default '',
  data_purpose text not null check (data_purpose = 'engineering_fixture'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object' and evidence <> '{}'::jsonb),
  classified_by text not null check (length(classified_by) > 0),
  classified_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  primary key (record_type, project_id, record_id)
);

-- New automatic derivations retain source purpose separately from their own classification.
alter table materials add column source_basis jsonb not null default '[]'::jsonb check (jsonb_typeof(source_basis)='array');
alter table tasks add column source_basis jsonb not null default '[]'::jsonb check (jsonb_typeof(source_basis)='array');
alter table fund_documents add column source_basis jsonb not null default '[]'::jsonb check (jsonb_typeof(source_basis)='array');
