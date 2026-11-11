create table if not exists object_access_state (id boolean primary key default true check(id), payload jsonb not null);
insert into object_access_state(id,payload) values(true,jsonb_build_object('funds',coalesce((select jsonb_object_agg(id,jsonb_build_object('visibility','public','memberIds','[]'::jsonb,'revision',1)) from funds),'{}'::jsonb),'projects','{}'::jsonb)) on conflict do nothing;
