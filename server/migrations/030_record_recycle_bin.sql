create table record_management_state (
 id boolean primary key default true check(id),
 payload jsonb not null
);
insert into record_management_state(id,payload) values(true,'{"entries":[],"requests":{}}'::jsonb);
