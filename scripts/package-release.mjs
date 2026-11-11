#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const jsonOutput = hasFlag("--json");
const allowDirtyWorktree = hasFlag("--allow-dirty-worktree");
const ref = readOption("--ref") ?? "HEAD";
const packageName = sanitizeName(readOption("--name") ?? "fund-management-fund-phase1");
const outputDir = resolveFromRoot(readOption("--output-dir") ?? "release-packages");

const gitStatus = runGit(["status", "--short"]);
const gitStatusShort = gitStatus.stdout.split(/\r?\n/).filter(Boolean);
const workingTreeClean = gitStatusShort.length === 0;

if (!workingTreeClean && !allowDirtyWorktree) {
  exitWithError(
    [
      "Refusing to create a release package from a dirty working tree.",
      "Commit or stash local changes first, or pass --allow-dirty-worktree for diagnostics.",
      "",
      gitStatus.stdout.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const commit = runGit(["rev-parse", ref]).stdout.trim();
const shortCommit = runGit(["rev-parse", "--short", ref]).stdout.trim();
const branch = runGit(["branch", "--show-current"], { allowFailure: true }).stdout.trim() || "detached";
const createdAt = new Date().toISOString();
const stamp = createdAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const baseName = `${packageName}-${shortCommit}-${stamp}`;
const archivePath = path.join(outputDir, `${baseName}.tar.gz`);
const manifestPath = path.join(outputDir, `${baseName}.manifest.json`);

mkdirSync(outputDir, { recursive: true });

if (existsSync(archivePath) || existsSync(manifestPath)) {
  exitWithError(`Release package already exists: ${baseName}`);
}

runGit(["archive", "--format=tar.gz", "--output", archivePath, ref]);

const archiveSha256 = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
const manifest = {
  package: {
    name: packageName,
    createdAt,
    archivePath: path.relative(repoRoot, archivePath),
    archiveSha256,
    manifestPath: path.relative(repoRoot, manifestPath),
    source: "git archive",
  },
  git: {
    ref,
    branch,
    commit,
    shortCommit,
    workingTreeClean,
    statusShort: gitStatusShort,
  },
  deploy: {
    documentation: "docs/deployment/server-deploy.md",
    commands: [
      "npm run prepare:release-env -- --output .env.release --admin-email <email>",
      "npm run preflight:release -- --compose --release-env-file .env.release",
      "npm run deploy:compose -- --release-env-file .env.release --write",
      "npm run evidence:phase1 -- --release-env-file .env.release --continue-on-failure",
    ],
  },
  contents: {
    requiredFiles: [
      "docker-compose.yml",
      "Dockerfile.web",
      "Dockerfile.nginx",
      "server/Dockerfile",
      "deploy/nginx.conf",
      "docs/deployment/server-deploy.md",
    ],
    excludesByConstruction: [
      "untracked files",
      "ignored local env files",
      "node_modules",
      "dist",
      "release-evidence",
      "release-packages",
    ],
  },
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const result = {
  ok: true,
  archivePath,
  manifestPath,
  archiveSha256,
  commit,
  branch,
  workingTreeClean,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Release package created: ${path.relative(repoRoot, archivePath)}`);
  console.log(`Manifest: ${path.relative(repoRoot, manifestPath)}`);
  console.log(`Commit: ${shortCommit}`);
  console.log(`SHA256: ${archiveSha256}`);
  if (!workingTreeClean) {
    console.log("Warning: package was generated while the working tree was dirty; manifest records gitStatusShort.");
  }
}

function runGit(gitArgs, { allowFailure = false } = {}) {
  const result = spawnSync("git", gitArgs, { cwd: repoRoot, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    exitWithError(result.stderr.trim() || `git ${gitArgs.join(" ")} failed`);
  }
  return result;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

function sanitizeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "release";
}

function exitWithError(message) {
  if (jsonOutput) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(message);
  }
  process.exit(1);
}

function printHelp() {
  console.log(`Create a server release source package from git archive.

Usage:
  npm run package:release -- [options]

Options:
  --output-dir <dir>         Output directory. Default: release-packages
  --name <name>              Package name prefix. Default: fund-management-fund-phase1
  --ref <git-ref>            Git ref to archive. Default: HEAD
  --allow-dirty-worktree     Allow packaging while local changes exist; manifest records workingTreeClean=false
  --json                     Print machine-readable result
  -h, --help                 Show this help

The manifest points operators to docs/deployment/server-deploy.md and records archiveSha256 for transfer checks.
`);
}
