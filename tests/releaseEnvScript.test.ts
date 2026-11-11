import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);

test("release package writes a git-archive tarball and manifest without local secrets", () => {
  const repoRoot = createSyntheticReleaseRepo();
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-release-package-"));
  writeFileSync(path.join(repoRoot, "local-change.txt"), "synthetic untracked change\n");
  writeFileSync(path.join(repoRoot, ".env.release"), "SYNTHETIC_TEST_SECRET=never-archive\n");
  for (const dir of ["release-evidence", "node_modules", "dist"]) {
    mkdirSync(path.join(repoRoot, dir));
    writeFileSync(path.join(repoRoot, dir, "synthetic.txt"), "ignored synthetic fixture\n");
  }
  const outputDir = path.join(tempDir, "packages");
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/package-release.mjs",
      "--output-dir",
      outputDir,
      "--allow-dirty-worktree",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.match(result.archivePath, /fund-management-fund-phase1-[a-f0-9]{7,}-\d{8}T\d{6}Z\.tar\.gz$/);
  assert.match(result.manifestPath, /fund-management-fund-phase1-[a-f0-9]{7,}-\d{8}T\d{6}Z\.manifest\.json$/);
  assert.equal(existsSync(result.archivePath), true);
  assert.equal(existsSync(result.manifestPath), true);

  const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
  assert.equal(manifest.package.name, "fund-management-fund-phase1");
  assert.equal(manifest.package.archiveSha256.length, 64);
  assert.equal(manifest.git.workingTreeClean, false);
  assert.ok(manifest.deploy.commands.includes("npm run deploy:compose -- --release-env-file .env.release --write"));

  const archiveList = execFileSync("tar", ["-tzf", result.archivePath], { cwd: repoRoot, encoding: "utf8" });
  assert.match(archiveList, /docker-compose\.yml/);
  assert.match(archiveList, /server\/Dockerfile/);
  assert.match(archiveList, /Dockerfile\.web/);
  assert.match(archiveList, /Dockerfile\.nginx/);
  assert.match(archiveList, /docs\/deployment\/server-deploy\.md/);
  assert.doesNotMatch(archiveList, /\.env\.release/);
  assert.doesNotMatch(archiveList, /release-evidence\//);
  assert.doesNotMatch(archiveList, /node_modules\//);
  assert.doesNotMatch(archiveList, /^dist\//m);
});

test("prepare-release-env writes a password-mode compose env without printing secrets", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-release-env-"));
  const output = path.join(tempDir, ".env.release");
  const stdout = execFileSync(
    process.execPath,
    [
      "scripts/prepare-release-env.mjs",
      "--output",
      output,
      "--admin-email",
      "ops@example.com",
      "--base-url",
      "https://fund.example.com",
      "--write-marker",
      "phase1-fixed-marker",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  const text = readFileSync(output, "utf8");
  assert.match(text, /^APP_AUTH_MODE=password$/m);
  assert.match(text, /^SESSION_COOKIE_SECURE=true$/m);
  assert.match(text, /^ADMIN_EMAIL="ops@example.com"$/m);
  assert.match(text, /^POSTGRES_PASSWORD="[A-Za-z0-9_-]{24,}"$/m);
  assert.match(text, /^SESSION_SECRET="[A-Za-z0-9_-]{48,}"$/m);
  assert.match(text, /^RELEASE_WRITE_MARKER="phase1-fixed-marker"$/m);
  assert.doesNotMatch(text, /^DATABASE_URL=/m);

  const adminPassword = text.match(/^ADMIN_PASSWORD="([^"]+)"$/m)?.[1];
  assert.ok(adminPassword);
  assert.equal(stdout.includes(adminPassword), false);
  assert.match(stdout, /RELEASE_WRITE_MARKER=phase1-fixed-marker/);
  assert.match(stdout, /Next: npm run preflight:release -- --compose --release-env-file/);
});

test("prepare-release-env requires an explicit non-default admin email and refuses overwrites", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-release-env-"));
  const output = path.join(tempDir, ".env.release");
  execFileSync(process.execPath, ["scripts/prepare-release-env.mjs", "--output", output, "--admin-email", "ops@example.com"], {
    cwd: repoRoot,
  });

  const missingEmail = spawnSync(process.execPath, ["scripts/prepare-release-env.mjs", "--output", path.join(tempDir, ".env.missing")], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(missingEmail.status, 0);
  assert.match(missingEmail.stderr, /pass --admin-email/);

  const overwrite = spawnSync(process.execPath, ["scripts/prepare-release-env.mjs", "--output", output, "--admin-email", "ops@example.com"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(overwrite.status, 0);
  assert.match(overwrite.stderr, /already exists/);
});

test("prepare-release-env force overwrite keeps the env file private", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-release-env-mode-"));
  const output = path.join(tempDir, ".env.release");
  writeFileSync(output, "APP_AUTH_MODE=local-bypass\n");
  chmodSync(output, 0o644);

  execFileSync(
    process.execPath,
    [
      "scripts/prepare-release-env.mjs",
      "--output",
      output,
      "--admin-email",
      "ops@example.com",
      "--force",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(statSync(output).mode & 0o777, 0o600);
});

test("restore drill help promotes write-marker restore verification and release env reuse", () => {
  const help = execFileSync(process.execPath, ["scripts/drill-compose-backup-restore.mjs", "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.match(help, /--release-env-file\s+Env file to read/);
  assert.match(help, /--env-file\s+Backward-compatible alias/);
  assert.match(help, /npm run drill:restore:compose -- --expect-write-marker "<write-marker>"/);
  assert.match(help, /--expect-write-marker\s+Assert all release write-check records[\s\S]*Defaults to RELEASE_EXPECT_WRITE_MARKER or RELEASE_WRITE_MARKER/);
  assert.doesNotMatch(help, /--expect-task-name "服务端发布验收任务/);
});

test("restore drill reads RELEASE_WRITE_MARKER from release env for restored API verification", async (t) => {
  const adminEmail = "ops@example.com";
  const adminPassword = "test-password-123";
  const writeMarker = "restore-env-marker-001";
  const runtime = await startRuntimeAuditServer(t, { adminEmail, adminPassword, writeMarker });
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-restore-drill-marker-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFile = path.join(tempDir, ".env.release");
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      `ADMIN_EMAIL=${adminEmail}`,
      `ADMIN_PASSWORD=${adminPassword}`,
      "POSTGRES_USER=fundapp",
      "POSTGRES_PASSWORD=direct-postgres-password-123",
      `RELEASE_WRITE_MARKER=${writeMarker}`,
      "",
    ].join("\n"),
  );
  mkdirDockerStub(binDir);

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "scripts/drill-compose-backup-restore.mjs",
      "--release-env-file",
      envFile,
      "--file",
      path.join(tempDir, "restore.dump"),
      "--base-url",
      runtime.baseUrl,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${path.dirname(process.execPath)}:${process.env.PATH ?? ""}` },
      timeout: 10000,
    },
  );

  assert.match(stdout, /Compose backup\/restore drill passed/);
  assert.match(stdout, /expected write marker task persists/);
  assert.match(stdout, /expected write marker audit events persist/);
});

test("phase1 evidence dry-run writes a reusable command plan without running deployment", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-phase1-evidence-"));
  const outputDir = path.join(tempDir, "evidence");
  execFileSync(
    process.execPath,
    [
      "scripts/collect-phase1-evidence.mjs",
      "--dry-run",
      "--output-dir",
      outputDir,
      "--release-env-file",
      ".env.release",
      "--base-url",
      "https://fund.example.com",
      "--email",
      "ops@example.com",
      "--password",
      "test-password-123",
      "--write-marker",
      "marker-001",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  const summary = JSON.parse(readFileSync(path.join(outputDir, "summary.json"), "utf8"));
  const deployPlan = JSON.parse(readFileSync(path.join(outputDir, "planned-compose-deploy-write.json"), "utf8"));
  const auditPlan = JSON.parse(readFileSync(path.join(outputDir, "planned-phase1-final-audit.json"), "utf8"));

  assert.equal(summary.dryRun, true);
  assert.equal(summary.writeMarker, "marker-001");
  assert.equal(summary.commandsRun, 0);
  assert.ok(deployPlan.args.includes("--write-marker"));
  assert.ok(deployPlan.args.includes("marker-001"));
  assert.ok(auditPlan.args.includes("--expect-write-marker"));
  assert.ok(auditPlan.args.includes("marker-001"));
  assert.ok(!auditPlan.args.includes("test-password-123"));
  assert.ok(!JSON.stringify(auditPlan).includes("test-password-123"));
});

test("phase1 evidence dry-run reads release env without writing secrets to plan files", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-phase1-evidence-env-"));
  const outputDir = path.join(tempDir, "evidence");
  const envFile = path.join(tempDir, ".env.release");
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      "ADMIN_EMAIL=ops@example.com",
      "ADMIN_PASSWORD=test-password-123",
      "RELEASE_BASE_URL=https://fund.example.com/",
      "RELEASE_WRITE_MARKER=env-marker-001",
      "POSTGRES_PASSWORD=0123456789abcdef",
      "",
    ].join("\n"),
  );

  execFileSync(
    process.execPath,
    [
      "scripts/collect-phase1-evidence.mjs",
      "--dry-run",
      "--output-dir",
      outputDir,
      "--release-env-file",
      envFile,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  const metadata = JSON.parse(readFileSync(path.join(outputDir, "metadata.json"), "utf8"));
  const summary = JSON.parse(readFileSync(path.join(outputDir, "summary.json"), "utf8"));
  const deployPlan = JSON.parse(readFileSync(path.join(outputDir, "planned-compose-deploy-write.json"), "utf8"));
  const auditPlan = JSON.parse(readFileSync(path.join(outputDir, "planned-phase1-final-audit.json"), "utf8"));
  const evidenceText = JSON.stringify({ metadata, summary, deployPlan, auditPlan });

  assert.equal(metadata.baseUrl, "https://fund.example.com");
  assert.equal(summary.writeMarker, "env-marker-001");
  assert.ok(deployPlan.args.includes("--base-url"));
  assert.ok(deployPlan.args.includes("https://fund.example.com"));
  assert.ok(deployPlan.args.includes("--write-marker"));
  assert.ok(deployPlan.args.includes("env-marker-001"));
  assert.ok(auditPlan.args.includes("--expect-write-marker"));
  assert.ok(auditPlan.args.includes("env-marker-001"));
  assert.equal(evidenceText.includes("test-password-123"), false);
});

test("phase1 evidence metadata records git working tree status", (t) => {
  const repoRoot = createSyntheticReleaseRepo();
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-phase1-evidence-git-"));
  const outputDir = path.join(tempDir, "evidence");
  const dirtyFileName = `.phase1-evidence-dirty-${process.pid}-${Date.now()}`;
  const dirtyFile = path.join(repoRoot, dirtyFileName);
  writeFileSync(dirtyFile, "temporary dirty marker for evidence metadata test\n");
  t.after(() => rmSync(dirtyFile, { force: true }));

  execFileSync(
    process.execPath,
    [
      "scripts/collect-phase1-evidence.mjs",
      "--dry-run",
      "--output-dir",
      outputDir,
      "--release-env-file",
      ".env.release",
      "--write-marker",
      "marker-001",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  const metadata = JSON.parse(readFileSync(path.join(outputDir, "metadata.json"), "utf8"));

  assert.equal(metadata.workingTreeClean, false);
  assert.ok(Array.isArray(metadata.gitStatusShort));
  assert.ok(metadata.gitStatusShort.some((line) => line.includes(dirtyFileName)));
});

test("compose deploy passes release env file into release verifier", async (t) => {
  const adminEmail = "ops@example.com";
  const adminPassword = "test-password-123";
  const writeMarker = "deploy-env-marker-001";
  const runtime = await startRuntimeAuditServer(t, { adminEmail, adminPassword, writeMarker });
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-deploy-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFile = path.join(tempDir, ".env.release");
  const nodeCapture = path.join(tempDir, "node-args.txt");
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      `ADMIN_EMAIL=${adminEmail}`,
      `ADMIN_PASSWORD=${adminPassword}`,
      `RELEASE_BASE_URL=${runtime.baseUrl}`,
      `RELEASE_WRITE_MARKER=${writeMarker}`,
      "POSTGRES_USER=fundapp",
      "POSTGRES_PASSWORD=direct-postgres-password-123",
      "QWEN_API_KEY=qwen-secret-for-deploy-test",
      "",
    ].join("\n"),
  );
  mkdirDockerStub(binDir);
  mkdirNodePassthroughStub(binDir, nodeCapture);

  await execFileAsync(
    process.execPath,
    [
      "scripts/deploy-compose-release.mjs",
      "--release-env-file",
      envFile,
      "--base-url",
      runtime.baseUrl,
      "--skip-preflight",
      "--no-build",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${path.dirname(process.execPath)}:${process.env.PATH ?? ""}` },
      timeout: 10000,
    },
  );

  const verifierArgs = readFileSync(nodeCapture, "utf8").split(/\r?\n/).filter(Boolean);
  assert.ok(verifierArgs.includes("scripts/verify-server-release.mjs"));
  assert.ok(verifierArgs.includes("--release-env-file"));
  assert.ok(verifierArgs.includes(envFile));
});

test("compose deploy derives HTTP_PORT from local base URL for Compose", async (t) => {
  const adminEmail = "ops@example.com";
  const adminPassword = "test-password-123";
  const writeMarker = "deploy-port-marker-001";
  const runtime = await startRuntimeAuditServer(t, { adminEmail, adminPassword, writeMarker });
  const runtimePort = new URL(runtime.baseUrl).port;
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-deploy-port-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFile = path.join(tempDir, ".env.release");
  const dockerEnvCapture = path.join(tempDir, "docker-env.txt");
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      `ADMIN_EMAIL=${adminEmail}`,
      `ADMIN_PASSWORD=${adminPassword}`,
      `RELEASE_WRITE_MARKER=${writeMarker}`,
      "POSTGRES_USER=fundapp",
      "POSTGRES_PASSWORD=direct-postgres-password-123",
      "QWEN_API_KEY=qwen-secret-for-deploy-port-test",
      "",
    ].join("\n"),
  );
  mkdirDockerEnvCaptureStub(binDir, dockerEnvCapture);

  await execFileAsync(
    process.execPath,
    [
      "scripts/deploy-compose-release.mjs",
      "--release-env-file",
      envFile,
      "--base-url",
      runtime.baseUrl,
      "--skip-preflight",
      "--no-build",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${path.dirname(process.execPath)}:${process.env.PATH ?? ""}` },
      timeout: 10000,
    },
  );

  const captured = readFileSync(dockerEnvCapture, "utf8");
  assert.match(captured, new RegExp(`HTTP_PORT=${runtimePort}`));
});

test("phase1 audit verifies evidence collection release env contract", () => {
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      ".env.release",
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const evidenceChecks = result.checks.filter((check) => check.area === "Evidence collector");

  assert.ok(evidenceChecks.length >= 6);
  assert.equal(evidenceChecks.every((check) => check.status === "ok"), true);
  assert.deepEqual(
    evidenceChecks.map((check) => check.name),
    [
      "readEnvFile(envFilePath)",
      "releaseEnv.RELEASE_BASE_URL",
      "releaseEnv.ADMIN_EMAIL",
      "releaseEnv.ADMIN_PASSWORD",
      "releaseEnv.RELEASE_WRITE_MARKER",
      "...releaseEnv",
      "planned-",
      "commandLines(\"git\", [\"status\", \"--short\"])",
      "workingTreeClean",
      "gitStatusShort",
    ],
  );
});

test("phase1 audit verifies release env generator write-marker contract", () => {
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      ".env.release",
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const generatorChecks = result.checks.filter((check) => check.area === "Release env generator");

  assert.equal(generatorChecks.length, 5);
  assert.equal(generatorChecks.every((check) => check.status === "ok"), true);
  assert.deepEqual(
    generatorChecks.map((check) => check.name),
    [
      "RELEASE_WRITE_MARKER",
      "readOption(\"--write-marker\")",
      "Generated secrets were written to the env file and were not printed.",
      "--write-marker",
      "chmodSync(output, 0o600)",
    ],
  );
});

test("phase1 audit verifies restore drill release marker fallback contract", () => {
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      ".env.release",
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const restoreChecks = result.checks.filter((check) => check.area === "Restore drill");

  assert.deepEqual(
    restoreChecks.map((check) => [check.name, check.status]),
    [
      ["releaseEnv.RELEASE_EXPECT_WRITE_MARKER ?? releaseEnv.RELEASE_WRITE_MARKER", "ok"],
      ["--expect-write-marker", "ok"],
      ["Defaults to RELEASE_EXPECT_WRITE_MARKER or RELEASE_WRITE_MARKER", "ok"],
    ],
  );
});

test("phase1 audit verifies release verifier release marker fallback contract", () => {
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      ".env.release",
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const releaseVerifierChecks = result.checks.filter((check) => check.area === "Release verifier");

  assert.equal(
    releaseVerifierChecks.find((check) => check.name === "releaseEnv.RELEASE_EXPECT_WRITE_MARKER ?? releaseEnv.RELEASE_WRITE_MARKER")
      ?.status,
    "ok",
  );
  assert.equal(
    releaseVerifierChecks.find((check) => check.name === "Defaults to RELEASE_EXPECT_WRITE_MARKER or RELEASE_WRITE_MARKER")?.status,
    "ok",
  );
});

test("phase1 audit verifies compose deploy release env verifier contract", () => {
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      ".env.release",
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const composeDeployChecks = result.checks.filter((check) => check.area === "Compose deploy");

  assert.deepEqual(
    composeDeployChecks.map((check) => [check.name, check.status]),
    [
      ["\"compose\", \"config\", \"--quiet\"", "ok"],
      ["scripts/verify-server-release.mjs", "ok"],
      ["--release-env-file", "ok"],
      ["envFile", "ok"],
      ["RELEASE_BASE_URL: baseUrl", "ok"],
      ["RELEASE_WRITE_MARKER: writeMarker", "ok"],
      ["deriveComposeEnv", "ok"],
      ["HTTP_PORT", "ok"],
    ],
  );
});

test("phase1 audit verifies migration idempotency contract", () => {
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      ".env.release",
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const lifecycleChecks = result.checks.filter((check) => check.area === "Database lifecycle");

  for (const name of [
    "schema_migrations",
    "runInitialSchemaMigration",
    "information_schema.tables",
    "on conflict (id) do nothing",
    "records an untracked existing baseline",
    "applies schema SQL and records the migration",
  ]) {
    assert.equal(lifecycleChecks.find((check) => check.name === name)?.status, "ok", name);
  }
});

test("phase1 audit verifies release package contract", () => {
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      ".env.release",
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const packageChecks = result.checks.filter((check) => check.area === "Release package");

  assert.deepEqual(
    packageChecks.map((check) => [check.name, check.status]),
    [
      ["git archive", "ok"],
      ["archiveSha256", "ok"],
      ["workingTreeClean", "ok"],
      ["--allow-dirty-worktree", "ok"],
      ["release-packages", "ok"],
      ["docs/deployment/server-deploy.md", "ok"],
    ],
  );
});

test("phase1 audit accepts release package handoff when git remote is absent", () => {
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      ".env.release",
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const handoffCheck = result.checks.find((check) => check.area === "Target tools" && check.name === "source handoff");

  assert.equal(handoffCheck?.status, "ok");
  assert.match(handoffCheck?.message ?? "", /package:release/);
});

test("phase1 audit verifies release preflight dirty worktree contract", () => {
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      ".env.release",
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const releasePreflightChecks = result.checks.filter((check) => check.area === "Release preflight");

  assert.deepEqual(
    releasePreflightChecks.map((check) => [check.name, check.status]),
    [
      ["checkEnvFileGitTracking()", "ok"],
      ["\"ls-files\"", "ok"],
      ["\"check-ignore\"", "ok"],
      ["release env git tracking", "ok"],
      ["checkGitWorkingTree()", "ok"],
      ["git status", "ok"],
      ["--allow-dirty-worktree", "ok"],
      ["dirty working tree", "ok"],
    ],
  );
});

test("phase1 audit verifies CI release preflight and non-default database credentials", () => {
  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      ".env.release",
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const preflightChecks = result.checks.filter((check) => check.area === "CI release preflight");
  const credentialChecks = result.checks.filter((check) => check.area === "CI credential guard");

  assert.deepEqual(
    preflightChecks.map((check) => [check.name, check.status]),
    [
      ["npm run preflight:release -- --json", "ok"],
      ["npm run preflight:release -- --compose --json", "ok"],
    ],
  );
  assert.equal(credentialChecks.length, 4);
  assert.equal(credentialChecks.every((check) => check.status === "ok"), true);
});

test("phase1 audit rejects default DATABASE_URL credentials", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-audit-default-db-env-"));
  const envFile = path.join(tempDir, ".env.release");
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      "ADMIN_EMAIL=ops@example.com",
      "ADMIN_PASSWORD=test-password-123",
      "DATABASE_URL=postgres://fundapp:fundapp@localhost:5432/fundapp_road_fund",
      "QWEN_API_KEY=qwen-secret-for-default-db-test",
      "",
    ].join("\n"),
  );

  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      envFile,
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  const databaseCheck = result.checks.find((check) => check.area === "Environment" && check.name === "database credentials");

  assert.equal(databaseCheck?.status, "pending");
  assert.match(databaseCheck?.message ?? "", /set DATABASE_URL or a non-default/);
});

test("phase1 audit uses release env credentials for password-mode runtime login", async (t) => {
  const adminEmail = "ops@example.com";
  const adminPassword = "test-password-123";
  const runtime = await startRuntimeAuditServer(t, { adminEmail, adminPassword });
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-audit-env-"));
  const envFile = path.join(tempDir, ".env.release");
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      `ADMIN_EMAIL=${adminEmail}`,
      `ADMIN_PASSWORD=${adminPassword}`,
      `RELEASE_BASE_URL=${runtime.baseUrl}`,
      "POSTGRES_PASSWORD=0123456789abcdef",
      "QWEN_API_KEY=qwen-secret-for-audit-test",
      "",
    ].join("\n"),
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      envFile,
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8", timeout: 10000 },
  );
  const result = JSON.parse(stdout);
  const loginCheck = result.checks.find((check) => check.area === "Runtime" && check.name === "password login");

  assert.deepEqual(runtime.getLoginPayload(), { email: adminEmail, password: adminPassword });
  assert.equal(loginCheck?.status, "ok");
});

test("phase1 audit uses release env write marker for release readback", async (t) => {
  const adminEmail = "ops@example.com";
  const adminPassword = "test-password-123";
  const writeMarker = "env-marker-001";
  const runtime = await startRuntimeAuditServer(t, { adminEmail, adminPassword, writeMarker });
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-audit-marker-env-"));
  const envFile = path.join(tempDir, ".env.release");
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      `ADMIN_EMAIL=${adminEmail}`,
      `ADMIN_PASSWORD=${adminPassword}`,
      `RELEASE_BASE_URL=${runtime.baseUrl}`,
      `RELEASE_WRITE_MARKER=${writeMarker}`,
      "POSTGRES_PASSWORD=0123456789abcdef",
      "QWEN_API_KEY=qwen-secret-for-audit-marker-test",
      "",
    ].join("\n"),
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      envFile,
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8", timeout: 10000 },
  );
  const result = JSON.parse(stdout);
  const writeMarkerCheck = result.checks.find((check) => check.area === "Runtime" && check.name === "release write marker readback");

  assert.equal(writeMarkerCheck?.status, "ok");
  assert.match(writeMarkerCheck?.message ?? "", /verify:release --expect-write-marker passed/);
});

test("verify release uses release env for base URL and password-mode login", async (t) => {
  const adminEmail = "ops@example.com";
  const adminPassword = "test-password-123";
  const runtime = await startRuntimeAuditServer(t, { adminEmail, adminPassword });
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-verify-env-"));
  const envFile = path.join(tempDir, ".env.release");
  writeFileSync(
    envFile,
    [
      `RELEASE_BASE_URL=${runtime.baseUrl}`,
      `ADMIN_EMAIL=${adminEmail}`,
      `ADMIN_PASSWORD=${adminPassword}`,
      "QWEN_API_KEY=qwen-secret-for-verify-test",
      "",
    ].join("\n"),
  );

  const { stdout } = await execFileAsync(process.execPath, ["scripts/verify-server-release.mjs", "--release-env-file", envFile], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10000,
  });
  const result = JSON.parse(stdout);
  const loginCheck = result.checks.find((check) => check.name === "password login");

  assert.equal(result.baseUrl, runtime.baseUrl);
  assert.deepEqual(runtime.getLoginPayload(), { email: adminEmail, password: adminPassword });
  assert.equal(loginCheck?.ok, true);
});

test("verify release uses RELEASE_WRITE_MARKER from release env for write readback", async (t) => {
  const adminEmail = "ops@example.com";
  const adminPassword = "test-password-123";
  const writeMarker = "verify-env-marker-001";
  const runtime = await startRuntimeAuditServer(t, { adminEmail, adminPassword, writeMarker });
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-verify-marker-env-"));
  const envFile = path.join(tempDir, ".env.release");
  writeFileSync(
    envFile,
    [
      `RELEASE_BASE_URL=${runtime.baseUrl}`,
      `ADMIN_EMAIL=${adminEmail}`,
      `ADMIN_PASSWORD=${adminPassword}`,
      `RELEASE_WRITE_MARKER=${writeMarker}`,
      "QWEN_API_KEY=qwen-secret-for-verify-marker-test",
      "",
    ].join("\n"),
  );

  const { stdout } = await execFileAsync(process.execPath, ["scripts/verify-server-release.mjs", "--release-env-file", envFile], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10000,
  });
  const result = JSON.parse(stdout);

  assert.equal(result.writeChecks, false);
  assert.equal(result.writeMarker, undefined);
  assert.equal(result.checks.find((check) => check.name === "expected write marker task persists")?.ok, true);
  assert.equal(result.checks.find((check) => check.name === "expected write marker audit events persist")?.ok, true);
});

test("backup and restore scripts read DATABASE_URL from release env", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-db-script-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFile = path.join(tempDir, ".env.release");
  const backupCapture = path.join(tempDir, "pg-dump-args.txt");
  const restoreCapture = path.join(tempDir, "pg-restore-args.txt");
  const dumpFile = path.join(tempDir, "manual.dump");
  const releaseDatabaseUrl = "postgres://release-user:release-pass@127.0.0.1:5432/release-db";
  writeFileSync(envFile, `DATABASE_URL=${releaseDatabaseUrl}\n`);
  writeFileSync(dumpFile, "fake dump");
  mkdirExecutableStub(binDir, "pg_dump", backupCapture);
  mkdirExecutableStub(binDir, "pg_restore", restoreCapture);

  const childEnv = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` };
  delete childEnv.DATABASE_URL;

  execFileSync(
    process.execPath,
    ["scripts/backup-postgres.mjs", "--release-env-file", envFile, "--file", path.join(tempDir, "backup.dump")],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );
  execFileSync(
    process.execPath,
    ["scripts/restore-postgres.mjs", "--release-env-file", envFile, "--file", dumpFile],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );

  assert.match(readFileSync(backupCapture, "utf8"), new RegExp(escapeRegExp(releaseDatabaseUrl)));
  assert.match(readFileSync(restoreCapture, "utf8"), new RegExp(escapeRegExp(releaseDatabaseUrl)));
});

test("release preflight direct DATABASE_URL mode accepts host PostgreSQL tools without Docker", () => {
  const repoRoot = createSyntheticReleaseRepo();
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-preflight-direct-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFile = path.join(tempDir, ".env.release");
  const releaseDatabaseUrl = "postgres://fundapp:direct-postgres-password-123@127.0.0.1:5432/fundapp_road_fund";
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      "ADMIN_EMAIL=ops@example.com",
      "ADMIN_PASSWORD=test-password-123",
      `DATABASE_URL=${releaseDatabaseUrl}`,
      "",
    ].join("\n"),
  );
  mkdirExecutableStub(binDir, "pg_dump", path.join(tempDir, "pg-dump-args.txt"));
  mkdirExecutableStub(binDir, "pg_restore", path.join(tempDir, "pg-restore-args.txt"));
  mkdirExecutableStub(binDir, "psql", path.join(tempDir, "psql-args.txt"));

  symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), path.join(binDir, "git"));
  const childEnv = { ...process.env, PATH: binDir };
  delete childEnv.DATABASE_URL;
  delete childEnv.POSTGRES_PASSWORD;

  const { stdout, status } = spawnSync(
    process.execPath,
    ["scripts/preflight-server-release.mjs", "--release-env-file", envFile, "--allow-dirty-worktree", "--json"],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );
  const result = JSON.parse(stdout);
  const dockerCheck = result.checks.find((check) => check.name === "docker");
  const dockerComposeCheck = result.checks.find((check) => check.name === "docker compose");
  const backupRestoreCheck = result.checks.find((check) => check.name === "backup/restore tools");

  assert.equal(status, 0);
  assert.equal(result.ok, true);
  assert.equal(result.errors, 0);
  assert.deepEqual(
    [dockerCheck?.ok, dockerCheck?.level, dockerComposeCheck?.ok, dockerComposeCheck?.level],
    [false, "warn", false, "warn"],
  );
  assert.deepEqual([backupRestoreCheck?.ok, backupRestoreCheck?.level], [true, "error"]);
});

