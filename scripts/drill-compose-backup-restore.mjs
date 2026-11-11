#!/usr/bin/env node
import { createReadStream, createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const envFile = readOption("--release-env-file") ?? readOption("--env-file") ?? ".env";
const releaseEnv = { ...readEnvFile(resolveFromRoot(envFile)), ...process.env };
const postgresUser = readOption("--postgres-user") ?? releaseEnv.POSTGRES_USER ?? "fundapp";
const postgresPassword = readOption("--postgres-password") ?? releaseEnv.POSTGRES_PASSWORD ?? "fundapp";
const sourceDb = readOption("--source-db") ?? releaseEnv.POSTGRES_DB ?? "fundapp_road_fund";
const restoreDb = readOption("--restore-db") ?? releaseEnv.RESTORE_POSTGRES_DB ?? "fundapp_road_restore";
const apiPort = readOption("--api-port") ?? "8792";
const apiContainerName = readOption("--api-container") ?? "fund-management-restore-api";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const dumpFile = resolveFromRoot(readOption("--file") ?? `backups/compose-restore-drill-${timestamp}.dump`);
const baseUrl = normalizeBaseUrl(readOption("--base-url") ?? `http://127.0.0.1:${apiPort}`);
const expectedTaskName = readOption("--expect-task-name") ?? releaseEnv.RELEASE_EXPECT_TASK_NAME;
const expectedWriteMarker = readOption("--expect-write-marker") ?? releaseEnv.RELEASE_EXPECT_WRITE_MARKER ?? releaseEnv.RELEASE_WRITE_MARKER;

try {
  await mkdir(path.dirname(dumpFile), { recursive: true });
  await run("drop previous restore API", "docker", ["rm", "-f", apiContainerName], { allowFailure: true });
  await dumpSourceDatabase(dumpFile);
  await recreateRestoreDatabase();
  await restoreDump(dumpFile);
  await startRestoreApi();
  await waitForHealth(`${baseUrl}/api/health`);
  await verifyRestoredApi();

  console.log(`Compose backup/restore drill passed: ${path.relative(repoRoot, dumpFile)}`);
  console.log(`Restored database: ${restoreDb}`);
} catch (error) {
  console.error(`Compose backup/restore drill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (!hasFlag("--keep-api")) {
    await run("cleanup restore API", "docker", ["rm", "-f", apiContainerName], { allowFailure: true });
  }
}

async function dumpSourceDatabase(outputFile) {
  console.log(`\n==> backup ${sourceDb} to ${path.relative(repoRoot, outputFile)}`);
  const output = createWriteStream(outputFile, { flags: "w" });
  const child = spawn(
    "docker",
    ["compose", "exec", "-T", "postgres", "pg_dump", "-U", postgresUser, "-d", sourceDb, "--format=custom"],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "inherit"] },
  );

  const outputFinished = waitForStream(output, "write backup file");
  child.stdout.pipe(output, { end: false });
  await waitForChild(child, "backup source database");
  output.end();
  await outputFinished;
}

async function recreateRestoreDatabase() {
  await run("drop restore database", "docker", ["compose", "exec", "-T", "postgres", "dropdb", "--if-exists", "-U", postgresUser, restoreDb]);
  await run("create restore database", "docker", ["compose", "exec", "-T", "postgres", "createdb", "-U", postgresUser, restoreDb]);
}

async function restoreDump(inputFile) {
  console.log(`\n==> restore ${path.relative(repoRoot, inputFile)} into ${restoreDb}`);
  const input = createReadStream(inputFile);
  const child = spawn(
    "docker",
    ["compose", "exec", "-T", "postgres", "pg_restore", "--single-transaction", "--exit-on-error", "--clean", "--if-exists", "--no-owner", "-U", postgresUser, "-d", restoreDb],
    { cwd: repoRoot, stdio: ["pipe", "inherit", "inherit"] },
  );

  input.pipe(child.stdin);
  await waitForChild(child, "restore dump");
}

async function startRestoreApi() {
  const databaseUrl = `postgres://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@postgres:5432/${encodeURIComponent(restoreDb)}`;
  await run("start restore API", "docker", [
    "compose",
    "run",
    "-d",
    "--name",
    apiContainerName,
    "-p",
    `${apiPort}:8788`,
    "-e",
    `DATABASE_URL=${databaseUrl}`,
    "-e",
    "API_PORT=8788",
    "-e",
    `APP_AUTH_MODE=${releaseEnv.APP_AUTH_MODE ?? "local-bypass"}`,
    "-e",
    `SESSION_SECRET=${releaseEnv.SESSION_SECRET ?? "dev-session-secret"}`,
    "-e",
    `ADMIN_EMAIL=${releaseEnv.ADMIN_EMAIL ?? "admin@example.local"}`,
    "-e",
    `ADMIN_PASSWORD=${releaseEnv.ADMIN_PASSWORD ?? "fund-management-admin"}`,
    "api",
  ]);
}

async function verifyRestoredApi() {
  const verifyArgs = ["scripts/verify-server-release.mjs", "--base-url", baseUrl];
  if (releaseEnv.ADMIN_EMAIL && releaseEnv.ADMIN_PASSWORD) {
    verifyArgs.push("--email", releaseEnv.ADMIN_EMAIL, "--password", releaseEnv.ADMIN_PASSWORD);
  }
  if (expectedTaskName) {
    verifyArgs.push("--expect-task-name", expectedTaskName);
  }
  if (expectedWriteMarker) {
    verifyArgs.push("--expect-write-marker", expectedWriteMarker);
  }
  await run("verify restored API", "node", verifyArgs);
}

function run(label, command, commandArgs, options = {}) {
  console.log(`\n==> ${label}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: repoRoot, stdio: "inherit", env: { ...process.env, ...releaseEnv } });
    child.on("error", (error) => {
      if (options.allowFailure) {
        resolve();
      } else {
        reject(new Error(`${command} failed to start: ${error.message}`));
      }
    });
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}`));
      }
    });
  });
}

