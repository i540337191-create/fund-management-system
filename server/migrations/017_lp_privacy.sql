-- Append-only privacy history survives relationship removal and investor renames.
create table lp_material_privacy (material_id text primary key);
create table lp_identity_privacy (investor_id text not null, name text not null, primary key(investor_id,name));
insert into lp_material_privacy select distinct material_id from material_investor_relations on conflict do nothing;
insert into lp_material_privacy select id from materials where primary_scope='investor' or category='投资者适当性资料' on conflict do nothing;
insert into lp_identity_privacy select id,name from fund_investors on conflict do nothing;
create function retain_lp_material_privacy() returns trigger language plpgsql as $$
begin
 insert into lp_material_privacy values(new.material_id) on conflict do nothing;
 return new;
end $$;
create trigger retain_lp_material_privacy after insert or update on material_investor_relations for each row execute function retain_lp_material_privacy();
create function retain_lp_identity_privacy() returns trigger language plpgsql as $$
begin
 insert into lp_identity_privacy values(new.id,new.name) on conflict do nothing;
 return new;
end $$;
create trigger retain_lp_identity_privacy after insert or update on fund_investors for each row execute function retain_lp_identity_privacy();

-- Explicit investor classification is evidence even without an individual LP link.
create function retain_lp_classified_material_privacy() returns trigger language plpgsql as $$
begin
 if new.primary_scope='investor' or new.category='投资者适当性资料' then
  insert into lp_material_privacy values(new.id) on conflict do nothing;
 end if;
 if TG_OP='UPDATE' then
  if old.primary_scope='investor' or old.category='投资者适当性资料' then
   insert into lp_material_privacy values(old.id) on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
create trigger retain_lp_classified_material_privacy after insert or update on materials for each row execute function retain_lp_classified_material_privacy();