test("release preflight blocks a tracked release env file", () => {
  const repoRoot = createSyntheticReleaseRepo();
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-preflight-tracked-env-"));
  const binDir = path.join(tempDir, "bin");
  const releaseDatabaseUrl = "postgres://fundapp:direct-postgres-password-123@127.0.0.1:5432/fundapp_road_fund";
  mkdirExecutableStub(binDir, "pg_dump", path.join(tempDir, "pg-dump-args.txt"));
  mkdirExecutableStub(binDir, "pg_restore", path.join(tempDir, "pg-restore-args.txt"));
  mkdirExecutableStub(binDir, "psql", path.join(tempDir, "psql-args.txt"));

  const childEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    APP_AUTH_MODE: "password",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    ADMIN_EMAIL: "ops@example.com",
    ADMIN_PASSWORD: "test-password-123",
    DATABASE_URL: releaseDatabaseUrl,
  };

  const { stdout, status } = spawnSync(
    process.execPath,
    ["scripts/preflight-server-release.mjs", "--release-env-file", ".env.example", "--allow-dirty-worktree", "--json"],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );
  const result = JSON.parse(stdout);
  const envTrackingCheck = result.checks.find((check) => check.name === "release env git tracking");

  assert.notEqual(status, 0);
  assert.equal(result.ok, false);
  assert.equal(envTrackingCheck?.ok, false);
  assert.equal(envTrackingCheck?.level, "error");
  assert.match(envTrackingCheck?.message ?? "", /\.env\.example is tracked/);
});

