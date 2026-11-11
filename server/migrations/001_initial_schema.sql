create table users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'investment_manager', 'post_investment', 'finance', 'legal', 'viewer')),
  password_hash text,
  created_at timestamptz not null default now()
);

create table funds (
  id text primary key,
  name text not null,
  short_name text not null,
  stage text not null,
  manager_user_id text references users(id),
  scale_label text not null,
  paid_in_label text not null,
  invested_label text not null,
  balance_label text not null,
  next_action text not null,
  updated_at timestamptz not null
);

create table projects (
  id text primary key,
  fund_id text not null references funds(id),
  name text not null,
  short_name text not null,
  industry text not null,
  status text not null,
  stage text not null,
  manager_user_id text references users(id),
  amount_label text not null,
  risk_level text not null,
  latest text not null,
  description text not null,
  thesis text not null,
  next_action text not null,
  updated_at timestamptz not null
);

create table fund_investors (
  id text primary key,
  fund_id text not null references funds(id),
  name text not null,
  type text not null,
  commitment_label text not null,
  paid_in_label text not null,
  suitability_status text not null,
  sign_status text not null,
  updated_at timestamptz not null default now()
);

create table fund_documents (
  id text primary key,
  fund_id text not null references funds(id),
  name text not null,
  category text not null,
  owner_user_id text references users(id),
  archived_at timestamptz not null,
  path text not null
);

create table fund_clause_monitors (
  id text primary key,
  fund_id text not null references funds(id),
  title text not null,
  source text not null,
  trigger text not null,
  owner_user_id text references users(id),
  status text not null,
  updated_at timestamptz not null default now()
);

create table tasks (
  id text primary key,
  project_id text not null references projects(id),
  name text not null,
  type text not null,
  stage text not null,
  owner_user_id text references users(id),
  due_date date not null,
  status text not null,
  priority text not null,
  relation text not null,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table materials (
  id text primary key,
  fund_id text references funds(id),
  project_id text references projects(id),
  raw_project_label text,
  name text not null,
  category text not null,
  owner_user_id text references users(id),
  archived_at timestamptz not null,
  path text not null,
  source text not null,
  status text not null,
  citation_count integer not null default 0
);

create table ai_intake_items (
  id text primary key,
  title text not null,
  input_type text not null,
  source text not null,
  submitted_by_user_id text references users(id),
  submitted_at timestamptz not null,
  summary text not null,
  confidence text not null,
  suggested_fund_id text references funds(id),
  suggested_project_id text references projects(id),
  suggested_project_label text not null,
  suggested_path text not null,
  extracted jsonb not null default '[]'::jsonb,
  generated_tasks jsonb not null default '[]'::jsonb,
  status text not null,
  review_note text,
  updated_at timestamptz not null default now()
);

create table meetings (
  id text primary key,
  project_id text references projects(id),
  raw_project_label text not null,
  title text not null,
  date date not null,
  attendees text not null,
  status text not null,
  summary text not null,
  conclusions jsonb not null default '[]'::jsonb,
  todo_items jsonb not null default '[]'::jsonb,
  risk_items jsonb not null default '[]'::jsonb,
  todos_count integer not null default 0,
  risks_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table risks (
  id text primary key,
  project_id text references projects(id),
  target_label text not null,
  title text not null,
  type text not null,
  source text not null,
  level text not null,
  time timestamptz not null,
  summary text not null,
  status text not null,
  updated_at timestamptz not null default now()
);

create table reports (
  id text primary key,
  fund_id text references funds(id),
  project_id text references projects(id),
  name text not null,
  target text not null,
  type text not null,
  status text not null,
  owner_user_id text references users(id),
  updated_at timestamptz not null
);

create table report_exports (
  id text primary key,
  report_id text references reports(id),
  report_name text not null,
  file_name text not null,
  download_file_name text not null,
  download_mime_type text not null,
  format text not null,
  exported_at timestamptz not null,
  actor_user_id text references users(id),
  watermark text not null,
  sources jsonb not null default '[]'::jsonb
);

create table capital_records (
  id text primary key,
  fund_id text not null references funds(id),
  project_id text references projects(id),
  company text not null,
  received_label text not null,
  received_date date not null,
  rule text not null,
  receivable_label text not null,
  due_date date not null,
  status text not null,
  source text,
  confirmation_status text,
  updated_at timestamptz not null default now()
);

create table audit_events (
  id text primary key,
  module text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  target_name text not null,
  actor_user_id text references users(id),
  actor_name text not null,
  event_time timestamptz not null,
  detail text not null,
  source text,
  created_at timestamptz not null default now()
);

create table fund_activity_logs (
  id text primary key,
  fund_id text not null references funds(id),
  message text not null,
  created_at timestamptz not null default now()
);
