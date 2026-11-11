#!/usr/bin/env node
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const dumpFile = readOption("--file") ?? args[0];
if (!dumpFile) {
  console.error("Restore requires a dump file. Use: npm run restore:db -- --release-env-file .env --file backups/example.dump");
  process.exit(2);
}

const envFile = readOption("--release-env-file") ?? readOption("--env-file") ?? ".env";
const envFilePath = resolveFromRoot(envFile);
const fileEnv = existsSync(envFilePath) ? readEnvFile(envFilePath) : {};
const releaseEnv = { ...fileEnv, ...process.env };
const inputFile = resolveFromRoot(dumpFile);
await access(inputFile);

if (releaseEnv.DATABASE_URL) {
  await run("pg_restore", ["--single-transaction", "--exit-on-error", "--clean", "--if-exists", "--no-owner", "--dbname", releaseEnv.DATABASE_URL, inputFile], { cwd: repoRoot, env: releaseEnv });
} else {
  await dockerComposeRestore(inputFile);
}

console.log(`Restore completed from: ${path.relative(repoRoot, inputFile)}`);

function hasFlag(flag) {
  return args.includes(flag);
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function printHelp() {
  console.log(`
Usage:
  npm run restore:db -- --release-env-file .env --file backups/manual.dump

Behavior:
  - Reads .env by default, or --release-env-file when provided.
  - If DATABASE_URL is set in the release env or shell, runs pg_restore against that connection string.
  - Otherwise, streams the dump into docker compose exec postgres pg_restore.
`);
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit", ...options });
    child.on("error", (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

function dockerComposeRestore(inputFile) {
  const user = releaseEnv.POSTGRES_USER ?? "fundapp";
  const database = releaseEnv.POSTGRES_DB ?? "fundapp_road_fund";
  const input = createReadStream(inputFile);
  const child = spawn(
    "docker",
    ["compose", "exec", "-T", "postgres", "pg_restore", "--single-transaction", "--exit-on-error", "--clean", "--if-exists", "--no-owner", "-U", user, "-d", database],
    { cwd: repoRoot, env: releaseEnv, stdio: ["pipe", "inherit", "inherit"] },
  );

  input.pipe(child.stdin);

  return new Promise((resolve, reject) => {
    child.on("error", (error) => {
      input.destroy();
      reject(new Error(`docker compose restore failed to start: ${error.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker compose restore exited with code ${code}`));
      }
    });
    input.on("error", reject);
  });
}

function readEnvFile(filePath) {
  const env = {};
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    env[key] = stripQuotes(value);
  }
  return env;
}

function stripQuotes(value) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