test("release preflight accepts a gitignored release env file", (t) => {
  const repoRoot = createSyntheticReleaseRepo();
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-preflight-ignored-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFileName = `.env.preflight-ignored-${process.pid}-${Date.now()}`;
  const envFile = path.join(repoRoot, envFileName);
  const releaseDatabaseUrl = "postgres://fundapp:direct-postgres-password-123@127.0.0.1:5432/fundapp_road_fund";
  writeFileSync(envFile, `DATABASE_URL=${releaseDatabaseUrl}\n`);
  t.after(() => rmSync(envFile, { force: true }));
  mkdirExecutableStub(binDir, "pg_dump", path.join(tempDir, "pg-dump-args.txt"));
  mkdirExecutableStub(binDir, "pg_restore", path.join(tempDir, "pg-restore-args.txt"));
  mkdirExecutableStub(binDir, "psql", path.join(tempDir, "psql-args.txt"));

  const childEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    APP_AUTH_MODE: "password",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    ADMIN_EMAIL: "ops@example.com",
    ADMIN_PASSWORD: "test-password-123",
    DATABASE_URL: releaseDatabaseUrl,
  };

  const { stdout, status } = spawnSync(
    process.execPath,
    ["scripts/preflight-server-release.mjs", "--release-env-file", envFileName, "--allow-dirty-worktree", "--json"],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );
  const result = JSON.parse(stdout);
  const envTrackingCheck = result.checks.find((check) => check.name === "release env git tracking");

  assert.equal(status, 0);
  assert.equal(result.ok, true);
  assert.equal(envTrackingCheck?.ok, true);
  assert.match(envTrackingCheck?.message ?? "", /ignored and untracked/);
});

