-- Scope changes use a separate revision because changing relationships does not replace the original file.
ALTER TABLE materials ADD COLUMN IF NOT EXISTS scope_revision integer NOT NULL DEFAULT 1;
ALTER TABLE materials ADD CONSTRAINT materials_scope_revision_positive CHECK (scope_revision > 0);
