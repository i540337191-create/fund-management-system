create table deal_batches(id text primary key,project_id text not null references projects(id),payload jsonb not null);
create index deal_batches_project_idx on deal_batches(project_id);
