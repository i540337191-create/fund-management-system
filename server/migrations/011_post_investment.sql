create table post_investment_states(project_id text primary key references projects(id),payload jsonb not null);
alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check check(kind in ('manual','review','supplement','diligence','post_clause'));