function waitForChild(child, label) {
  return new Promise((resolve, reject) => {
    child.on("error", (error) => {
      reject(new Error(`${label} failed to start: ${error.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}`));
      }
    });
  });
}

function waitForStream(stream, label) {
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", (error) => {
      reject(new Error(`${label} failed: ${error.message}`));
    });
  });
}

async function waitForHealth(url) {
  console.log(`\n==> wait for restored API ${url}`);
  const attempts = Number(readOption("--health-attempts") ?? 30);
  const intervalMs = Number(readOption("--health-interval-ms") ?? 2000);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok === true) {
        console.log(`Restored API health passed after ${attempt} attempt(s).`);
        return;
      }
    } catch {
      // Retry while the temporary API container starts.
    }

    await sleep(intervalMs);
  }

  throw new Error(`restored API health did not pass: ${url}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/$/, "");
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const env = {};
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    env[key] = stripQuotes(rawValue);
  }

  return env;
}

function stripQuotes(value) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printHelp() {
  console.log(`
Usage:
  npm run drill:restore:compose
  npm run drill:restore:compose -- --expect-write-marker "<write-marker>"

Behavior:
  1. Dumps the active Compose PostgreSQL database to a local backup file.
  2. Recreates a separate restore database in the same PostgreSQL container.
  3. Restores the dump into that separate database.
  4. Starts a temporary API container connected to the restored database.
  5. Runs verify:release against the temporary restored API.
  6. Removes the temporary API container unless --keep-api is set.

Options:
  --release-env-file     Env file to read. Defaults to .env.
  --env-file             Backward-compatible alias; avoid on Node 25 because it conflicts with Node runtime flags.
  --file                 Backup file path. Defaults to backups/compose-restore-drill-<timestamp>.dump.
  --source-db            Source database. Defaults to POSTGRES_DB or fundapp_road_fund.
  --restore-db           Restore database. Defaults to RESTORE_POSTGRES_DB or fundapp_road_restore.
  --postgres-user        PostgreSQL user. Defaults to POSTGRES_USER or fundapp.
  --postgres-password    PostgreSQL password. Defaults to POSTGRES_PASSWORD or fundapp.
  --api-port             Host port for temporary restored API. Defaults to 8792.
  --api-container        Temporary API container name. Defaults to fund-management-restore-api.
  --base-url             Temporary API base URL. Defaults to http://127.0.0.1:<api-port>.
  --expect-task-name     Legacy check: assert a release write-check task exists after restore.
  --expect-write-marker  Assert all release write-check records for this marker exist after restore. Defaults to RELEASE_EXPECT_WRITE_MARKER or RELEASE_WRITE_MARKER.
  --keep-api             Keep the temporary restored API container after verification.
`);
}
