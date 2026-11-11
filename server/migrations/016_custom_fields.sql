create table custom_field_schemas (object_type text primary key check(object_type in ('company','project','fund')), payload jsonb not null);
insert into custom_field_schemas values ('company','{"schemaRevision":0,"fields":[]}'),('project','{"schemaRevision":0,"fields":[]}'),('fund','{"schemaRevision":0,"fields":[]}');
alter table portfolio_companies add column custom_fields jsonb not null default '{}', add column schema_revision integer not null default 0;
alter table projects add column custom_fields jsonb not null default '{}', add column schema_revision integer not null default 0;
alter table funds add column custom_fields jsonb not null default '{}', add column schema_revision integer not null default 0;
