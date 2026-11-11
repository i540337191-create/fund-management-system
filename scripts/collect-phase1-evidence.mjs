#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const envFile = readOption("--release-env-file") ?? readOption("--env-file") ?? ".env";
const envFilePath = resolveFromRoot(envFile);
const fileEnv = existsSync(envFilePath) ? readEnvFile(envFilePath) : {};
const releaseEnv = { ...fileEnv, ...process.env };
const baseUrl = normalizeBaseUrl(readOption("--base-url") ?? releaseEnv.RELEASE_BASE_URL ?? "");
const email = readOption("--email") ?? releaseEnv.ADMIN_EMAIL;
const password = readOption("--password") ?? releaseEnv.ADMIN_PASSWORD;
const writeMarker = readOption("--write-marker") ?? releaseEnv.RELEASE_WRITE_MARKER ?? `phase1-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = resolveFromRoot(readOption("--output-dir") ?? `release-evidence/phase1-${writeMarker}`);
const dryRun = hasFlag("--dry-run");
const skipDeploy = hasFlag("--skip-deploy");
const skipRestoreDrill = hasFlag("--skip-restore-drill");
const continueOnFailure = hasFlag("--continue-on-failure");

const commands = buildCommands();
mkdirSync(outputDir, { recursive: true });

const results = [];
const startedAt = new Date().toISOString();
const gitStatus = commandLines("git", ["status", "--short"]);
const gitStatusShort = gitStatus.lines;
const metadata = {
  startedAt,
  repoRoot,
  branch: commandOutput("git", ["branch", "--show-current"]),
  commit: commandOutput("git", ["rev-parse", "HEAD"]),
  git: { available: gitStatus.available, status: gitStatus.status, error: gitStatus.error },
  workingTreeClean: gitStatus.available ? gitStatusShort.length === 0 : null,
  gitStatusShort,
  node: commandOutput(process.execPath, ["--version"]),
  npm: commandOutput("npm", ["--version"]),
  envFile,
  baseUrl,
  writeMarker,
  dryRun,
  skipDeploy,
  skipRestoreDrill,
};

writeJson("metadata.json", metadata);

for (const command of commands) {
  if (dryRun) {
    const planned = { ...command, skipped: true };
    results.push({ name: command.name, status: "planned", exitCode: null, logFile: null });
    writeJson(`planned-${slug(command.name)}.json`, planned);
    continue;
  }

  const result = runCommand(command);
  results.push(result);
  if (result.exitCode !== 0 && !continueOnFailure) break;
}

const finishedAt = new Date().toISOString();
const summary = {
  ok: !dryRun && results.length === commands.length && results.every((result) => result.exitCode === 0),
  dryRun,
  startedAt,
  finishedAt,
  outputDir,
  writeMarker,
  commandsPlanned: commands.length,
  commandsRun: dryRun ? 0 : results.length,
  results,
  nextCommand: dryRun ? null : results.some((result) => result.exitCode !== 0) ? "Inspect failed command log, fix the target environment, then rerun evidence collection." : null,
};

writeJson("summary.json", summary);

if (dryRun) {
  console.log(`Phase 1 evidence dry run written: ${path.relative(repoRoot, outputDir)}`);
  console.log(`Planned commands: ${commands.length}`);
  process.exit(0);
}

console.log(`Phase 1 evidence written: ${path.relative(repoRoot, outputDir)}`);
console.log(`Write marker: ${writeMarker}`);
console.log(summary.ok ? "Phase 1 evidence collection passed." : "Phase 1 evidence collection has failures.");

if (!summary.ok) {
  process.exit(1);
}

function buildCommands() {
  const commands = [
    {
      name: "release-preflight",
      command: "node",
      args: ["scripts/preflight-server-release.mjs", "--compose", "--release-env-file", envFile, "--json"],
    },
    {
      name: "frontend-build",
      command: "npm",
      args: ["run", "build"],
    },
    {
      name: "client-secret-scan",
      command: "npm",
      args: ["run", "check:client-secrets"],
    },
  ];

  if (!skipDeploy) {
    commands.push({
      name: "compose-deploy-write",
      command: "node",
      args: [
        "scripts/deploy-compose-release.mjs",
        "--release-env-file",
        envFile,
        ...(baseUrl ? ["--base-url", baseUrl] : []),
        "--write",
        "--write-marker",
        writeMarker,
      ],
    });
  }

  if (!skipRestoreDrill) {
    commands.push({
      name: "compose-restore-drill",
      command: "node",
      args: ["scripts/drill-compose-backup-restore.mjs", "--release-env-file", envFile, "--expect-write-marker", writeMarker],
    });
  }

  commands.push({
    name: "phase1-final-audit",
    command: "node",
    args: [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      envFile,
      ...(baseUrl ? ["--base-url", baseUrl] : []),
      "--expect-write-marker",
      writeMarker,
      "--json",
    ],
  });

  return commands;
}

function runCommand(step) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...releaseEnv,
      RELEASE_BASE_URL: baseUrl,
      RELEASE_WRITE_MARKER: writeMarker,
      RELEASE_EXPECT_WRITE_MARKER: writeMarker,
      ...(email ? { ADMIN_EMAIL: email } : {}),
      ...(password ? { ADMIN_PASSWORD: password } : {}),
    },
  });
  const finishedAt = new Date().toISOString();
  const logFile = `${slug(step.name)}.log`;
  const log = [
    `$ ${step.command} ${step.args.map(shellQuote).join(" ")}`,
    "",
    "## stdout",
    result.stdout || "",
    "",
    "## stderr",
    result.stderr || "",
  ].join("\n");
  writeFileSync(path.join(outputDir, logFile), log);

  const commandResult = {
    name: step.name,
    command: step.command,
    args: step.args,
    startedAt,
    finishedAt,
    exitCode: result.status,
    signal: result.signal,
    logFile,
  };
  writeJson(`${slug(step.name)}.json`, commandResult);
  return commandResult;
}

function commandOutput(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function commandLines(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: repoRoot, encoding: "utf8" });
  const available = result.status === 0;
  const output = result.stdout?.trim() ?? "";
  return {
    available,
    status: result.status,
    error: available ? null : result.error?.message || result.stderr?.trim() || `Command exited with status ${result.status}`,
    lines: available ? (output ? output.split(/\r?\n/) : []) : null,
  };
}

function writeJson(fileName, data) {
  writeFileSync(path.join(outputDir, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function shellQuote(value) {
  return /^[a-zA-Z0-9_./:=@-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

function slug(value) {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
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
  npm run evidence:phase1 -- --base-url https://fund.example.com --release-env-file .env
  npm run evidence:phase1 -- --release-env-file .env.production --write-marker "<write-marker>"
  npm run evidence:phase1 -- --dry-run

Behavior:
  - Creates an ignored release-evidence/phase1-<marker> folder.
  - Runs preflight, frontend build, client secret scan, Compose deploy with write checks, restore drill, and final Phase 1 audit.
  - Saves command logs plus machine-readable metadata and summary JSON.
  - Reuses one write marker across deploy, restore drill, and final audit.
  - Reads RELEASE_BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, and release markers from --release-env-file unless explicitly overridden.

Options:
  --release-env-file     Env file to read. Defaults to .env.
  --env-file             Backward-compatible alias; avoid on Node 25 because it conflicts with Node runtime flags.
  --base-url             Public release URL.
  --email                Optional admin email override for APP_AUTH_MODE=password.
  --password             Optional admin password override for APP_AUTH_MODE=password. Not written to evidence files.
  --write-marker         Stable marker for release write checks.
  --output-dir           Evidence directory. Defaults to release-evidence/phase1-<marker>.
  --skip-deploy          Skip deploy:compose and only collect checks around an existing deployment.
  --skip-restore-drill   Skip restore drill.
  --continue-on-failure  Keep collecting later commands after a failure.
  --dry-run              Write planned command metadata without executing commands.
`);
}
