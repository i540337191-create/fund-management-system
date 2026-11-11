alter table fund_investors add column revision integer not null default 1;
alter table fund_investors add column contact_name text not null default '';
alter table fund_investors add column contact_phone text not null default '';
alter table fund_investors add column contact_email text not null default '';
create table lp_ledger_state (id boolean primary key default true check(id), payload jsonb not null);
insert into lp_ledger_state values(true,'{"commitments":[],"entries":[],"history":[],"requests":{}}');
