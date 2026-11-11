import assert from "node:assert/strict";
import test from "node:test";
import {
  initialSchemaMigrationId,
  readMigrationFiles,
  runInitialSchemaMigration,
  runSqlMigrations,
  tableNamesFromSchemaSql,
} from "../src/db/migrate.ts";

const schemaSql = `
create table users (id text primary key);
create table funds (id text primary key);
`;

test("tableNamesFromSchemaSql extracts initial schema table names", () => {
  assert.deepEqual(tableNamesFromSchemaSql(schemaSql), ["users", "funds"]);
});

test("runInitialSchemaMigration skips schema SQL when migration is recorded", async () => {
  const client = new FakeMigrationClient({ recordedMigration: true, existingTables: [] });

  await runInitialSchemaMigration(client, schemaSql);

  assert.equal(client.hasExecutedSchemaSql, false);
  assert.equal(client.hasRecordedMigration, false);
  assert.deepEqual(client.transactionStatements, ["begin", "commit"]);
});

test("runInitialSchemaMigration records an untracked existing baseline without replaying schema SQL", async () => {
  const client = new FakeMigrationClient({ recordedMigration: false, existingTables: ["users", "funds"] });

  await runInitialSchemaMigration(client, schemaSql);

  assert.equal(client.hasExecutedSchemaSql, false);
  assert.equal(client.hasRecordedMigration, true);
});

test("runInitialSchemaMigration applies schema SQL and records the migration on a fresh database", async () => {
  const client = new FakeMigrationClient({ recordedMigration: false, existingTables: [] });

  await runInitialSchemaMigration(client, schemaSql);

  assert.equal(client.hasExecutedSchemaSql, true);
  assert.equal(client.hasRecordedMigration, true);
});

test("readMigrationFiles returns SQL migrations in filename order", () => {
  const migrations = readMigrationFiles();
  assert.deepEqual(
    migrations.map((migration) => migration.id),
    [
      "001_initial_schema",
      "002_material_relationship_model",
      "003_data_provenance_labels",
      "004_report_export_data_origin",
      "005_material_preview_paths",
      "006_project_creation_fields",
      "007_material_upload_versions",
      "008_approval_workflow_tasks",
      "009_diligence_cases",
      "010_deal_batches",
      "011_post_investment",
      "012_accounts_sessions",
      "013_fund_master",
      "014_company_project_master",
    "015_source_record_purposes",
    "016_custom_fields",
    "017_lp_privacy",
    "018_lp_ledger",
    "019_ai_conversations",
    "020_object_access",
    "021_report_content",
    "022_fund_lifecycle",
    "023_material_scope",
    "024_company_owner",
    "025_report_export_actor",
    "026_legacy_object_privacy",
    "027_meeting_task_deadline",
    "028_ai_intake_actor_identity",
    "029_meeting_recycle_bin",
    "030_record_recycle_bin",
    "031_ai_intake_original",
      "040_lp_profiles",
      "041_agent_workspace",
      "042_report_template_snapshot", "043_unreceived_capital_date", "044_meeting_schedule", "045_record_creation_order", "046_business_notification_outbox", "047_approval_creators", "048_approval_decision_actors",
    ],
  );
  assert.match(migrations[1].sql, /create table if not exists portfolio_companies/i);
  assert.match(migrations[2].sql, /add column if not exists data_origin/i);
  assert.match(migrations[3].sql, /alter table report_exports\s+add column if not exists data_origin text/i);
  assert.match(migrations[4].sql, /add column if not exists preview_file_path text/i);
});

test("runSqlMigrations applies only unrecorded migrations after baseline", async () => {
  const client = new FakeSqlMigrationClient({ recordedIds: ["001_initial_schema"] });

  await runSqlMigrations(client, [
    { id: "001_initial_schema", sql: "create table users (id text primary key);" },
    { id: "002_material_relationship_model", sql: "create table portfolio_companies (id text primary key);" },
  ]);

  assert.deepEqual(client.appliedSql, ["create table portfolio_companies (id text primary key);"]);
  assert.deepEqual(client.recordedIds, ["002_material_relationship_model"]);
  assert.deepEqual(client.transactionStatements, ["begin", "commit"]);
});

class FakeMigrationClient {
  hasExecutedSchemaSql = false;
  hasRecordedMigration = false;
  transactionStatements: string[] = [];
  private readonly state: { recordedMigration: boolean; existingTables: string[] };

  constructor(state: { recordedMigration: boolean; existingTables: string[] }) {
    this.state = state;
  }

  async query(sql: string, values?: unknown[]) {
    const normalized = sql.trim().toLowerCase();

    if (["begin", "commit", "rollback"].includes(normalized)) {
      this.transactionStatements.push(normalized);
      return { rows: [] };
    }

    if (normalized.startsWith("create table if not exists schema_migrations")) {
      return { rows: [] };
    }

    if (normalized.startsWith("select id from schema_migrations")) {
      return { rows: this.state.recordedMigration ? [{ id: initialSchemaMigrationId }] : [] };
    }

    if (normalized.includes("from information_schema.tables")) {
      const requested = Array.isArray(values?.[0]) ? (values[0] as string[]) : [];
      return { rows: this.state.existingTables.filter((tableName) => requested.includes(tableName)).map((table_name) => ({ table_name })) };
    }

    if (normalized.startsWith("insert into schema_migrations")) {
      this.hasRecordedMigration = true;
      return { rows: [] };
    }

    if (normalized.includes("create table users") && normalized.includes("create table funds")) {
      this.hasExecutedSchemaSql = true;
      return { rows: [] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  }
}

class FakeSqlMigrationClient {
  appliedSql: string[] = [];
  recordedIds: string[] = [];
  transactionStatements: string[] = [];
  private readonly state: { recordedIds: string[] };

  constructor(state: { recordedIds: string[] }) {
    this.state = state;
  }

  async query(sql: string, values?: unknown[]) {
    const normalized = sql.trim().toLowerCase();

    if (["begin", "commit", "rollback"].includes(normalized)) {
      this.transactionStatements.push(normalized);
      return { rows: [] };
    }

    if (normalized.startsWith("create table if not exists schema_migrations")) {
      return { rows: [] };
    }

    if (normalized.startsWith("select id from schema_migrations")) {
      const id = String(values?.[0] ?? "");
      return { rows: this.state.recordedIds.includes(id) ? [{ id }] : [] };
    }

    if (normalized.startsWith("insert into schema_migrations")) {
      this.recordedIds.push(String(values?.[0] ?? ""));
      return { rows: [] };
    }

    if (normalized.startsWith("create table portfolio_companies")) {
      this.appliedSql.push(sql);
      return { rows: [] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  }
}
