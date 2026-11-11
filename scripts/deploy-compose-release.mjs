#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
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
const baseUrl = normalizeBaseUrl(readOption("--base-url") ?? releaseEnv.RELEASE_BASE_URL ?? `http://127.0.0.1:${releaseEnv.HTTP_PORT ?? "80"}`);
const composeEnv = deriveComposeEnv(releaseEnv, baseUrl);
const writeChecks = hasFlag("--write");
const writeMarker = readOption("--write-marker") ?? releaseEnv.RELEASE_WRITE_MARKER ?? new Date().toISOString();

try {
  if (!hasFlag("--skip-preflight")) {
    await run("release preflight", "node", ["scripts/preflight-server-release.mjs", "--compose", "--release-env-file", envFile], { env: composeEnv });
  }

  await run("docker compose config", "docker", ["compose", "config", "--quiet"]);
  await run("docker compose up", "docker", ["compose", "up", "-d", ...(hasFlag("--no-build") ? [] : ["--build"])]);
  await run("database migration", "docker", ["compose", "exec", "-T", "api", "npm", "run", "migrate"]);
  // Production starts empty; demo data must never be injected by deployment.
  await waitForHealth(`${baseUrl}/api/health`);

  await run(
    "release verifier",
    "node",
    [
      "scripts/verify-server-release.mjs",
      "--release-env-file",
      envFile,
      "--base-url",
      baseUrl,
      ...(writeChecks ? ["--write", "--write-marker", writeMarker] : []),
    ],
    {
      env: {
        ...releaseEnv,
        ...composeEnv,
        RELEASE_BASE_URL: baseUrl,
        RELEASE_WRITE_MARKER: writeMarker,
      },
    },
  );

  console.log(`Compose release deployment passed: ${baseUrl}`);
  if (writeChecks) {
    console.log(`Write marker: ${writeMarker}`);
  }
} catch (error) {
  console.error(`Compose release deployment failed: ${error.message}`);
  process.exit(1);
}

function run(label, command, commandArgs, options = {}) {
  console.log(`\n==> ${label}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      env: { ...process.env, ...composeEnv, ...(options.env ?? {}) },
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`));
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

async function waitForHealth(url) {
  console.log(`\n==> wait for health ${url}`);
  const attempts = Number(readOption("--health-attempts") ?? 30);
  const intervalMs = Number(readOption("--health-interval-ms") ?? 2000);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok === true) {
        console.log(`Health check passed after ${attempt} attempt(s).`);
        return;
      }
    } catch {
      // Retry until the API and Nginx have finished starting.
    }

    await sleep(intervalMs);
  }

  throw new Error(`health check did not pass: ${url}`);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/$/, "");
}

function deriveComposeEnv(env, url) {
  const next = { ...env };
  const localPort = inferLocalHttpPort(url);
  if (!next.HTTP_PORT && localPort) {
    next.HTTP_PORT = localPort;
  }
  return next;
}

function inferLocalHttpPort(value) {
  try {
    const url = new URL(value);
    const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);
    if (url.protocol !== "http:" || !localHosts.has(url.hostname) || !url.port) {
      return "";
    }
    return url.port;
  } catch {
    return "";
  }
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
  npm run deploy:compose
  npm run deploy:compose -- --write
  npm run deploy:compose -- --release-env-file .env.production --base-url https://fund.example.com --write

Behavior:
  1. Runs release preflight.
  2. Validates docker compose config.
  3. Builds and starts the Compose stack.
  4. Runs API migrations and seed data inside the api container.
  5. Waits for /api/health through the public base URL.
  6. Runs verify:release, optionally with --write.

Options:
  --release-env-file     Env file to read. Defaults to .env.
  --env-file             Backward-compatible alias; avoid on Node 25 because it conflicts with Node runtime flags.
  --base-url             Public URL for health and release verification.
  --write                Run write release checks.
  --write-marker         Stable suffix for write-check records.
  --skip-preflight       Skip preflight. Use only after a separate preflight pass.
  --no-build             Run docker compose up -d without --build.
  --health-attempts      Health retry count. Defaults to 30.
  --health-interval-ms   Health retry interval. Defaults to 2000.
`);
}
