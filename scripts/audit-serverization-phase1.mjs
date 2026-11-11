#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const jsonOutput = hasFlag("--json");
const soft = hasFlag("--soft");
const skipRuntime = hasFlag("--skip-runtime");
const envFile = readOption("--release-env-file") ?? readOption("--env-file") ?? ".env";
const envFilePath = resolveFromRoot(envFile);
const fileEnv = existsSync(envFilePath) ? readEnvFile(envFilePath) : {};
const releaseEnv = { ...fileEnv, ...process.env };
const baseUrl = normalizeBaseUrl(readOption("--base-url") ?? releaseEnv.RELEASE_BASE_URL ?? "");
const email = readOption("--email") ?? releaseEnv.ADMIN_EMAIL;
const password = readOption("--password") ?? releaseEnv.ADMIN_PASSWORD;
const expectedWriteMarker =
  readOption("--expect-write-marker") ?? releaseEnv.RELEASE_EXPECT_WRITE_MARKER ?? releaseEnv.RELEASE_WRITE_MARKER;

const checks = [];
let cookie = "";

const requiredFiles = [
  "server/package.json",
  "server/migrations/001_initial_schema.sql",
  "server/src/index.ts",
  "server/src/config.ts",
  "server/src/http/ai-intake.ts",
  "server/src/http/meetings.ts",
  "docker-compose.yml",
  "server/Dockerfile",
  "Dockerfile.web",
  "Dockerfile.nginx",
  "deploy/nginx.conf",
  ".github/workflows/ci.yml",
  "scripts/verify-server-release.mjs",
  "scripts/preflight-server-release.mjs",
  "scripts/deploy-compose-release.mjs",
  "scripts/drill-compose-backup-restore.mjs",
  "scripts/package-release.mjs",
  "scripts/backup-postgres.mjs",
  "scripts/restore-postgres.mjs",
  "scripts/check-client-secret-exposure.mjs",
  "docs/product/2026-06-11-server-release-checklist.md",
  "docs/deployment/server-deploy.md",
  "docs/superpowers/plans/2026-06-11-serverization-phase-1.md",
];

const requiredScripts = [
  "test",
  "test:api",
  "build",
  "build:api",
  "check:client-secrets",
  "backup:db",
  "restore:db",
  "prepare:release-env",
  "verify:release",
  "preflight:release",
  "deploy:compose",
  "drill:restore:compose",
  "package:release",
  "evidence:phase1",
  "audit:phase1",
];

const requiredCiSnippets = [
  "postgres-release-check",
  "docker-compose-smoke",
  "verify-server-release",
  "preflight-server-release",
  "deploy-compose-release",
  "drill-compose-backup-restore",
  "check-client-secret-exposure",
];

const requiredCiReleasePreflightSnippets = [
  "npm run preflight:release -- --json",
  "npm run preflight:release -- --compose --json",
];

const forbiddenCiCredentialSnippets = [
  "POSTGRES_PASSWORD: fundapp",
  "PGPASSWORD: fundapp",
  "DATABASE_URL: postgres://fundapp:fundapp@",
  "RESTORE_DATABASE_URL: postgres://fundapp:fundapp@",
];

const requiredComposeSnippets = [
  "dockerfile: Dockerfile.nginx",
  "DATABASE_URL: postgres://",
  "SESSION_COOKIE_SECURE",
  "SESSION_MAX_AGE_SECONDS",
];

const requiredReleasePreflightSnippets = [
  "checkEnvFileGitTracking()",
  "\"ls-files\"",
  "\"check-ignore\"",
  "release env git tracking",
  "checkGitWorkingTree()",
  "git status",
  "--allow-dirty-worktree",
  "dirty working tree",
];

const requiredReleaseVerifierSnippets = [
  "material archive persists",
  "AI intake archive persists",
  "meeting confirmation persists",
  "report export persists",
  "capital fee confirmation persists",
  "investor signature persists",
  "expected write marker task persists",
  "expected write marker task actor persists",
  "expected write marker risk handling persists",
  "expected write marker material archive persists",
  "expected write marker AI intake archive persists",
  "expected meeting confirmation persists",
  "expected write marker report export persists",
  "expected write marker capital confirmation persists",
  "expected write marker audit events persist",
  "--expect-write-marker",
  "--release-env-file",
  "releaseEnv.RELEASE_EXPECT_WRITE_MARKER ?? releaseEnv.RELEASE_WRITE_MARKER",
  "Defaults to RELEASE_EXPECT_WRITE_MARKER or RELEASE_WRITE_MARKER",
];

const requiredComposeDeploySnippets = [
  "\"compose\", \"config\", \"--quiet\"",
  "scripts/verify-server-release.mjs",
  "--release-env-file",
  "envFile",
  "RELEASE_BASE_URL: baseUrl",
  "RELEASE_WRITE_MARKER: writeMarker",
  "deriveComposeEnv",
  "HTTP_PORT",
];

const requiredEvidenceCollectorSnippets = [
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
];

