import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,mkdir,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
const execFileAsync=promisify(execFile);
async function runGate(t:import('node:test').TestContext,mutation?:{file:string;before:string;after:string}){
 const root=await mkdtemp(join(tmpdir(),'workflow-static-gate-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const file of ['scripts/audit-serverization-phase1.mjs','src/App.tsx','src/components/WorkflowPanels.tsx','src/components/MaterialFileDialogs.tsx','src/lib/reportTaskSave.ts','src/components/BusinessEntryWorkspaces.tsx','src/components/IntakeUploadDialog.tsx','src/components/AiEmployeePage.tsx']){
  let source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  if(mutation?.file===file){assert.ok(source.includes(mutation.before));source=source.replace(mutation.before,mutation.after);}
  await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),source);
 }
 const {stdout}=await execFileAsync(process.execPath,[join(root,'scripts/audit-serverization-phase1.mjs'),'--soft','--json','--skip-runtime'],{cwd:root,timeout:10000,maxBuffer:2*1024*1024});
 return JSON.parse(stdout).checks as {name:string;status:string}[];
}
test('static release gate follows production task dialog, report helper and material upload paths',async t=>{
 const checks=await runGate(t);for(const name of ['business localStorage source guard','degraded business write guard','task command handler guard','material command handler guard','report command handler guard','AI intake and meeting command handler guard'])assert.equal(checks.find(check=>check.name===name)?.status,'ok',name);
});
test('static release task guard blocks an unawaited workflow task update',async t=>{
 const checks=await runGate(t,{file:'src/components/WorkflowPanels.tsx',before:'await api.updateWorkflowTask',after:'void api.updateWorkflowTask'});assert.equal(checks.find(check=>check.name==='task command handler guard')?.status,'blocked');
});
test('static release report guard blocks an unawaited missing-data task write',async t=>{
 const checks=await runGate(t,{file:'src/lib/reportTaskSave.ts',before:'await api.createWorkflowTask',after:'void api.createWorkflowTask'});assert.equal(checks.find(check=>check.name==='report command handler guard')?.status,'blocked');
});
test('static release material guard blocks optimistic refresh before saved callback resolves',async t=>{
 const checks=await runGate(t,{file:'src/components/MaterialFileDialogs.tsx',before:'await onSaved()',after:'void onSaved()'});assert.equal(checks.find(check=>check.name==='material command handler guard')?.status,'blocked');
});
test('static release AI guard rejects a navigation handler that also starts an unawaited archive',async t=>{
 const checks=await runGate(t,{file:'src/components/AiEmployeePage.tsx',before:"const openBusinessPage=(href:string)=>{",after:"const openBusinessPage=(href:string)=>{void api.archiveAiIntakeItem('unconfirmed');"});assert.equal(checks.find(check=>check.name==='AI intake and meeting command handler guard')?.status,'blocked');
});

test('static material guard rejects unawaited refresh after a confirmed upload acknowledgement',async t=>{const checks=await runGate(t,{file:'src/components/MaterialFileDialogs.tsx',before:'setFileReset(current=>current+1);await onSaved();',after:'setFileReset(current=>current+1);void onSaved();'});assert.equal(checks.find(check=>check.name==='material command handler guard')?.status,'blocked');});
test('static material guard rejects optimistic acknowledgement before the version upload resolves',async t=>{const checks=await runGate(t,{file:'src/components/MaterialFileDialogs.tsx',before:'try { await api.uploadMaterial({ file, requestId, type: material.type',after:'try { void api.uploadMaterial({ file, requestId, type: material.type'});assert.equal(checks.find(check=>check.name==='material command handler guard')?.status,'blocked');});

test('static material guard rejects an unawaited refresh hidden inside extraction invalidation',async t=>{const checks=await runGate(t,{file:'src/components/MaterialFileDialogs.tsx',before:'uploaded=true;++extractionRead.current;',after:'uploaded=true;++extractionRead.current;void onSaved();'});assert.equal(checks.find(check=>check.name==='material command handler guard')?.status,'blocked');});
test('static material guard rejects an extra write hidden inside extraction invalidation',async t=>{const checks=await runGate(t,{file:'src/components/MaterialFileDialogs.tsx',before:'uploaded=true;++extractionRead.current;',after:'uploaded=true;++extractionRead.current;void api.uploadMaterial({});'});assert.equal(checks.find(check=>check.name==='material command handler guard')?.status,'blocked');});
