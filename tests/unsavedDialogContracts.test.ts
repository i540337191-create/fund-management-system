import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('material upload and version dismissals preserve pending changes through the same close callback',()=>{
 const source=readFileSync(new URL('../src/components/MaterialFileDialogs.tsx',import.meta.url),'utf8');
 assert.match(source,/!rows.some\(row=>!row.result\)\|\|await confirmAction/);
 assert.match(source,/<FileDialog title="上传资料" busy=\{busy\} onClose=\{close\}/);
 assert.match(source,/onClick=\{close\}>取消/);
 assert.match(source,/Boolean\(file\)\|\|\[\.\.\.projectIds\].sort\(\).join\("\\0"\)!==savedProjects.current/);
 assert.match(source,/await api.updateMaterialProjects\(material.id, projectIds\); await onSaved\(\); savedProjects.current=/);
 assert.match(source,/<FileDialog title="版本与项目关联" busy=\{busy\} onClose=\{close\}/);
});
test('template cancel and backdrop retain edits and uncertain save outcomes',()=>{
 const source=readFileSync(new URL('../src/components/DocumentTemplatesPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/if\(!busy&&!unknown&&\(!draft\|\|JSON.stringify\(draft\)===draftBaseline.current\|\|await confirmAction/);
 assert.equal((source.match(/draftBaseline.current=JSON.stringify\(next\)/g)??[]).length,2);
 assert.match(source,/<WorkflowDialog(?: className="configuration-drawer")? title=\{draft.id\?'维护文档模板新版本':'新建本基金文档模板'\} busy=\{busy\} onClose=\{closeDraft\}/);
 assert.match(source,/disabled=\{busy\|\|unknown\} onClick=\{closeDraft\}>取消/);
});

test('master editor dismissal and cancellation use unsaved input protection',()=>{
 for(const name of ['FundMasterEditor','ProjectMasterEditor','CompanyRecordDialog']){
  const file=readFileSync(new URL('../src/components/'+name+'.tsx',import.meta.url),'utf8');
  const source=file.slice(file.indexOf('export function '+name+'('));
  assert.match(source,/onChangeCapture=\{(?:\(\)|event)=>\{dirty.current=true;/);
  assert.match(source,/if\(!busy&&\(!dirty.current\|\|Boolean\(committed\)\|\|await confirmAction/);
  assert.match(source,name==='FundMasterEditor'?/busy=\{busy\|\|flowBusy\} onClose=\{close\}/:/busy=\{busy\} onClose=\{close\}/);
  if(name==='FundMasterEditor')assert.match(source,/if\(busy\|\|flowBusy\)return;/);
 }
});
test('return basis editor uses one guarded close path for cancel and overlay',()=>{
 const file=readFileSync(new URL('../src/components/ReturnBasisEditor.tsx',import.meta.url),'utf8');
 const source=file.slice(file.indexOf('export function ReturnEditor('));
 assert.match(source,/if \(!busy && \(!dirty.current \|\| Boolean\(committed\) \|\| await confirmAction/);
 assert.match(source,/busy=\{busy\} onClose=\{close\}><form onChangeCapture=/);
 assert.match(source,/disabled=\{busy\} onClick=\{close\}/);
});

test('account editor keeps unsaved or uncertain input behind one guarded close callback',()=>{
 const source=readFileSync(new URL('../src/components/AccountSettingsPanel.tsx',import.meta.url),'utf8').split('function AccountEditor(')[1];
 assert.match(source,/const changed=\(\)=>\{dirty.current=true;/);
 assert.match(source,/if\(busy\|\|working.current\)return;/);
 assert.match(source,/if\(!committed&&\(dirty.current\|\|pending.current\)&&!await confirmAction/);
 assert.match(source,/<WorkflowDialog title=\{title\} busy=\{busy\} onClose=\{close\}/);
 assert.match(source,/disabled=\{busy\} onClick=\{close\}>取消/);
});

test('project task and approval decision drafts share their guarded overlay and cancel paths',()=>{
 const file=readFileSync(new URL('../src/components/WorkflowPanels.tsx',import.meta.url),'utf8');
 for(const name of ['DecisionDialog','WorkflowTaskDialog']){
  const source=file.slice(file.indexOf('function '+name+'(')).split('\nexport function ')[0];
  assert.match(source,/const dirty=useRef\(false\)/);
  assert.match(source,/const close=async\(\)=>\{if\(busy\)return;if\(dirty.current&&!await confirmAction/);
  assert.match(source,/<WorkflowDialog title=\{[^\n]+busy=\{busy\} onClose=\{close\}><form[^\n]+onChangeCapture=\{\(\)=>\{dirty.current=true;\}\}/);
  if(name==='WorkflowTaskDialog')assert.match(source,/className=\{button\} onClick=\{close\}>取消/);
 }
});
