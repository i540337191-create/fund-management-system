alter table projects
  add column manager_label text not null default '',
  add column collaborators text not null default '',
  add column source_channel text not null default '';
