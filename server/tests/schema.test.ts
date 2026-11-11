import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationSql = readFileSync(join(import.meta.dirname, "../migrations/001_initial_schema.sql"), "utf8");
const materialRelationshipSql = readFileSync(join(import.meta.dirname, "../migrations/002_material_relationship_model.sql"), "utf8");
const dataProvenanceSql = readFileSync(join(import.meta.dirname, "../migrations/003_data_provenance_labels.sql"), "utf8");
const reportExportDataProvenanceSql = readFileSync(join(import.meta.dirname, "../migrations/004_report_export_data_origin.sql"), "utf8");
const materialPreviewSql = readFileSync(join(import.meta.dirname, "../migrations/005_material_preview_paths.sql"), "utf8");

function tableNames(sql: string) {
  return Array.from(sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi)).map((match) => match[1]);
}

function columnsFor(sql: string, tableName: string) {
  const match = sql.match(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${tableName}\\s*\\(([\\s\\S]*?)\\);`, "i"));
  assert.ok(match, `Missing table ${tableName}`);
  return new Set(Array.from(match[1].matchAll(/^\s*([a-z_]+)\s+/gim)).map((column) => column[1]));
}

test("initial schema includes all server-backed business entities", () => {
  assert.deepEqual(
    tableNames(migrationSql).sort(),
    [
      "ai_intake_items",
      "audit_events",
      "capital_records",
      "fund_activity_logs",
      "fund_clause_monitors",
      "fund_documents",
      "fund_investors",
      "funds",
      "materials",
      "meetings",
      "projects",
      "report_exports",
      "reports",
      "risks",
      "tasks",
      "users",
    ].sort(),
  );
});

test("schema preserves stable frontend ids and current display labels", () => {
  for (const table of ["funds", "projects", "tasks", "ai_intake_items", "audit_events", "report_exports"]) {
    assert.equal(columnsFor(migrationSql, table).has("id"), true, `${table} must keep an id column`);
  }

  assert.equal(columnsFor(migrationSql, "projects").has("description"), true);
  assert.equal(columnsFor(migrationSql, "projects").has("thesis"), true);
  assert.equal(columnsFor(migrationSql, "projects").has("next_action"), true);
  assert.equal(columnsFor(migrationSql, "funds").has("next_action"), true);
  assert.equal(columnsFor(migrationSql, "materials").has("raw_project_label"), true);
  assert.equal(columnsFor(migrationSql, "report_exports").has("download_file_name"), true);
});

test("material relationship schema supports fund project company investor and OCR chunk links", () => {
  assert.deepEqual(
    tableNames(materialRelationshipSql).sort(),
    [
      "fund_company_investments",
      "material_company_relations",
      "material_fund_relations",
      "material_investor_relations",
      "material_project_relations",
      "material_text_chunks",
      "portfolio_companies",
    ].sort(),
  );

  assert.equal(columnsFor(materialRelationshipSql, "portfolio_companies").has("id"), true);
  assert.equal(columnsFor(materialRelationshipSql, "portfolio_companies").has("name"), true);
  assert.equal(columnsFor(materialRelationshipSql, "fund_company_investments").has("fund_id"), true);
  assert.equal(columnsFor(materialRelationshipSql, "fund_company_investments").has("company_id"), true);
  assert.equal(columnsFor(materialRelationshipSql, "fund_company_investments").has("project_id"), true);
  assert.equal(columnsFor(materialRelationshipSql, "material_text_chunks").has("material_id"), true);
  assert.equal(columnsFor(materialRelationshipSql, "material_text_chunks").has("page_number"), true);
  assert.equal(columnsFor(materialRelationshipSql, "material_text_chunks").has("content"), true);

  assert.match(materialRelationshipSql, /alter table projects\s+add column if not exists company_id text references portfolio_companies\(id\)/i);
  assert.match(materialRelationshipSql, /alter table materials\s+add column if not exists company_id text references portfolio_companies\(id\)/i);
  assert.match(materialRelationshipSql, /alter table materials\s+add column if not exists primary_scope text/i);
});

test("data provenance migration labels seed business data and real source materials", () => {
  for (const table of ["funds", "projects", "portfolio_companies", "fund_investors", "materials", "reports", "capital_records", "meetings", "ai_intake_items"]) {
    assert.match(dataProvenanceSql, new RegExp(`alter table ${table}\\s+add column if not exists data_origin text`, "i"));
  }

  assert.match(dataProvenanceSql, /update materials\s+set data_origin = case/i);
  assert.match(dataProvenanceSql, /source_pdf_ocr/i);
  assert.match(dataProvenanceSql, /source_file/i);
  assert.match(dataProvenanceSql, /seed_demo/i);
});

test("report export provenance migration labels generated exports", () => {
  assert.match(reportExportDataProvenanceSql, /alter table report_exports\s+add column if not exists data_origin text not null default 'system_generated'/i);
  assert.match(reportExportDataProvenanceSql, /update report_exports\s+set data_origin = 'system_generated'/i);
});

test("material preview migration stores generated Office preview paths", () => {
  assert.match(materialPreviewSql, /alter table materials\s+add column if not exists preview_file_path text/i);
  assert.match(materialPreviewSql, /add column if not exists recognized_html_path text/i);
  assert.match(materialPreviewSql, /add column if not exists page_image_manifest_path text/i);
  assert.match(materialPreviewSql, /add column if not exists page_image_dir text/i);
  assert.match(materialPreviewSql, /create index if not exists idx_materials_preview_file_path on materials\(preview_file_path\)/i);
  assert.match(materialPreviewSql, /create index if not exists idx_materials_page_image_manifest_path on materials\(page_image_manifest_path\)/i);
});