const requiredReleaseEnvGeneratorSnippets = [
  "RELEASE_WRITE_MARKER",
  "readOption(\"--write-marker\")",
  "Generated secrets were written to the env file and were not printed.",
  "--write-marker",
  "chmodSync(output, 0o600)",
];

const requiredMigrationEntrypointSnippets = [
  "isMainModule(import.meta.url)",
];

const requiredMigrationIdempotencySnippets = [
  "schema_migrations",
  "runInitialSchemaMigration",
  "information_schema.tables",
  "on conflict (id) do nothing",
];

const requiredRestoreDrillSnippets = [
  "releaseEnv.RELEASE_EXPECT_WRITE_MARKER ?? releaseEnv.RELEASE_WRITE_MARKER",
  "--expect-write-marker",
  "Defaults to RELEASE_EXPECT_WRITE_MARKER or RELEASE_WRITE_MARKER",
];

const requiredReleasePackageSnippets = [
  "git archive",
  "archiveSha256",
  "workingTreeClean",
  "--allow-dirty-worktree",
  "release-packages",
  "docs/deployment/server-deploy.md",
];

const requiredReportApiSnippets = [
  "exportRecords",
  "listReportExports",
];

const requiredAiIntakeApiSnippets = [
  "/api/ai-intake-items/:id/archive",
  "archiveAiIntakeItem",
  "material:write",
];

const requiredMeetingApiSnippets = [
  "/api/meetings/:id/confirm",
  "confirmMeeting",
  "meeting:write",
];

const requiredFrontendApiSnippets = {
  "vite.config.ts": [
    "VITE_API_PROXY_TARGET",
    "\"/api/ai\"",
  ],
  "src/lib/aiService.ts": [
    "chatEndpoint: \"/api/ai/chat\"",
    "settingsEndpoint: \"/api/ai/settings\"",
    "mode: \"server-side\"",
  ],
};

const forbiddenFrontendProviderSnippets = [
  "chat/completions",
  "process.env.QWEN",
  "process.env.DASHSCOPE",
  "process.env.OPENAI",
  "import.meta.env.VITE_QWEN",
  "import.meta.env.VITE_DASHSCOPE",
  "import.meta.env.VITE_OPENAI",
  "Authorization: `Bearer",
  "Authorization: \"Bearer",
  "Authorization: 'Bearer",
];

for (const file of requiredFiles) {
  checkFile(file);
}

checkPackageScripts();
checkTextSnippets(".github/workflows/ci.yml", requiredCiSnippets, "CI gate");
checkTextSnippets(".github/workflows/ci.yml", requiredCiReleasePreflightSnippets, "CI release preflight");
checkForbiddenTextSnippets(".github/workflows/ci.yml", forbiddenCiCredentialSnippets, "CI credential guard");
checkTextSnippets("docker-compose.yml", requiredComposeSnippets, "Compose env");
checkTextSnippets("scripts/preflight-server-release.mjs", requiredReleasePreflightSnippets, "Release preflight");
checkTextSnippets("scripts/verify-server-release.mjs", requiredReleaseVerifierSnippets, "Release verifier");
checkTextSnippets("scripts/deploy-compose-release.mjs", requiredComposeDeploySnippets, "Compose deploy");
checkTextSnippets("scripts/collect-phase1-evidence.mjs", requiredEvidenceCollectorSnippets, "Evidence collector");
checkTextSnippets("scripts/prepare-release-env.mjs", requiredReleaseEnvGeneratorSnippets, "Release env generator");
checkTextSnippets("server/src/db/migrate.ts", requiredMigrationEntrypointSnippets, "Database lifecycle");
checkTextSnippets("server/src/db/migrate.ts", requiredMigrationIdempotencySnippets, "Database lifecycle");
checkTextSnippets("server/src/db/seed.ts", requiredMigrationEntrypointSnippets, "Database lifecycle");
checkTextSnippets("server/tests/runtime.test.ts", ["node argv relative paths"], "Database lifecycle");
checkTextSnippets("server/tests/migrate.test.ts", ["records an untracked existing baseline", "applies schema SQL and records the migration"], "Database lifecycle");
checkTextSnippets("scripts/drill-compose-backup-restore.mjs", requiredRestoreDrillSnippets, "Restore drill");
checkTextSnippets("scripts/package-release.mjs", requiredReleasePackageSnippets, "Release package");
checkTextSnippets("server/src/http/reports.ts", requiredReportApiSnippets, "Report export API");
checkTextSnippets("server/src/http/ai-intake.ts", requiredAiIntakeApiSnippets, "AI intake API");
checkTextSnippets("server/src/http/meetings.ts", requiredMeetingApiSnippets, "Meeting API");
checkFrontendApiMigration();
checkBusinessStateSourceGuard();
checkClientSecretExposure();
checkReleaseEnvironment();
checkTargetTools();