test("release preflight blocks a dirty git working tree by default", (t) => {
  const repoRoot = createSyntheticReleaseRepo();
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-preflight-dirty-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFile = path.join(tempDir, ".env.release");
  const dirtyFileName = `.preflight-dirty-${process.pid}-${Date.now()}`;
  const dirtyFile = path.join(repoRoot, dirtyFileName);
  const releaseDatabaseUrl = "postgres://fundapp:direct-postgres-password-123@127.0.0.1:5432/fundapp_road_fund";
  writeFileSync(dirtyFile, "temporary dirty marker for preflight test\n");
  t.after(() => rmSync(dirtyFile, { force: true }));
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      "ADMIN_EMAIL=ops@example.com",
      "ADMIN_PASSWORD=test-password-123",
      `DATABASE_URL=${releaseDatabaseUrl}`,
      "",
    ].join("\n"),
  );
  mkdirExecutableStub(binDir, "pg_dump", path.join(tempDir, "pg-dump-args.txt"));
  mkdirExecutableStub(binDir, "pg_restore", path.join(tempDir, "pg-restore-args.txt"));
  mkdirExecutableStub(binDir, "psql", path.join(tempDir, "psql-args.txt"));

  const childEnv = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` };
  delete childEnv.DATABASE_URL;
  delete childEnv.POSTGRES_PASSWORD;

  const { stdout, status } = spawnSync(
    process.execPath,
    ["scripts/preflight-server-release.mjs", "--release-env-file", envFile, "--json"],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );
  const result = JSON.parse(stdout);
  const workingTreeCheck = result.checks.find((check) => check.name === "git working tree");

  assert.notEqual(status, 0);
  assert.equal(result.ok, false);
  assert.equal(workingTreeCheck?.ok, false);
  assert.equal(workingTreeCheck?.level, "error");
  assert.match(workingTreeCheck?.message ?? "", new RegExp(escapeRegExp(dirtyFileName)));
});

test("release preflight can explicitly allow a dirty git working tree", (t) => {
  const repoRoot = createSyntheticReleaseRepo();
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-preflight-allow-dirty-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFile = path.join(tempDir, ".env.release");
  const dirtyFileName = `.preflight-allow-dirty-${process.pid}-${Date.now()}`;
  const dirtyFile = path.join(repoRoot, dirtyFileName);
  const releaseDatabaseUrl = "postgres://fundapp:direct-postgres-password-123@127.0.0.1:5432/fundapp_road_fund";
  writeFileSync(dirtyFile, "temporary dirty marker for preflight allow test\n");
  t.after(() => rmSync(dirtyFile, { force: true }));
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      "ADMIN_EMAIL=ops@example.com",
      "ADMIN_PASSWORD=test-password-123",
      `DATABASE_URL=${releaseDatabaseUrl}`,
      "",
    ].join("\n"),
  );
  mkdirExecutableStub(binDir, "pg_dump", path.join(tempDir, "pg-dump-args.txt"));
  mkdirExecutableStub(binDir, "pg_restore", path.join(tempDir, "pg-restore-args.txt"));
  mkdirExecutableStub(binDir, "psql", path.join(tempDir, "psql-args.txt"));

  const childEnv = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` };
  delete childEnv.DATABASE_URL;
  delete childEnv.POSTGRES_PASSWORD;

  const { stdout, status } = spawnSync(
    process.execPath,
    ["scripts/preflight-server-release.mjs", "--release-env-file", envFile, "--allow-dirty-worktree", "--json"],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );
  const result = JSON.parse(stdout);
  const workingTreeCheck = result.checks.find((check) => check.name === "git working tree");

  assert.equal(status, 0);
  assert.equal(result.ok, true);
  assert.equal(workingTreeCheck?.ok, true);
  assert.equal(workingTreeCheck?.level, "warn");
  assert.match(workingTreeCheck?.message ?? "", /allowed by --allow-dirty-worktree/);
});

