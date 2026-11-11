#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {createHash} from "node:crypto";
import { existsSync, readFileSync, realpathSync,statSync,lstatSync,readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const envFile = readOption("--release-env-file") ?? readOption("--env-file") ?? ".env";
const envFilePath = resolveFromRoot(envFile);
const jsonOutput = hasFlag("--json");
const soft = hasFlag("--soft");
const composeMode = hasFlag("--compose");
const allowDirtyWorktree = hasFlag("--allow-dirty-worktree");
const fileEnv = existsSync(envFilePath) ? readEnvFile(envFilePath) : {};
const releaseEnv = { ...fileEnv, ...process.env };
const hasDirectDatabase = hasUsableDatabaseUrl(releaseEnv.DATABASE_URL);
const needsComposeTools = composeMode || !hasDirectDatabase;
const checks = [];

checkFile("docker-compose.yml");
checkFile("server/Dockerfile");
checkFile("Dockerfile.web");
checkFile("Dockerfile.nginx");
checkFile("deploy/nginx.conf");
for(const file of ["server/scripts/extract-document-linux.py","server/scripts/extract-office.py","server/scripts/transcribe-audio.py","server/vendor/asr/whisper-v1.9.5.tar.gz","server/vendor/asr/ggml-small-q5_1.bin","server/scripts/check-runtime.mjs","server/scripts/start-container.mjs","server/harness/package-lock.json","server/harness/runner.mjs","server/scripts/container-entrypoint.sh","server/scripts/prepare-storage.py","server/scripts/restore-files.py","scripts/full-backup.mjs"])checkFile(file);
checkEnvFile();
checkEnvFileGitTracking();

const docker = checkCommand("docker", ["--version"], needsComposeTools);
const dockerCompose = docker.ok ? checkCommand("docker compose", ["compose", "version"], needsComposeTools, "docker") : failedTool("docker compose", needsComposeTools);
const pgDump = checkCommand("pg_dump", ["--version"], hasDirectDatabase);
const pgRestore = checkCommand("pg_restore", ["--version"], hasDirectDatabase);
const psql = checkCommand("psql", ["--version"], hasDirectDatabase);

checkProductionAuth();
checkDatabasePath();
checkBackupRestorePath();
checkAiSettings();
checkSourceHandoff();
checkGitWorkingTree();

const errors = checks.filter((check) => check.level === "error" && !check.ok);
const warnings = checks.filter((check) => check.level === "warn" && !check.ok);
const result = {
  ok: errors.length === 0,
  envFile,
  errors: errors.length,
  warnings: warnings.length,
  checks,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const check of checks) {
    const prefix = check.ok ? "OK" : check.level === "warn" ? "WARN" : "FAIL";
    console.log(`${prefix} ${check.name}: ${check.message}`);
  }
  console.log(result.ok ? "Preflight passed." : "Preflight failed.");
}

if (!soft && !result.ok) {
  process.exit(1);
}

function checkFile(relativePath) {
  const ok = existsSync(path.join(repoRoot, relativePath));
  addCheck(relativePath, ok, ok ? "present" : "missing");
}

function checkEnvFile() {
  if (existsSync(envFilePath)) {
    addCheck("release env file", true, `${envFile} present`);
    return;
  }

  const hasProcessReleaseEnv = ["APP_AUTH_MODE", "SESSION_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"].some((key) => process.env[key]);
  addCheck(
    "release env file",
    hasProcessReleaseEnv,
    hasProcessReleaseEnv
      ? `${envFile} missing; using process environment`
      : `${envFile} missing and release env vars are not set; run npm run prepare:release-env -- --admin-email <email>`,
    hasProcessReleaseEnv ? "warn" : "error",
  );
}

function checkEnvFileGitTracking() {
  if (!existsSync(envFilePath)) {
    addCheck("release env git tracking", true, `${envFile} missing; no env file to track`);
    return;
  }

  const relativeEnvFile = path.relative(realpathSync(repoRoot), realpathSync(envFilePath));
  if (relativeEnvFile.startsWith("..") || path.isAbsolute(relativeEnvFile)) {
    addCheck("release env git tracking", true, `${envFile} is outside the repository and cannot be tracked here`);
    return;
  }

  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativeEnvFile], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  if (tracked.status === 0) {
    addCheck("release env git tracking", false, `${relativeEnvFile} is tracked; move secrets to a gitignored release env file`);
    return;
  }

  if(tracked.status!==0&&tracked.status!==1&&existsSync(path.join(repoRoot,'release-manifest.json'))){
    try{const manifest=JSON.parse(readFileSync(path.join(repoRoot,'release-manifest.json'),'utf8'));if(!manifest.files.some(f=>f.path===relativeEnvFile)&&(statSync(envFilePath).mode&0o077)===0){addCheck('release env isolation',true,'Private env is excluded from the source manifest');return;}}catch{}
  }
  if (tracked.status !== 1) {
    addCheck("release env git tracking", false, `${relativeEnvFile}: git tracking is unavailable; cannot verify whether secrets are tracked`);
    return;
  }

  const ignored = spawnSync("git", ["check-ignore", "-q", "--", relativeEnvFile], { cwd: repoRoot, stdio: "ignore" });
  addCheck(
    "release env git tracking",
    ignored.status === 0,
    ignored.status === 0
      ? `${relativeEnvFile} is ignored and untracked`
      : ignored.status === 1
        ? `${relativeEnvFile} is untracked but not ignored; add it to .gitignore before release`
        : `${relativeEnvFile}: git ignore status is unavailable; cannot verify secret exclusion`,
  );
}