if (skipRuntime) {
  addCheck("runtime API audit", "pending", "--skip-runtime was used; run again with --base-url on the target server", "Runtime");
} else if (!baseUrl) {
  addCheck("runtime API audit", "pending", "pass --base-url or RELEASE_BASE_URL to verify the running deployment", "Runtime");
} else {
  await checkRuntimeApi();
}

const summary = summarizeChecks();
const result = {
  ok: summary.blocked === 0 && summary.pending === 0,
  envFile,
  baseUrl: baseUrl || undefined,
  summary,
  checks,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const check of checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "pending" ? "PENDING" : "BLOCKED";
    console.log(`${prefix} ${check.area} / ${check.name}: ${check.message}`);
  }
  console.log(result.ok ? "Phase 1 audit passed." : "Phase 1 audit has pending or blocked items.");
}

if (!soft && !result.ok) {
  process.exit(1);
}

function checkFile(relativePath) {
  const ok = existsSync(path.join(repoRoot, relativePath));
  addCheck(relativePath, ok ? "ok" : "blocked", ok ? "present" : "missing", "Repository");
}

function checkPackageScripts() {
  const packagePath = path.join(repoRoot, "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  } catch (error) {
    addCheck("package.json", "blocked", `cannot parse package.json: ${error.message}`, "Repository");
    return;
  }

  for (const script of requiredScripts) {
    const ok = typeof packageJson.scripts?.[script] === "string" && packageJson.scripts[script].length > 0;
    addCheck(`npm script ${script}`, ok ? "ok" : "blocked", ok ? packageJson.scripts[script] : "missing", "Repository");
  }
}

function checkTextSnippets(relativePath, snippets, area) {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    addCheck(relativePath, "blocked", "missing", area);
    return;
  }

  const text = readFileSync(filePath, "utf8");
  for (const snippet of snippets) {
    const ok = text.includes(snippet);
    addCheck(snippet, ok ? "ok" : "blocked", ok ? `${relativePath} contains required text` : `${relativePath} is missing required text`, area);
  }
}

function checkForbiddenTextSnippets(relativePath, snippets, area) {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    addCheck(relativePath, "blocked", "missing", area);
    return;
  }

  const text = readFileSync(filePath, "utf8");
  for (const snippet of snippets) {
    const ok = !text.includes(snippet);
    addCheck(snippet, ok ? "ok" : "blocked", ok ? `${relativePath} does not contain forbidden text` : `${relativePath} contains forbidden text`, area);
  }
}

function checkFrontendApiMigration() {
  for (const [relativePath, snippets] of Object.entries(requiredFrontendApiSnippets)) {
    checkTextSnippets(relativePath, snippets, "Frontend API migration");
  }

  const frontendProviderFiles = [
    "vite.config.ts",
    "src/lib/aiService.ts",
    "src/App.tsx",
    "src/components/Layout.tsx",
  ];
  const forbiddenMatches = [];

  for (const relativePath of frontendProviderFiles) {
    const filePath = path.join(repoRoot, relativePath);
    if (!existsSync(filePath)) {
      addCheck(`${relativePath} provider call guard`, "blocked", "missing", "Frontend API migration");
      continue;
    }

    const text = readFileSync(filePath, "utf8");
    for (const snippet of forbiddenFrontendProviderSnippets) {
      if (text.includes(snippet)) {
        forbiddenMatches.push(`${relativePath}: ${snippet}`);
      }
    }
  }

  addCheck(
    "frontend provider call guard",
    forbiddenMatches.length === 0 ? "ok" : "blocked",
    forbiddenMatches.length === 0
      ? "frontend and Vite only use server API/proxy for AI calls"
      : `frontend contains provider-call or secret snippets: ${forbiddenMatches.join("; ")}`,
    "Frontend API migration",
  );
}