test("release preflight accepts release package handoff when git remote is absent", () => {
  const repoRoot = createSyntheticReleaseRepo();
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-preflight-handoff-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFile = path.join(tempDir, ".env.release");
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      "ADMIN_EMAIL=ops@example.com",
      "ADMIN_PASSWORD=test-password-123",
      "POSTGRES_PASSWORD=compose-postgres-password-123",
      "QWEN_API_KEY=qwen-secret-for-preflight-handoff-test",
      "",
    ].join("\n"),
  );
  mkdirExecutableStub(binDir, "docker", path.join(tempDir, "docker-args.txt"));

  symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), path.join(binDir, "git"));
  const childEnv = { ...process.env, PATH: `${binDir}:${path.dirname(process.execPath)}` };
  delete childEnv.DATABASE_URL;
  delete childEnv.POSTGRES_PASSWORD;

  const { stdout, status } = spawnSync(
    process.execPath,
    ["scripts/preflight-server-release.mjs", "--compose", "--release-env-file", envFile, "--json"],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );
  const result = JSON.parse(stdout);
  const handoffCheck = result.checks.find((check) => check.name === "source handoff");

  assert.equal(status, 0);
  assert.equal(result.ok, true);
  assert.equal(handoffCheck?.ok, true);
  assert.match(handoffCheck?.message ?? "", /package:release/);
});

