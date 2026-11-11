alter table funds
  add column if not exists data_origin text not null default 'seed_demo';

alter table projects
  add column if not exists data_origin text not null default 'seed_demo';

alter table portfolio_companies
  add column if not exists data_origin text not null default 'seed_demo';

alter table fund_company_investments
  add column if not exists data_origin text not null default 'seed_demo';

alter table fund_investors
  add column if not exists data_origin text not null default 'seed_demo';

alter table fund_documents
  add column if not exists data_origin text not null default 'seed_demo';

alter table fund_clause_monitors
  add column if not exists data_origin text not null default 'seed_demo';

alter table tasks
  add column if not exists data_origin text not null default 'seed_demo';

alter table meetings
  add column if not exists data_origin text not null default 'seed_demo';

alter table ai_intake_items
  add column if not exists data_origin text not null default 'seed_demo';

alter table reports
  add column if not exists data_origin text not null default 'seed_demo';

alter table capital_records
  add column if not exists data_origin text not null default 'seed_demo';

alter table audit_events
  add column if not exists data_origin text not null default 'seed_demo';

alter table risks
  add column if not exists data_origin text not null default 'seed_demo';

alter table materials
  add column if not exists data_origin text not null default 'seed_demo';

update materials
set data_origin = case
  when source = '真实物料 / OCR API' then 'source_pdf_ocr'
  when source = '真实物料 / 原始文件' then 'source_file'
  when source like 'AI 收件箱 / %' then 'user_input'
  when source in ('会议纪要', '人工上传') then 'user_input'
  else 'seed_demo'
end;

update fund_investors
set data_origin = 'source_pdf_ocr'
where id ~ '^investor-[0-9a-f]{16}$'
  and commitment_label = '待补充'
  and paid_in_label = '待补充';
