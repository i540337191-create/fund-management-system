alter table materials add column if not exists current_version integer;
alter table materials add column if not exists current_version_id uuid;
create table if not exists material_versions (
 id uuid primary key,
 material_id text not null references materials(id),
 version integer not null check (version > 0),
 name text not null,
 size_bytes bigint not null check (size_bytes > 0),
 sha256 text not null,
 mime_type text not null,
 uploaded_by text not null,
 uploaded_by_id text not null,
 created_at timestamptz not null,
 blob_id uuid not null unique,
 request_id uuid not null unique,
 fingerprint text not null,
 audit_event_id text not null references audit_events(id),
 unique(material_id, version)
);
create index if not exists idx_material_versions_material on material_versions(material_id, version);