test("phase1 audit direct DATABASE_URL mode does not block on missing Docker when PostgreSQL tools exist", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-audit-direct-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFile = path.join(tempDir, ".env.release");
  const releaseDatabaseUrl = "postgres://fundapp:direct-postgres-password-123@127.0.0.1:5432/fundapp_road_fund";
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      "ADMIN_EMAIL=ops@example.com",
      "ADMIN_PASSWORD=test-password-123",
      `DATABASE_URL=${releaseDatabaseUrl}`,
      "QWEN_API_KEY=qwen-secret-for-audit-direct-db-test",
      "",
    ].join("\n"),
  );
  mkdirExecutableStub(binDir, "pg_dump", path.join(tempDir, "pg-dump-args.txt"));
  mkdirExecutableStub(binDir, "pg_restore", path.join(tempDir, "pg-restore-args.txt"));
  mkdirExecutableStub(binDir, "psql", path.join(tempDir, "psql-args.txt"));
  mkdirFailingExecutableStub(binDir, "docker");

  const childEnv = { ...process.env, PATH: `${binDir}:${path.dirname(process.execPath)}:${process.env.PATH ?? ""}` };
  delete childEnv.DATABASE_URL;
  delete childEnv.POSTGRES_PASSWORD;

  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      envFile,
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );
  const result = JSON.parse(stdout);
  const dockerCheck = result.checks.find((check) => check.area === "Target tools" && check.name === "docker");
  const dockerComposeCheck = result.checks.find((check) => check.area === "Target tools" && check.name === "docker compose");
  const backupRestoreCheck = result.checks.find((check) => check.area === "Target tools" && check.name === "backup/restore execution path");

  assert.deepEqual(
    [dockerCheck?.status, dockerComposeCheck?.status, backupRestoreCheck?.status],
    ["pending", "pending", "ok"],
  );
  assert.match(backupRestoreCheck?.message ?? "", /direct DATABASE_URL mode has PostgreSQL client tools/);
});

test("phase1 audit Compose mode does not require host PostgreSQL tools when Docker Compose is available", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "fundapp-audit-compose-tools-env-"));
  const binDir = path.join(tempDir, "bin");
  const envFile = path.join(tempDir, ".env.release");
  writeFileSync(
    envFile,
    [
      "APP_AUTH_MODE=password",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef",
      "ADMIN_EMAIL=ops@example.com",
      "ADMIN_PASSWORD=test-password-123",
      "POSTGRES_PASSWORD=compose-postgres-password-123",
      "QWEN_API_KEY=qwen-secret-for-audit-compose-tools-test",
      "",
    ].join("\n"),
  );
  mkdirExecutableStub(binDir, "docker", path.join(tempDir, "docker-args.txt"));

  const childEnv = { ...process.env, PATH: `${binDir}:${path.dirname(process.execPath)}` };
  delete childEnv.DATABASE_URL;
  delete childEnv.POSTGRES_PASSWORD;

  const { stdout } = spawnSync(
    process.execPath,
    [
      "scripts/audit-serverization-phase1.mjs",
      "--release-env-file",
      envFile,
      "--skip-runtime",
      "--soft",
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );
  const result = JSON.parse(stdout);
  const pgDumpCheck = result.checks.find((check) => check.area === "Target tools" && check.name === "pg_dump");
  const pgRestoreCheck = result.checks.find((check) => check.area === "Target tools" && check.name === "pg_restore");
  const psqlCheck = result.checks.find((check) => check.area === "Target tools" && check.name === "psql");
  const backupRestoreCheck = result.checks.find((check) => check.area === "Target tools" && check.name === "backup/restore execution path");

  assert.deepEqual(
    [pgDumpCheck?.status, pgRestoreCheck?.status, psqlCheck?.status, backupRestoreCheck?.status],
    ["ok", "ok", "ok", "ok"],
  );
  assert.match(pgDumpCheck?.message ?? "", /not required in Compose mode/);
  assert.match(backupRestoreCheck?.message ?? "", /Compose backup\/restore path is available/);
});