function checkCommand(name, commandArgs, required, command = name) {
  const [binary, ...args] = commandArgsFor(command, commandArgs);
  const result = spawnSync(binary, args, { cwd: repoRoot, stdio: "ignore" });
  const ok = result.status === 0;
  addCheck(name, ok, ok ? "available" : "not available", required ? "error" : "warn");
  return { ok };
}

function failedTool(name, required) {
  addCheck(name, false, "not available because docker is missing", required ? "error" : "warn");
  return { ok: false };
}

function commandArgsFor(command, commandArgs) {
  if (command === "docker") {
    return ["docker", ...commandArgs];
  }

  if (command === "docker compose") {
    return ["docker", ...commandArgs];
  }

  return [command, ...commandArgs];
}

function checkProductionAuth() {
  const authMode = releaseEnv.APP_AUTH_MODE;
  addCheck("APP_AUTH_MODE", authMode === "password", authMode === "password" ? "password mode" : "must be password for server release");

  const sessionSecret = releaseEnv.SESSION_SECRET ?? "";
  const hasSafeSessionSecret =
    Boolean(sessionSecret) && sessionSecret !== "change-me" && sessionSecret !== "dev-session-secret" && sessionSecret.length >= 32;
  addCheck(
    "SESSION_SECRET",
    hasSafeSessionSecret,
    hasSafeSessionSecret ? "non-default value present" : "must be a non-default value with at least 32 characters",
  );

  const adminEmail = releaseEnv.ADMIN_EMAIL ?? "";
  const hasProductionAdminEmail = Boolean(adminEmail) && adminEmail !== "admin@example.local";
  addCheck(
    "ADMIN_EMAIL",
    hasProductionAdminEmail,
    hasProductionAdminEmail ? "production administrator email present" : "must be a production administrator email",
  );

  const adminPassword = releaseEnv.ADMIN_PASSWORD ?? "";
  const hasSafeAdminPassword =
    Boolean(adminPassword) && adminPassword !== "change-me" && adminPassword !== "fund-management-admin" && adminPassword.length >= 12;
  addCheck(
    "ADMIN_PASSWORD",
    hasSafeAdminPassword,
    hasSafeAdminPassword ? "non-default value present" : "must be a non-default value with at least 12 characters",
  );

  const secureCookie = releaseEnv.SESSION_COOKIE_SECURE;
  addCheck(
    "SESSION_COOKIE_SECURE",
    secureCookie === "true",
    secureCookie === "true" ? "enabled" : "set true when the public endpoint uses HTTPS",
    "warn",
  );
}

function checkDatabasePath() {
  const databaseUrl = releaseEnv.DATABASE_URL;
  const postgresPassword = releaseEnv.POSTGRES_PASSWORD;
  const hasSafeComposePassword =
    Boolean(postgresPassword) && !["fundapp", "change-me", "change-me-postgres"].includes(postgresPassword) && postgresPassword.length >= 12;

  if (composeMode) {
    addCheck(
      "database connection",
      hasSafeComposePassword,
      hasSafeComposePassword ? "non-default Compose POSTGRES_PASSWORD present" : "set a non-default 12+ character POSTGRES_PASSWORD for Compose",
    );
    return;
  }

  addCheck(
    "database connection",
    hasDirectDatabase || hasSafeComposePassword,
    hasDirectDatabase ? "DATABASE_URL set" : hasSafeComposePassword ? "non-default Compose POSTGRES_PASSWORD present" : "set DATABASE_URL or a non-default POSTGRES_PASSWORD for Compose",
  );
}

function checkBackupRestorePath() {
  if (hasDirectDatabase && !composeMode) {
    addCheck(
      "backup/restore tools",
      pgDump.ok && pgRestore.ok && psql.ok,
      "DATABASE_URL mode requires pg_dump, pg_restore, and psql on the host",
    );
    return;
  }

  addCheck(
    "backup/restore tools",
    docker.ok && dockerCompose.ok,
    "Compose mode uses docker compose exec for backup and restore",
  );
}

