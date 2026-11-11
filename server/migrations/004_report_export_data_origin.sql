alter table report_exports
  add column if not exists data_origin text not null default 'system_generated';

update report_exports
set data_origin = 'system_generated';