async function startRuntimeAuditServer(t, { adminEmail, adminPassword, writeMarker }) {
  let loginPayload = null;
  const server = createServer(async (request, response) => {
    const sendJson = (status, payload, headers = {}) => {
      response.writeHead(status, { "Content-Type": "application/json", Connection: "close", ...headers });
      response.end(JSON.stringify(payload));
    };

    if (request.method === "POST" && request.url === "/api/session/login") {
      const body = await readRequestBody(request);
      loginPayload = JSON.parse(body || "{}");
      if (loginPayload.email === adminEmail && loginPayload.password === adminPassword) {
        sendJson(200, { user: { id: "user-admin", role: "admin" } }, { "Set-Cookie": "sid=test-session; HttpOnly" });
      } else {
        sendJson(401, { error: "invalid credentials" });
      }
      return;
    }

    const payload = runtimeAuditPayload(request.url, writeMarker);
    if (payload) {
      sendJson(200, payload);
      return;
    }

    sendJson(404, { error: "not found" });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() =>
    new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    }),
  );

  const address = server.address();
  assert.equal(typeof address, "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    getLoginPayload: () => loginPayload,
  };
}

function mkdirExecutableStub(binDir, name, captureFile) {
  execFileSync("mkdir", ["-p", binDir]);
  const file = path.join(binDir, name);
  const quotedCaptureFile = shellQuote(captureFile);
  writeFileSync(
    file,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$@" > ${quotedCaptureFile}`,
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(file, 0o755);
  return file;
}

function mkdirFailingExecutableStub(binDir, name) {
  execFileSync("mkdir", ["-p", binDir]);
  const file = path.join(binDir, name);
  writeFileSync(file, ["#!/bin/sh", "exit 127", ""].join("\n"));
  chmodSync(file, 0o755);
  return file;
}

function mkdirDockerStub(binDir) {
  execFileSync("mkdir", ["-p", binDir]);
  const file = path.join(binDir, "docker");
  writeFileSync(
    file,
    [
      "#!/bin/sh",
      "case \"$*\" in",
      "  *pg_dump*) printf 'fake pg dump' ;;",
      "  *pg_restore*) cat >/dev/null || true ;;",
      "esac",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(file, 0o755);
  return file;
}

function mkdirDockerEnvCaptureStub(binDir, captureFile) {
  execFileSync("mkdir", ["-p", binDir]);
  const file = path.join(binDir, "docker");
  writeFileSync(
    file,
    [
      "#!/bin/sh",
      `printf 'HTTP_PORT=%s\\nCOMPOSE_PROJECT_NAME=%s\\n' "$HTTP_PORT" "$COMPOSE_PROJECT_NAME" > ${shellQuote(captureFile)}`,
      "case \"$*\" in",
      "  *pg_dump*) printf 'fake pg dump' ;;",
      "  *pg_restore*) cat >/dev/null || true ;;",
      "esac",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(file, 0o755);
  return file;
}

function mkdirNodePassthroughStub(binDir, captureFile) {
  execFileSync("mkdir", ["-p", binDir]);
  const file = path.join(binDir, "node");
  writeFileSync(
    file,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$@" > ${shellQuote(captureFile)}`,
      `exec ${shellQuote(process.execPath)} "$@"`,
      "",
    ].join("\n"),
  );
  chmodSync(file, 0o755);
  return file;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runtimeAuditPayload(url, writeMarker) {
  const markerId = writeMarker ? safeId(writeMarker) : "";
  const releaseTask = writeMarker
    ? {
        id: `verify-task-${markerId}`,
        name: `服务端发布验收任务 ${writeMarker}`,
        ownerId: "user-admin",
        revision: 2,
        status: "进行中",
        note: `服务端发布验收任务已更新 ${writeMarker}`,
      }
    : null;
  const releaseMaterial = writeMarker
    ? {
        id: `material-verify-${markerId}`,
        name: `服务端发布验收资料 ${writeMarker}.xlsx`,
        source: `verify:release:${writeMarker}`,
      }
    : null;
  const releaseAiIntakeItem = writeMarker
    ? {
        id: `verify-ai-intake-${markerId}`,
        status: "已归档",
      }
    : null;
  const releaseAiMaterial = writeMarker
    ? {
        id: `material-ai-verify-ai-intake-${markerId}`,
        name: `服务端发布验收 AI 收件箱 ${writeMarker}`,
        source: `verify:release:${writeMarker}`,
      }
    : null;
  const releaseReportName = writeMarker ? `服务端发布验收报告 ${writeMarker}` : "";
  const releaseAuditEvents = writeMarker
    ? [
        {
          action: "确认风险处理",
          targetName: `发布验收风险处理 ${writeMarker}`,
          detail: "服务端发布验收已确认",
        },
        {
          action: "更新任务",
          detail: JSON.stringify({projectId:"demo-robotics",actorId:"user-admin",detail:{after:{id:releaseTask.id}}}),
        },
        {
          action: "生成报告导出包",
          targetName: releaseReportName,
        },
        {
          action: "确认资料归档",
          targetName: `服务端发布验收资料 ${writeMarker}.xlsx`,
        },
        {
          action: "确认 AI 收件箱归档",
          targetName: `服务端发布验收 AI 收件箱 ${writeMarker}`,
        },
        {
          action: "确认会议纪要",
          targetName: "演示智能设备投后月度沟通会",
        },
        {
          action: "确认管理费到账",
          targetType: "资金",
          targetId: `capital-release-${writeMarker}`,
          detail: "管理费已到账",
        },
        {
          action: "确认募集签署",
          targetType: "LP",
          targetId: "investor-fundapp-growth-i-beijing-fundapp",
        },
      ]
    : [];
  const payloads = {
    "/api/health": { ok: true },
    "/api/session/me": { user: { id: "user-admin", role: "admin" } },
    "/api/funds": { funds: [{ id: "fundapp-growth-i" }] },
    "/api/funds/fundapp-growth-i": {
      fund: { id: "fundapp-growth-i" },
      documents: [],
      investors: writeMarker ? [{ id: "investor-fundapp-growth-i-beijing-fundapp", signStatus: "已签署" }] : [],
      capitalRecords: [],
    },
    "/api/projects": { projects: [{ id: "demo-robotics" }] },
    "/api/projects/demo-robotics": {
      project: { id: "demo-robotics" },
      tasks: [],
      materials: [],
      reports: [],
      auditEvents: [],
    },
    "/api/tasks": { tasks: [releaseTask].filter(Boolean) },
    "/api/materials": { materials: [releaseMaterial, releaseAiMaterial].filter(Boolean) },
    "/api/ai-intake-items": { items: [releaseAiIntakeItem].filter(Boolean) },
    "/api/meetings": {
      meetings: writeMarker ? [{ id: "meeting-demo-robotics-20260608", status: "已归档" }] : [],
    },
    "/api/reports": {
      reports: writeMarker ? [{ name: releaseReportName, status: "已完成" }] : [],
      exportRecords: writeMarker ? [{ reportName: releaseReportName }] : [],
    },
    "/api/capital-records": {
      capitalRecords: writeMarker ? [{ id: `capital-release-${writeMarker}`, source: `verify:release:${writeMarker}`, status: "已收" }] : [],
    },
    "/api/audit-events": { auditEvents: releaseAuditEvents },
    "/api/ai/settings": { configured: true, keyStatus: "configured", maskedKey: "qw****test" },
  };
  return payloads[url];
}

function safeId(value) {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "marker";
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

test("phase1 evidence distinguishes clean synthetic Git from unavailable Git", () => {
  for (const git of [true, false]) {
    const fixture = createSyntheticReleaseRepo({ git });
    const outputDir = path.join(fixture, "release-evidence", "probe");
    execFileSync(process.execPath, ["scripts/collect-phase1-evidence.mjs", "--dry-run", "--output-dir", outputDir], { cwd: fixture });
    const metadata = JSON.parse(readFileSync(path.join(outputDir, "metadata.json"), "utf8"));
    const summary = JSON.parse(readFileSync(path.join(outputDir, "summary.json"), "utf8"));
    assert.equal(metadata.git.available, git);
    assert.equal(metadata.git.status, git ? 0 : 128);
    assert.equal(metadata.workingTreeClean, git ? true : null);
    assert.deepEqual(metadata.gitStatusShort, git ? [] : null);
    assert.equal(summary.ok, false);
    if (git) assert.equal(metadata.git.error, null);
    else {
      assert.match(metadata.git.error, /not a git repository/i);
      assert.equal(metadata.branch, null);
      assert.equal(metadata.commit, null);
    }
  }
});

test("release preflight blocks unknown Git readiness even with allow-dirty and package refuses archive", () => {
  const fixture = createSyntheticReleaseRepo({ git: false });
  const binDir = path.join(fixture, "bin");
  for (const tool of ["pg_dump", "pg_restore", "psql"]) mkdirExecutableStub(binDir, tool, path.join(fixture, `${tool}.txt`));
  const envFile = path.join(fixture, ".env.release");
  writeFileSync(envFile, ["APP_AUTH_MODE=password", "SESSION_SECRET=0123456789abcdef0123456789abcdef", "ADMIN_EMAIL=synthetic@example.invalid", "ADMIN_PASSWORD=synthetic-password-123", "DATABASE_URL=postgres://synthetic:synthetic-password@127.0.0.1:5432/synthetic"].join("\n"));
  for (const extraArgs of [[], ["--allow-dirty-worktree"]]) {
    const result = spawnSync(process.execPath, ["scripts/preflight-server-release.mjs", "--release-env-file", ".env.release", "--json", ...extraArgs], { cwd: fixture, encoding: "utf8", env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` } });
    const preflight = JSON.parse(result.stdout);
    const check = preflight.checks.find((check) => check.name === "git working tree");
    assert.equal(result.status, 1);
    assert.equal(preflight.ok, false);
    assert.equal(check.ok, false);
    assert.equal(check.level, "error");
    assert.match(check.message, /cannot be verified/);
    assert.doesNotMatch(check.message, /^clean$/);
    const tracking = preflight.checks.find((check) => check.name === "release env git tracking");
    assert.equal(tracking.ok, false);
    assert.match(tracking.message, /tracking is unavailable/);
    assert.doesNotMatch(tracking.message, /is untracked/);
  }
  const packaged = spawnSync(process.execPath, ["scripts/package-release.mjs", "--allow-dirty-worktree", "--json"], { cwd: fixture, encoding: "utf8" });
  assert.equal(packaged.status, 1);
  assert.equal(JSON.parse(packaged.stdout).ok, false);
  assert.equal(existsSync(path.join(fixture, "release-packages")), false);
});

test("phase1 evidence records a missing Git executable without claiming a clean tree", () => {
  const fixture = createSyntheticReleaseRepo({ git: false });
  const outputDir = path.join(fixture, "release-evidence", "missing-git");
  execFileSync(process.execPath, ["scripts/collect-phase1-evidence.mjs", "--dry-run", "--output-dir", outputDir], { cwd: fixture, env: { ...process.env, PATH: path.join(fixture, "no-tools") } });
  const metadata = JSON.parse(readFileSync(path.join(outputDir, "metadata.json"), "utf8"));
  assert.equal(metadata.git.available, false);
  assert.equal(metadata.git.status, null);
  assert.match(metadata.git.error, /ENOENT/);
  assert.equal(metadata.workingTreeClean, null);
  assert.equal(metadata.gitStatusShort, null);
});

test("release preflight rejects a tracked env through a symlinked repository path", () => {
  const fixture = createSyntheticReleaseRepo();
  const aliasDir = mkdtempSync(path.join(tmpdir(), "fundapp-synthetic-repo-alias-"));
  test.after(() => rmSync(aliasDir, { recursive: true, force: true }));
  const alias = path.join(aliasDir, "repository");
  symlinkSync(fixture, alias, "dir");
  const result = spawnSync(process.execPath, ["scripts/preflight-server-release.mjs", "--release-env-file", path.join(alias, ".env.example"), "--json"], { cwd: fixture, encoding: "utf8" });
  const tracking = JSON.parse(result.stdout).checks.find((check) => check.name === "release env git tracking");
  assert.equal(result.status, 1);
  assert.equal(tracking.ok, false);
  assert.match(tracking.message, /\.env\.example is tracked/);
});

// Synthetic history only: never initialize Git or copy private data from the handoff workspace.
function createSyntheticReleaseRepo({ git = true } = {}) {
  const fixture = mkdtempSync(path.join(tmpdir(), "fundapp-synthetic-release-repo-"));
  const files = [
    "scripts/package-release.mjs", "scripts/preflight-server-release.mjs", "scripts/collect-phase1-evidence.mjs",
    "docker-compose.yml", "server/Dockerfile", "Dockerfile.web", "Dockerfile.nginx",
    "server/scripts/extract-document-linux.py", "server/scripts/extract-office.py", "server/scripts/transcribe-audio.py", "server/scripts/check-runtime.mjs", "server/scripts/start-container.mjs", "server/harness/package-lock.json", "server/harness/runner.mjs", "server/scripts/container-entrypoint.sh", "server/scripts/prepare-storage.py", "server/scripts/restore-files.py", "scripts/full-backup.mjs",
    "deploy/nginx.conf", "docs/deployment/server-deploy.md",
  ];
  for (const file of files) {
    const destination = path.join(fixture, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(repoRoot, file), destination);
  }
  for(const name of ["whisper-v1.9.5.tar.gz","ggml-small-q5_1.bin"]){mkdirSync(path.join(fixture,"server/vendor/asr"),{recursive:true});writeFileSync(path.join(fixture,"server/vendor/asr",name),"synthetic packaging fixture; not executable");}
  writeFileSync(path.join(fixture, ".gitignore"), ".env.*\n!.env.example\nrelease-evidence/\nrelease-packages/\nnode_modules/\ndist/\n");
  writeFileSync(path.join(fixture, ".env.example"), "# Synthetic tracked example; contains no credentials.\n");
  if (git) {
    for (const args of [["init", "--quiet"], ["add", "."], ["-c", "user.name=Synthetic test", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Explicitly synthetic release test fixture"]]) {
      execFileSync("git", args, { cwd: fixture, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
    }
  }
  test.after(() => rmSync(fixture, { recursive: true, force: true }));
  return fixture;
}
