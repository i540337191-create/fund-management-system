-- Retain the actual export actor even when a configured administrator has no users row.
-- Historical rows stay nullable; no identity is inferred from watermark text.
ALTER TABLE report_exports ADD COLUMN IF NOT EXISTS actor_label text;
