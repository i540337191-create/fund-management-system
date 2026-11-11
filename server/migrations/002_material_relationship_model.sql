create table if not exists portfolio_companies (
  id text primary key,
  name text not null unique,
  short_name text not null,
  industry text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projects
  add column if not exists company_id text references portfolio_companies(id);

create table if not exists fund_company_investments (
  id text primary key,
  fund_id text not null references funds(id) on delete cascade,
  company_id text not null references portfolio_companies(id) on delete cascade,
  project_id text references projects(id) on delete set null,
  investment_label text,
  stage text not null default '未投资',
  status text not null default '跟踪中',
  invested_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table materials
  add column if not exists company_id text references portfolio_companies(id);

alter table materials
  add column if not exists primary_scope text;

alter table materials
  add column if not exists archive_path text;

alter table materials
  add column if not exists original_file_path text;

alter table materials
  add column if not exists recognized_text_path text;

alter table materials
  add column if not exists source_material_id text;

alter table materials
  add column if not exists file_extension text;

alter table materials
  add column if not exists size_bytes bigint;

alter table materials
  add column if not exists sha256 text;

update materials
set archive_path = path
where archive_path is null;

update materials
set primary_scope = case
  when project_id is not null then 'project'
  when fund_id is not null then 'fund'
  else 'unassigned'
end
where primary_scope is null;

alter table materials
  alter column primary_scope set default 'fund';

create table if not exists material_fund_relations (
  material_id text not null references materials(id) on delete cascade,
  fund_id text not null references funds(id) on delete cascade,
  relation_type text not null default 'primary',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (material_id, fund_id, relation_type)
);

create table if not exists material_project_relations (
  material_id text not null references materials(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  relation_type text not null default 'linked',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (material_id, project_id, relation_type)
);

create table if not exists material_company_relations (
  material_id text not null references materials(id) on delete cascade,
  company_id text not null references portfolio_companies(id) on delete cascade,
  relation_type text not null default 'linked',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (material_id, company_id, relation_type)
);

create table if not exists material_investor_relations (
  material_id text not null references materials(id) on delete cascade,
  investor_id text not null references fund_investors(id) on delete cascade,
  relation_type text not null default 'linked',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (material_id, investor_id, relation_type)
);

create table if not exists material_text_chunks (
  id text primary key,
  material_id text not null references materials(id) on delete cascade,
  page_number integer not null,
  chunk_index integer not null,
  content text not null,
  recognized_text_path text not null,
  original_file_path text not null,
  created_at timestamptz not null default now(),
  unique (material_id, page_number, chunk_index)
);

create index if not exists idx_projects_company_id on projects(company_id);
create index if not exists idx_fund_company_investments_fund_id on fund_company_investments(fund_id);
create index if not exists idx_fund_company_investments_company_id on fund_company_investments(company_id);
create index if not exists idx_materials_company_id on materials(company_id);
create index if not exists idx_materials_source_material_id on materials(source_material_id);
create index if not exists idx_material_text_chunks_material_page on material_text_chunks(material_id, page_number);
