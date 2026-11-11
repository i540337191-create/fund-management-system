-- Existing records without trustworthy creation timestamps remain NULL; defaults affect future inserts only.
do $$ declare tab text; begin
 foreach tab in array array['funds','projects','fund_investors','materials','reports','meetings','fund_documents','fund_clause_monitors','risks','capital_records','ai_intake_items'] loop
  execute format('alter table %I add column if not exists created_at timestamptz',tab);
  execute format('alter table %I alter column created_at set default clock_timestamp()',tab);
  execute format('create index if not exists %I on %I (created_at desc nulls last,id collate "C" asc)',tab||'_creation_order_idx',tab);
 end loop;
end $$;
-- These tables already have reliable insert timestamps; retain those timestamps unchanged.
create index if not exists tasks_creation_order_idx on tasks(created_at desc,id collate "C" asc);
create index if not exists portfolio_companies_creation_order_idx on portfolio_companies(created_at desc,id collate "C" asc);
