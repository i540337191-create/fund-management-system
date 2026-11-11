alter table materials
  add column if not exists preview_file_path text,
  add column if not exists recognized_html_path text,
  add column if not exists page_image_manifest_path text,
  add column if not exists page_image_dir text;

create index if not exists idx_materials_preview_file_path on materials(preview_file_path);
create index if not exists idx_materials_page_image_manifest_path on materials(page_image_manifest_path);
