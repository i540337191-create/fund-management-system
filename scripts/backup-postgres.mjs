#!/usr/bin/env node
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import {pipeline} from "node:stream/promises";
import { mkdir,unlink } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const envFile = readOption("--release-env-file") ?? readOption("--env-file") ?? ".env";
const envFilePath = resolveFromRoot(envFile);
const fileEnv = existsSync(envFilePath) ? readEnvFile(envFilePath) : {};
const releaseEnv = { ...fileEnv, ...process.env };
const outputFile = resolveFromRoot(readOption("--file") ?? `backups/fund-management-fund-${timestamp}.dump`);
await mkdir(path.dirname(outputFile), { recursive: true });

if (releaseEnv.DATABASE_URL) {
  await run("pg_dump", ["--format=custom", "--file", outputFile, releaseEnv.DATABASE_URL], { cwd: repoRoot, env: releaseEnv });
} else {
  await dockerComposeDump(outputFile);
}

console.log(`Backup written: ${path.relative(repoRoot, outputFile)}`);

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
  npm run backup:db
  npm run backup:db -- --release-env-file .env --file backups/manual.dump

Behavior:
  - Reads .env by default, or --release-env-file when provided.
  - If DATABASE_URL is set in the release env or shell, runs pg_dump against that connection string.
  - Otherwise, runs docker compose exec postgres pg_dump and writes the dump on the host.
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

function dockerComposeDump(outputFile) {
  const user = releaseEnv.POSTGRES_USER ?? "fundapp";
  const database = releaseEnv.POSTGRES_DB ?? "fundapp_road_fund";
  const output = createWriteStream(outputFile, { flags: "w" });
  const child = spawn(
    "docker",
    ["compose", "exec", "-T", "postgres", "pg_dump", "-U", user, "-d", database, "--format=custom"],
    { cwd: repoRoot, env: releaseEnv, stdio: ["ignore", "pipe", "inherit"] },
  );

  return Promise.all([
    pipeline(child.stdout,output),
    new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('docker compose backup failed')));})
  ]).catch(async error=>{child.kill();await unlink(outputFile).catch(()=>{});throw error;});
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