function hasUsableDatabaseUrl(databaseUrl) {
  return Boolean(databaseUrl) && !databaseUrl.includes("fundapp:fundapp@") && !databaseUrl.includes("change-me");
}

function checkAiSettings() {
  addCheck(
    "QWEN_API_KEY",
    Boolean(releaseEnv.QWEN_API_KEY),
    releaseEnv.QWEN_API_KEY ? "present" : "missing; AI chat will return 503 until configured",
    "warn",
  );
}

function checkSourceHandoff() {
  const result = spawnSync("git", ["remote", "-v"], { cwd: repoRoot, encoding: "utf8" });
  const hasRemote = result.status === 0 && result.stdout.trim().length > 0;
  const hasReleasePackageHandoff = existsSync(path.join(repoRoot, "scripts/package-release.mjs"));
  addCheck(
    "source handoff",
    hasRemote || hasReleasePackageHandoff,
    hasRemote
      ? "git remote configured"
      : hasReleasePackageHandoff
        ? "git remote not configured; use npm run package:release:workspace for fingerprinted tarball handoff"
        : "configure git remote or add package:release before server handoff",
    "warn",
  );
}

function checkGitWorkingTree() {
  const result = spawnSync("git", ["status", "--short"], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    const file=path.join(repoRoot,'release-manifest.json');
    try{
      const manifest=JSON.parse(readFileSync(file,'utf8'));
      if(manifest.source!=='working-tree-snapshot'||!Array.isArray(manifest.files)||!manifest.files.length)throw Error();
      for(const item of manifest.files){const target=path.resolve(repoRoot,item.path);if(!target.startsWith(repoRoot+path.sep)||createHash('sha256').update(readFileSync(target)).digest('hex')!==item.sha256)throw Error();}
      const known=new Set(manifest.files.map(item=>item.path)),ignored=new Set(['node_modules','dist','.git','backups','private-material-storage','release-evidence','release-packages','output','__pycache__','.DS_Store']);
      const visit=target=>{const name=path.basename(target);if(ignored.has(name)||(name.startsWith('.env')&&name!=='.env.example')||name.endsWith('.pyc')||name.endsWith('.dump'))return;const info=lstatSync(target);if(info.isSymbolicLink())throw Error();if(info.isDirectory()){for(const entry of readdirSync(target))visit(path.join(target,entry));}else if(!known.has(path.relative(repoRoot,target).split(path.sep).join('/')))throw Error();};
      for(const name of ['assets','deploy','docs','public','scripts','server','src','tests'])if(existsSync(path.join(repoRoot,name)))visit(path.join(repoRoot,name));
      addCheck('source manifest',true,'All packaged source fingerprints verified; no additional source files');
    }catch{addCheck('git working tree',false,'git status is not available; source readiness cannot be verified without a valid release-manifest.json. Use package:release:workspace.');}
    return;
  }

  const statusLines = result.stdout.trim() ? result.stdout.trim().split(/\r?\n/) : [];
  if (statusLines.length === 0) {
    addCheck("git working tree", true, "clean");
    return;
  }

  const summary = statusLines.join("; ");
  addCheck(
    "git working tree",
    allowDirtyWorktree,
    allowDirtyWorktree
      ? `dirty but allowed by --allow-dirty-worktree: ${summary}`
      : `dirty working tree; commit or stash changes before release: ${summary}`,
    allowDirtyWorktree ? "warn" : "error",
  );
}

function addCheck(name, ok, message, level = "error") {
  checks.push({ name, ok, level, message });
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

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
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
  npm run preflight:release
  npm run preflight:release -- --compose
  npm run preflight:release -- --release-env-file .env.production
  npm run preflight:release -- --json --soft

Checks:
  - Required deployment files exist.
  - Docker Compose is available for Compose deployment.
  - Production auth env vars are non-default.
  - Database and backup/restore paths are available.
  - Qwen key and git remote are visible as release warnings.
  - Unknown git working tree status blocks release; --allow-dirty-worktree does not bypass it.
  - Dirty git working tree is blocked unless --allow-dirty-worktree is passed.

The default mode exits non-zero on release-blocking errors. Use --soft to print
the same checks without failing the process.

Use --compose for the Docker Compose release path. It requires a non-default
POSTGRES_PASSWORD even if DATABASE_URL is present in the env file.

Use --allow-dirty-worktree only for local diagnostics or emergency recovery.

To generate a gitignored env file with strong local secrets:
  npm run prepare:release-env -- --admin-email ops@example.com --base-url https://fund.example.com
`);
}