function checkBusinessStateSourceGuard() {
  const appPath = path.join(repoRoot, "src/App.tsx");
  if (!existsSync(appPath)) {
    addCheck("business state source guard", "blocked", "src/App.tsx missing", "Frontend API migration");
    return;
  }

  const source = readFileSync(appPath, "utf8");
  const readSource = relativePath => {
    const file = path.join(repoRoot, relativePath);
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  };
  const workflowSource = readSource("src/components/WorkflowPanels.tsx");
  const materialUploadSource = readSource("src/components/MaterialFileDialogs.tsx");
  const reportSaveSource = readSource("src/lib/reportTaskSave.ts");
  const entrySource=readSource("src/components/BusinessEntryWorkspaces.tsx");
  const intakeSource=readSource("src/components/IntakeUploadDialog.tsx");
  const assistantSource=readSource("src/components/AiEmployeePage.tsx");
  const assistantNavigationOnly=source.includes('<AiEmployeePage projects={projectRecords} role={currentRole} onBusinessChanged={onWorkflowRefresh} />') && /const openBusinessPage=\(href:string\)=>\{if\(\['\/materials','\/tasks','\/reports\/create','\/ai-inbox'\]\.includes\(href\)\)navigate\(href\);\};/.test(assistantSource) && assistantSource.includes('onClick={()=>openBusinessPage(href)}');
  const localSourceGuard = source.includes('return import.meta.env.VITE_BUSINESS_STATE_SOURCE === "local";') || /function isLocalBusinessStateMode\(\)\s*{\s*return false;/.test(source);
  const localSaveGuard = source.includes('businessStateMode === "local"');
  const degradedWriteGuards = source.match(/if \(businessStateMode !== "local"\) return undefined;/g) ?? [];
  const taskSetterLeaks = [
    ["setTasksByProject prop", /setTasksByProject=/.test(source)],
    ["project tab task setter", /setTasks=\{context\.setTasks\}/.test(source)],
    ["router task state setter prop", /setProjectTaskRecordsById=\{/.test(source)],
  ].filter(([, found]) => found);
  const workflowTaskWrites = workflowSource.match(/api\.(?:createWorkflowTask|updateWorkflowTask)\(/g) ?? [];
  const awaitedWorkflowTaskWrites = workflowSource.match(/await api\.(?:createWorkflowTask|updateWorkflowTask)\(/g) ?? [];
  const taskCommandHandlers =
    workflowTaskWrites.length > 0 && workflowTaskWrites.length === awaitedWorkflowTaskWrites.length &&
    /const addProjectTask = async[\s\S]*?setWorkflowTaskEdit[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/.test(source) &&
    /const updateProjectTask = async[\s\S]*?setWorkflowTaskEdit[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/.test(source) &&
    /<ProjectsPage[\s\S]*onProjectTaskUpdate=\{onProjectTaskUpdate\}/.test(source) &&
    /<WorkflowTaskBoard[\s\S]*onChanged=\{onWorkflowRefresh\}/.test(source) &&
    /<WorkflowTaskDialog[\s\S]*?onSaved=\{async[\s\S]*?await refreshWorkflow\(\)/.test(source) &&
    /await api\.updateWorkflowTask[\s\S]*?await onSaved\(\);[\s\S]*?catch \(error\) \{ setError/.test(workflowSource) &&
    /await api\.createWorkflowTask/.test(workflowSource) &&
    /expectedRevision: task\.revision \?\? 1/.test(workflowSource) &&
    /input\.completionNote = completionNote/.test(workflowSource) &&
    !/apiClient\.(?:createTask|updateTask)\(/.test(source);
  const materialSetterLeaks = [
    ["setMaterials prop", /setMaterials=/.test(source)],
    ["router material state setter prop", /setMaterialRecords=\{/.test(source)],
  ].filter(([, found]) => found);
  const materialWrites = materialUploadSource.match(/api\.(?:uploadMaterial|updateMaterialProjects)\(/g) ?? [];
  const confirmedMaterialWrites = materialUploadSource.match(/await api\.(?:uploadMaterial|updateMaterialProjects)\([^;]*\);\s*await onSaved\(\)/g) ?? [];
  if (/for\s*\([^)]*next.length[^)]*\)[\s\S]*?const result=await api\.uploadMaterial\([^;]+\);row.result=result.material;[\s\S]*?await onSaved\(\)/.test(materialUploadSource.split('export function MaterialVersionDialog(')[0])) confirmedMaterialWrites.push('awaited batch upload then saved refresh');
  // Upload acknowledgement may precede refresh; the write and refresh must both remain awaited.
  if (/await api\.uploadMaterial\([^;]*\);\s*uploaded\s*=\s*true;\s*(?:\+\+extractionRead\.current;\s*setExtraction\(null\);\s*setExtractionLoading\(false\);\s*setExtractionError\("[^"\n]*"\);\s*)?(?:set(?:Notice|File|FileReset)\([^;]*\);\s*)+await onSaved\(\)/.test(materialUploadSource.split('export function MaterialVersionDialog(')[1] ?? '')) confirmedMaterialWrites.push('awaited version upload, acknowledgement, then saved refresh');
  const materialCommandHandler =
    materialWrites.length > 0 && materialWrites.length === confirmedMaterialWrites.length &&
    /const refreshMaterials = async[\s\S]*?businessStateMode !== "server"[\s\S]*?apiClient\.getMaterials/.test(source) &&
    /<MaterialsPage[\s\S]*onMaterialsRefresh=\{onMaterialsRefresh\}/.test(source) &&
    /await api\.uploadMaterial[\s\S]*?await onSaved\(\)/.test(materialUploadSource) &&
    !/createUploadedMaterialRecord|archiveMaterial|setMaterialRecords/.test(materialUploadSource);
  const reportCommandHandler =
    /await Promise\.all\(\[api\.getUsers\(\), api\.getSessionMe\(\)\]\)/.test(reportSaveSource) &&
    /user\.canLogin/.test(reportSaveSource) &&
    /requestId: progress\.taskRequestIds\[index\][\s\S]*?ownerId: owner\.id/.test(reportSaveSource) &&
    /await api\.createReport/.test(reportSaveSource) &&
    /owner: session\.user\.name/.test(reportSaveSource) &&
    /await api\.createWorkflowTask\(progress\.taskInputs\[index\]\)[\s\S]*?progress\.completedTaskIndexes\.push\(index\)[\s\S]*?return progress\.report;[\s\S]*?catch/.test(reportSaveSource) &&
    /const saveReport = async[\s\S]*?await saveReportTaskWorkflow[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/.test(source) &&
    /const approveReport = async[\s\S]*?apiClient\.approveReport[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/.test(source) &&
    /const exportReport = async[\s\S]*?apiClient\.exportReport[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/.test(source) &&
    /await api\.getSessionMe\(\)[\s\S]*?owner:user\.name[\s\S]*?await api\.createReport\(pending\.current\)[\s\S]*?committed\.current=true;await onSaved\(report\)/.test(entrySource) &&
    assistantNavigationOnly;
  const aiIntakeMeetingCommandHandler =
    /const archiveAiIntake = async[\s\S]*?apiClient\.archiveAiIntakeItem[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/.test(source) &&
    /const updateAiIntake = async[\s\S]*?apiClient\.updateAiIntakeSuggestion[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/.test(source) &&
    /const rejectAiIntake = async[\s\S]*?apiClient\.rejectAiIntakeItem[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/.test(source) &&
    /await api\.uploadMaterial/.test(intakeSource) && /await api\.createAiIntakeFromMaterial/.test(intakeSource) && !/simulateAiIntakeUpload|onAiIntakeSimulate/.test(source) &&
    /const confirmMeeting = async[\s\S]*?apiClient\.confirmMeeting[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/.test(source) &&
    /const confirmArchive = async[\s\S]*?const archivedItem = await onArchive/.test(source) &&
    /const confirmProjectMeeting = async[\s\S]*?const confirmedMeeting = await onConfirm\(meeting\)/.test(source) &&
    /const confirmSelectedMeeting = async[\s\S]*?const confirmedMeeting = await onConfirm\(meeting\)/.test(source) &&
    assistantNavigationOnly;

  addCheck(
    "business localStorage source guard",
    localSourceGuard && localSaveGuard ? "ok" : "blocked",
    localSourceGuard && localSaveGuard
      ? "business snapshot load/save is gated to explicit local mode"
      : "business snapshot localStorage access is not gated to explicit local mode",
    "Frontend API migration",
  );
  addCheck(
    "degraded business write guard",
    degradedWriteGuards.length >= 2 ? "ok" : "blocked",
    degradedWriteGuards.length >= 2
      ? "server/degraded project stage and risk handlers cannot fall back to local mutations"
      : "server/degraded handlers may still fall back to local mutations",
    "Frontend API migration",
  );
  addCheck(
    "task command handler guard",
    taskCommandHandlers && taskSetterLeaks.length === 0 ? "ok" : "blocked",
    taskCommandHandlers && taskSetterLeaks.length === 0
      ? "task create/update pages use command handlers instead of raw local task setters"
      : `task write surfaces may still bypass API handlers${taskSetterLeaks.length ? `: ${taskSetterLeaks.map(([name]) => name).join(", ")}` : ""}`,
    "Frontend API migration",
  );
  addCheck(
    "material command handler guard",
    materialCommandHandler && materialSetterLeaks.length === 0 ? "ok" : "blocked",
    materialCommandHandler && materialSetterLeaks.length === 0
      ? "material upload page uses a command handler instead of raw local material setters"
      : `material write surfaces may still bypass API handlers${materialSetterLeaks.length ? `: ${materialSetterLeaks.map(([name]) => name).join(", ")}` : ""}`,
    "Frontend API migration",
  );
  addCheck(
    "report command handler guard",
    reportCommandHandler ? "ok" : "blocked",
    reportCommandHandler
      ? "report save, approval, export, and AI report action wait for command handler success"
      : "report write surfaces may still mark local success before API handlers complete",
    "Frontend API migration",
  );
  addCheck(
    "AI intake and meeting command handler guard",
    aiIntakeMeetingCommandHandler ? "ok" : "blocked",
    aiIntakeMeetingCommandHandler
      ? "AI intake and meeting pages wait for server command success before marking local completion"
      : "AI intake or meeting surfaces may still mark local success before API handlers complete",
    "Frontend API migration",
  );
}

function checkClientSecretExposure() {
  if (!existsSync(path.join(repoRoot, "dist"))) {
    addCheck("client secret exposure", "pending", "run npm run build before final Phase 1 audit so dist can be scanned", "Client security");
    return;
  }

  const result = spawnSync("node", ["scripts/check-client-secret-exposure.mjs", "--require-dist"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  addCheck(
    "client secret exposure",
    result.status === 0 ? "ok" : "blocked",
    result.status === 0 ? "browser source and dist scan passed" : output || "client secret exposure check failed",
    "Client security",
  );
}

function checkReleaseEnvironment() {
  addCheck(
    "release env source",
    existsSync(envFilePath) || hasReleaseEnv(),
    existsSync(envFilePath) ? `${envFile} present` : hasReleaseEnv() ? `${envFile} missing; using process environment` : `${envFile} missing and release env vars are not set`,
    "Environment",
  );

  const authMode = releaseEnv.APP_AUTH_MODE;
  addCheck(
    "APP_AUTH_MODE",
    authMode === "password" ? "ok" : "pending",
    authMode === "password" ? "password mode" : "set APP_AUTH_MODE=password for server release",
    "Environment",
  );

  const sessionSecret = releaseEnv.SESSION_SECRET ?? "";
  const safeSessionSecret = Boolean(sessionSecret) && sessionSecret.length >= 32 && !["change-me", "dev-session-secret"].includes(sessionSecret);
  addCheck(
    "SESSION_SECRET",
    safeSessionSecret ? "ok" : "pending",
    safeSessionSecret ? "non-default 32+ character value present" : "set a non-default 32+ character secret",
    "Environment",
  );

  const adminEmail = releaseEnv.ADMIN_EMAIL ?? "";
  const safeAdminEmail = Boolean(adminEmail) && adminEmail !== "admin@example.local";
  addCheck(
    "ADMIN_EMAIL",
    safeAdminEmail ? "ok" : "pending",
    safeAdminEmail ? "production administrator email present" : "set a production administrator email",
    "Environment",
  );

  const adminPassword = releaseEnv.ADMIN_PASSWORD ?? "";
  const safeAdminPassword = Boolean(adminPassword) && adminPassword.length >= 12 && !["change-me", "fund-management-admin"].includes(adminPassword);
  addCheck(
    "ADMIN_PASSWORD",
    safeAdminPassword ? "ok" : "pending",
    safeAdminPassword ? "non-default 12+ character password present" : "set a non-default 12+ character password",
    "Environment",
  );

  const hasDatabaseUrl =
    Boolean(releaseEnv.DATABASE_URL) && !releaseEnv.DATABASE_URL.includes("fundapp:fundapp@") && !releaseEnv.DATABASE_URL.includes("change-me");
  const postgresPassword = releaseEnv.POSTGRES_PASSWORD ?? "";
  const safePostgresPassword = Boolean(postgresPassword) && postgresPassword.length >= 12 && !["fundapp", "change-me", "change-me-postgres"].includes(postgresPassword);
  addCheck(
    "database credentials",
    hasDatabaseUrl || safePostgresPassword ? "ok" : "pending",
    hasDatabaseUrl ? "DATABASE_URL present" : safePostgresPassword ? "non-default Compose POSTGRES_PASSWORD present" : "set DATABASE_URL or a non-default 12+ character POSTGRES_PASSWORD",
    "Environment",
  );

  addCheck(
    "QWEN_API_KEY",
    releaseEnv.QWEN_API_KEY ? "ok" : "pending",
    releaseEnv.QWEN_API_KEY ? "present" : "set QWEN_API_KEY before validating AI chat",
    "Environment",
  );
}

function checkTargetTools() {
  const hasDirectDatabase = hasUsableDatabaseUrl(releaseEnv.DATABASE_URL);
  const dockerMissingStatus = hasDirectDatabase ? "pending" : "blocked";
  const docker = checkCommand("docker", ["docker", "--version"], dockerMissingStatus);
  const dockerCompose = checkCommand("docker compose", ["docker", "compose", "version"], dockerMissingStatus);

  const shouldCheckHostPostgresTools = hasDirectDatabase || !docker || !dockerCompose;
  const pgMissingStatus = hasDirectDatabase ? "blocked" : "pending";
  const pgDump = shouldCheckHostPostgresTools
    ? checkCommand("pg_dump", ["pg_dump", "--version"], pgMissingStatus)
    : addOptionalTool("pg_dump", "not required in Compose mode");
  const pgRestore = shouldCheckHostPostgresTools
    ? checkCommand("pg_restore", ["pg_restore", "--version"], pgMissingStatus)
    : addOptionalTool("pg_restore", "not required in Compose mode");
  const psql = shouldCheckHostPostgresTools
    ? checkCommand("psql", ["psql", "--version"], pgMissingStatus)
    : addOptionalTool("psql", "not required in Compose mode");
  if (hasDirectDatabase) {
    addCheck(
      "backup/restore execution path",
      pgDump && pgRestore && psql ? "ok" : "blocked",
      pgDump && pgRestore && psql
        ? "direct DATABASE_URL mode has PostgreSQL client tools for backup and restore"
        : "direct DATABASE_URL mode requires pg_dump, pg_restore, and psql",
      "Target tools",
    );
  } else if (docker && dockerCompose) {
    addCheck("backup/restore execution path", "ok", "Compose backup/restore path is available", "Target tools");
  } else if (pgDump && pgRestore && psql) {
    addCheck(
      "backup/restore execution path",
      "pending",
      "PostgreSQL client tools are available; set DATABASE_URL or install Docker Compose for a complete release path",
      "Target tools",
    );
  } else {
    addCheck("backup/restore execution path", "blocked", "install Docker Compose or PostgreSQL client tools before release drills", "Target tools");
  }

  checkSourceHandoff();
}

function checkSourceHandoff() {
  const remote = spawnSync("git", ["remote", "-v"], { cwd: repoRoot, encoding: "utf8" });
  const hasRemote = remote.status === 0 && remote.stdout.trim().length > 0;
  const hasReleasePackageHandoff = existsSync(path.join(repoRoot, "scripts/package-release.mjs"));
  addCheck(
    "source handoff",
    hasRemote || hasReleasePackageHandoff ? "ok" : "pending",
    hasRemote
      ? "git remote configured"
      : hasReleasePackageHandoff
        ? "git remote not configured; use npm run package:release for tarball handoff"
        : "configure git remote or add package:release before server handoff",
    "Target tools",
  );
}

function checkCommand(name, command, missingStatus) {
  const result = spawnSync(command[0], command.slice(1), { cwd: repoRoot, stdio: "ignore" });
  const ok = result.status === 0;
  addCheck(name, ok ? "ok" : missingStatus, ok ? "available" : "not available", "Target tools");
  return ok;
}

function addOptionalTool(name, message) {
  addCheck(name, "ok", message, "Target tools");
  return false;
}

function hasUsableDatabaseUrl(databaseUrl) {
  return Boolean(databaseUrl) && !databaseUrl.includes("fundapp:fundapp@") && !databaseUrl.includes("change-me");
}

async function checkRuntimeApi() {
  await runtimeCheck("health endpoint", async () => {
    const body = await request("/api/health");
    assert(body.ok === true, "health.ok is not true");
  });

  if (email && password) {
    await runtimeCheck("password login", async () => {
      const response = await rawRequest("/api/session/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      assert(response.ok, `login returned ${response.status}`);
      const setCookie = response.headers.get("set-cookie");
      assert(setCookie, "login did not return set-cookie");
      cookie = setCookie.split(";")[0];
    });
  } else {
    addCheck(
      "password login",
      "pending",
      "pass --email and --password, set ADMIN_EMAIL and ADMIN_PASSWORD, or include them in --release-env-file when APP_AUTH_MODE=password",
      "Runtime",
    );
  }

  await runtimeCheck("session endpoint", async () => {
    const body = await request("/api/session/me");
    assert(body.user?.role, "session user role is missing");
  });

  await runtimeCheck("fund ledger read", async () => {
    const body = await request("/api/funds");
    assert(Array.isArray(body.funds), "funds is not an array");
    assert(body.funds.some((fund) => fund.id === "fundapp-growth-i"), "fundapp-growth-i fund is missing");
  });

  await runtimeCheck("fund detail ledger read", async () => {
    const body = await request("/api/funds/fundapp-growth-i");
    assert(body.fund?.id === "fundapp-growth-i", "fundapp-growth-i fund detail is missing");
    assert(Array.isArray(body.documents), "fund documents are not an array");
    assert(Array.isArray(body.investors), "fund investors are not an array");
    assert(Array.isArray(body.capitalRecords), "fund capital records are not an array");
  });

  await runtimeCheck("project ledger read", async () => {
    const body = await request("/api/projects");
    assert(Array.isArray(body.projects), "projects is not an array");
    assert(body.projects.some((project) => project.id === "demo-robotics"), "demo-robotics project is missing");
  });

  await runtimeCheck("project detail ledger read", async () => {
    const body = await request("/api/projects/demo-robotics");
    assert(body.project?.id === "demo-robotics", "demo-robotics project detail is missing");
    assert(Array.isArray(body.tasks), "project tasks are not an array");
    assert(Array.isArray(body.materials), "project materials are not an array");
    assert(Array.isArray(body.reports), "project reports are not an array");
    assert(Array.isArray(body.auditEvents), "project audit events are not an array");
  });

  await runtimeCheck("task ledger read", async () => {
    const body = await request("/api/tasks");
    assert(Array.isArray(body.tasks), "tasks is not an array");
  });

  await runtimeCheck("material ledger read", async () => {
    const body = await request("/api/materials");
    assert(Array.isArray(body.materials), "materials is not an array");
  });

  await runtimeCheck("AI intake ledger read", async () => {
    const body = await request("/api/ai-intake-items");
    assert(Array.isArray(body.items), "AI intake items is not an array");
  });

  await runtimeCheck("meeting ledger read", async () => {
    const body = await request("/api/meetings");
    assert(Array.isArray(body.meetings), "meetings is not an array");
  });

  await runtimeCheck("report ledger read", async () => {
    const body = await request("/api/reports");
    assert(Array.isArray(body.reports), "reports is not an array");
    assert(Array.isArray(body.exportRecords), "report exportRecords is not an array");
  });

  await runtimeCheck("capital ledger read", async () => {
    const body = await request("/api/capital-records");
    assert(Array.isArray(body.capitalRecords), "capitalRecords is not an array");
  });

  await runtimeCheck("audit ledger read", async () => {
    const body = await request("/api/audit-events");
    assert(Array.isArray(body.auditEvents), "auditEvents is not an array");
  });

  await runtimeCheck("AI settings are masked", async () => {
    const body = await request("/api/ai/settings");
    const text = JSON.stringify(body);
    if (releaseEnv.QWEN_API_KEY) {
      assert(!text.includes(releaseEnv.QWEN_API_KEY), "AI settings expose the raw Qwen API key");
    }
  });

  if (expectedWriteMarker) {
    checkExpectedWriteMarker(expectedWriteMarker);
  } else {
    addCheck(
      "release write marker readback",
      "pending",
      "pass --expect-write-marker after deploy:compose --write to verify persisted release writes",
      "Runtime",
    );
  }
}

function checkExpectedWriteMarker(marker) {
  const verifierArgs = [
    "scripts/verify-server-release.mjs",
    "--release-env-file",
    envFile,
    "--base-url",
    baseUrl,
    "--expect-write-marker",
    marker,
  ];
  const result = spawnSync("node", verifierArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...releaseEnv,
      ...(email ? { ADMIN_EMAIL: email } : {}),
      ...(password ? { ADMIN_PASSWORD: password } : {}),
      RELEASE_BASE_URL: baseUrl,
      RELEASE_EXPECT_WRITE_MARKER: marker,
    },
  });

  if (result.status !== 0) {
    addCheck(
      "release write marker readback",
      "blocked",
      summarizeCommandOutput(`${result.stdout}\n${result.stderr}`),
      "Runtime",
    );
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }

  addCheck(
    "release write marker readback",
    "ok",
    parsed?.checks?.length
      ? `verify:release --expect-write-marker passed with ${parsed.checks.length} checks`
      : "verify:release --expect-write-marker passed",
    "Runtime",
  );
}

async function runtimeCheck(name, fn) {
  const startedAt = Date.now();
  try {
    await fn();
    addCheck(name, "ok", `passed in ${Date.now() - startedAt}ms`, "Runtime");
  } catch (error) {
    addCheck(name, "blocked", error.message, "Runtime");
  }
}

async function request(urlPath, init = {}) {
  const response = await rawRequest(urlPath, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${urlPath} returned non-JSON response: ${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    throw new Error(`${urlPath} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function rawRequest(urlPath, init = {}) {
  return fetch(`${baseUrl}${urlPath}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  });
}

function summarizeChecks() {
  return checks.reduce(
    (summary, check) => {
      summary[check.status] += 1;
      summary.total += 1;
      return summary;
    },
    { ok: 0, pending: 0, blocked: 0, total: 0 },
  );
}

function addCheck(name, statusOrOk, message, area) {
  const status = typeof statusOrOk === "boolean" ? (statusOrOk ? "ok" : "blocked") : statusOrOk;
  checks.push({ area, name, status, message });
}

function summarizeCommandOutput(output) {
  const normalized = output.trim().replace(/\s+/g, " ");
  return normalized.length > 1000 ? `${normalized.slice(0, 1000)}...` : normalized || "command failed";
}

function hasReleaseEnv() {
  return ["APP_AUTH_MODE", "SESSION_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD", "DATABASE_URL", "POSTGRES_PASSWORD"].some((key) => process.env[key]);
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

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/$/, "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  npm run audit:phase1 -- --base-url http://127.0.0.1 --release-env-file .env
  npm run audit:phase1 -- --base-url http://127.0.0.1 --expect-write-marker "$RELEASE_WRITE_MARKER"
  npm run audit:phase1 -- --soft --json
  npm run audit:phase1 -- --skip-runtime

Checks:
  - Phase 1 repository deliverables exist.
  - Required npm scripts, CI gates, and Compose environment entries are present.
  - Frontend AI calls go through the server API/proxy instead of holding provider-call logic.
  - Business state localStorage, degraded write paths, and command-handler write surfaces stay gated to server APIs or explicit local mode.
  - Target-server release environment values are non-default.
  - Docker Compose or PostgreSQL client tools can support deploy and restore drills.
  - Optional running API smoke verifies health, session, ledgers, AI intake, meetings, audit events, and masked AI settings.

Options:
  --base-url       Running server origin. Defaults to RELEASE_BASE_URL. Without it, runtime audit is pending.
  --email          Admin email override for APP_AUTH_MODE=password runtime login. Defaults to --release-env-file or environment.
  --password       Admin password override for APP_AUTH_MODE=password runtime login. Defaults to --release-env-file or environment.
  --expect-write-marker Verify persisted release write records created by verify:release --write. Defaults to RELEASE_EXPECT_WRITE_MARKER or RELEASE_WRITE_MARKER from --release-env-file.
  --release-env-file Release env file to inspect. Defaults to .env.
  --env-file       Backward-compatible alias; avoid on Node 25 because it conflicts with Node runtime flags.
  --skip-runtime   Mark runtime checks pending instead of calling a server.
  --json           Print machine-readable output.
  --soft           Do not exit non-zero when pending or blocked items remain.
`);
}
