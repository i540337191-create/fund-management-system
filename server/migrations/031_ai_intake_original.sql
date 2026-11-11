ALTER TABLE ai_intake_items ADD COLUMN IF NOT EXISTS source_material_id text REFERENCES materials(id);
ALTER TABLE ai_intake_items ADD COLUMN IF NOT EXISTS source_version_id text;
ALTER TABLE ai_intake_items ADD COLUMN IF NOT EXISTS source_basis jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS ai_intake_original_unique ON ai_intake_items(source_material_id,source_version_id,input_type) WHERE source_material_id IS NOT NULL;
