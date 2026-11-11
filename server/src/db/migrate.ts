import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Client } from "pg";
import { withDbClient } from "./client.ts";
import { isMainModule } from "../runtime/is-main.ts";

export const initialSchemaMigrationId = "001_initial_schema";

export type SqlMigration = {
  id: string;
  sql: string;
};

const migrationsDir = join(import.meta.dirname, "../../migrations");

export function readInitialSchemaSql() {
  return readFileSync(join(migrationsDir, "001_initial_schema.sql"), "utf8");
}

export function readMigrationFiles(): SqlMigration[] {
  return readdirSync(migrationsDir)
    .filter((fileName) => /^\d{3}_[a-z0-9_]+\.sql$/i.test(fileName))
    .sort()
    .map((fileName) => ({
      id: basename(fileName, ".sql"),
      sql: readFileSync(join(migrationsDir, fileName), "utf8"),
    }));
}

export function tableNamesFromSchemaSql(sql: string) {
  return Array.from(sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi)).map((match) => match[1]);
}

export async function runMigrations(databaseUrl = process.env.DATABASE_URL) {
  const migrations = readMigrationFiles();
  await withDbClient((client) => runSqlMigrations(client, migrations), databaseUrl);
}

export async function runSqlMigrations(client: Pick<Client, "query">, migrations: SqlMigration[]) {
  await client.query("begin");
  try {
    await ensureSchemaMigrationsTable(client);

    for (const migration of migrations) {
      const recorded = await client.query<{ id: string }>("select id from schema_migrations where id = $1", [migration.id]);
      if (recorded.rows.length > 0) continue;

      if (migration.id === initialSchemaMigrationId && (await hasBaselineSchema(client, tableNamesFromSchemaSql(migration.sql)))) {
        await recordMigration(client, migration.id);
        continue;
      }

      await client.query(migration.sql);
      await recordMigration(client, migration.id);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function runInitialSchemaMigration(client: Pick<Client, "query">, sql: string) {
  const tableNames = tableNamesFromSchemaSql(sql);

  await client.query("begin");
  try {
    await ensureSchemaMigrationsTable(client);

    const recorded = await client.query<{ id: string }>("select id from schema_migrations where id = $1", [initialSchemaMigrationId]);
    if (recorded.rows.length > 0) {
      await client.query("commit");
      return;
    }

    if (await hasBaselineSchema(client, tableNames)) {
      await recordMigration(client, initialSchemaMigrationId);
      await client.query("commit");
      return;
    }

    await client.query(sql);
    await recordMigration(client, initialSchemaMigrationId);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function hasBaselineSchema(client: Pick<Client, "query">, tableNames: string[]) {
  const existingTables = await client.query<{ table_name: string }>(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [tableNames],
  );
  const existing = new Set(existingTables.rows.map((row) => row.table_name));
  return tableNames.every((tableName) => existing.has(tableName));
}

async function ensureSchemaMigrationsTable(client: Pick<Client, "query">) {
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function recordMigration(client: Pick<Client, "query">, id: string) {
  await client.query("insert into schema_migrations (id) values ($1) on conflict (id) do nothing", [id]);
}

if (isMainModule(import.meta.url)) {
  await runMigrations();
}
