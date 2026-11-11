import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("server write failures do not fall through to local mutation paths", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const failureBranches = source.match(/catch(?:\s*\(error\))?\s*\{\s*(?:if\([^\n]+\)throw error;\s*)?markServerWriteFailure\([^;]+\);\s*return(?: undefined)?;\s*\}/g) ?? [];
  const failureCalls = source.match(/markServerWriteFailure\([^;]+\);/g) ?? [];

  assert.ok(failureCalls.length > 0);
  assert.equal(failureBranches.length, failureCalls.length);
});

test("degraded mode cannot fall back to local project stage or risk mutations", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /onProjectStageUpdate=\{async[\s\S]*?if \(businessStateMode !== "local"\) return undefined;[\s\S]*?setProjectRecords/,
  );
  assert.match(
    source,
    /onRiskHandle=\{async[\s\S]*?if \(businessStateMode !== "local"\) return undefined;[\s\S]*?appendAuditEvent\(event\)/,
  );
});

test("task write surfaces use command handlers instead of raw task setters", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(source, /const updateProjectTask = async[\s\S]*?setWorkflowTaskEdit[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/);
  assert.match(source, /<ProjectsPage[\s\S]*onProjectTaskUpdate=\{onProjectTaskUpdate\}/);
  assert.match(source, /<WorkflowTaskBoard[\s\S]*onChanged=\{onWorkflowRefresh\}/);
  const workflow = readFileSync(new URL("../src/components/WorkflowPanels.tsx", import.meta.url), "utf8");
  assert.match(workflow, /await api\.updateWorkflowTask/);
  assert.doesNotMatch(source, /apiClient\.(?:createTask|updateTask)\(/);
  assert.doesNotMatch(source, /setTasksByProject=/);
  assert.doesNotMatch(source, /setTasks=\{context\.setTasks\}/);
  assert.doesNotMatch(source, /setProjectTaskRecordsById=\{/);
});

test("material upload surface uses a command handler instead of raw material setters", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  const uploadSource = readFileSync(new URL("../src/components/MaterialFileDialogs.tsx", import.meta.url), "utf8");
  assert.match(source, /const refreshMaterials = async[\s\S]*?businessStateMode !== "server"[\s\S]*?apiClient\.getMaterials/);
  assert.match(source, /<MaterialsPage[\s\S]*onMaterialsRefresh=\{onMaterialsRefresh\}/);
  assert.match(uploadSource, /await api\.uploadMaterial[\s\S]*?await onSaved\(\)/);
  assert.doesNotMatch(uploadSource, /createUploadedMaterialRecord|archiveMaterial|setMaterialRecords/);
  assert.doesNotMatch(source, /setMaterials=/);
  assert.doesNotMatch(source, /setMaterialRecords=\{/);
});

test("report write surfaces await command handlers instead of marking local success", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(source, /const saveReport = async[\s\S]*?await saveReportTaskWorkflow[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/);
  assert.match(source, /const approveReport = async[\s\S]*?apiClient\.approveReport[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/);
  assert.match(source, /const exportReport = async[\s\S]*?apiClient\.exportReport[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/);
  const draftForm=readFileSync(new URL('../src/components/BusinessEntryWorkspaces.tsx',import.meta.url),'utf8');
  assert.match(source, /<ReportCreationDialog[\s\S]*?onSaved=/);
  assert.match(draftForm, /<ReportDraftForm[\s\S]*?onSaved=/);
  const creation=readFileSync(new URL('../src/components/ReportCreationDialog.tsx',import.meta.url),'utf8');
  assert.match(creation,/saved.current=await savePreparedReport/);
  assert.match(creation,/await onSaved\(saved.current!\)/);
  assert.match(draftForm, /await api\.createReport\(pending\.current\)[\s\S]*?committed\.current=true;await onSaved\(report\)/);
  assert.doesNotMatch(draftForm,/setTimeout|setCompleted/);
  assert.match(source, /const approveSelectedReport = async[\s\S]*?const updatedReport = await onApprove\(report\)[\s\S]*?if \(!updatedReport\)/);
  assert.match(source, /const exportSelectedReport = async[\s\S]*?const exportedReport = await onExport\(report,format\)[\s\S]*?if \(!exportedReport\)/);
  const assistant=readFileSync(new URL('../src/components/AiEmployeePage.tsx',import.meta.url),'utf8');assert.match(assistant,/const openBusinessPage/);assert.doesNotMatch(assistant,/api\.(createReport|archiveAiIntakeItem|createWorkflowTask|createCapitalRecord)\(/);
  assert.doesNotMatch(source, /onReportSave\(workflowDraft\);\s*setSaved\(true\)/);
  assert.doesNotMatch(source, /onReportSave\(\{[\s\S]*?\}\);\s*setConfirmedActionIndexes/);
});

test("AI intake and meeting write surfaces use command handlers instead of split local success", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(source, /const archiveAiIntake = async[\s\S]*?apiClient\.archiveAiIntakeItem[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/);
  assert.match(source, /const updateAiIntake = async[\s\S]*?apiClient\.updateAiIntakeSuggestion[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/);
  assert.match(source, /const rejectAiIntake = async[\s\S]*?apiClient\.rejectAiIntakeItem[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/);
  assert.doesNotMatch(source, /simulateAiIntakeUpload|onAiIntakeSimulate/);
  const intake=readFileSync(new URL('../src/components/IntakeUploadDialog.tsx',import.meta.url),'utf8');
  assert.match(intake,/await api\.uploadMaterial/);assert.match(intake,/await api\.createAiIntakeFromMaterial/);
  assert.match(source, /const confirmMeeting = async[\s\S]*?apiClient\.confirmMeeting[\s\S]*?if \(businessStateMode !== "local"\) return undefined;/);
  assert.match(source, /const confirmArchive = async[\s\S]*?const archivedItem = await onArchive/);
  assert.match(source, /const confirmSelectedMeeting = async[\s\S]*?const confirmedMeeting = await onConfirm\(meeting\)/);
  assert.doesNotMatch(source, /onAiIntakeArchive\(item\);\s*setConfirmedActionIndexes/);
  assert.doesNotMatch(source, /onConfirm\(meeting\);\s*setActionNotice\(null\)/);
});
