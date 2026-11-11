import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/lib/apiClient.ts';
import { parseDiligenceRequirements, renderDiligenceReportHtml } from '../src/lib/diligenceReport.ts';
import type { DiligenceReport } from '../src/lib/diligenceTypes.ts';
test('diligence write carries session credentials, stable request and exact revision without client actor or stage', async () => {
  const requests: any[]=[];
  const api=createApiClient({fetchImpl:async(url,init={})=>{requests.push({url,init});return {ok:true,json:async()=>({})} as Response;}});
  const input={requestId:'same-request',expectedRevision:9,action:'submit_item' as const,itemId:'item-a',summary:'核查原件\n保留换行',evidence:[{requirementId:'req-a',materialId:'file-a'}]};
  await api.actOnDiligence('project / a',input);await api.actOnDiligence('project / a',input);
  assert.equal(requests[0].url,'/api/projects/project%20%2F%20a/diligence/actions');assert.equal(requests[0].init.credentials,'include');
  assert.equal(requests[0].init.body,requests[1].init.body);assert.deepEqual(JSON.parse(requests[0].init.body),input);
  await api.getDiligenceReport('project-a','version / a');assert.equal(requests[2].url,'/api/projects/project-a/diligence/reports/version%20%2F%20a');
});
test('editing requirement lines preserves stable evidence identities across retries',()=>{
  let sequence=0;const next=()=>`req-${++sequence}`;
  const first=parseDiligenceRequirements('财务报表\n\n客户访谈',[],next);
  const changed=parseDiligenceRequirements('  财务报表 \n 客户访谈\n法务核查',first,next);
  assert.deepEqual(changed.slice(0,2),first);assert.equal(changed[2].id,'req-3');
  assert.deepEqual(parseDiligenceRequirements('财务报表\n客户访谈\n法务核查',changed,next),changed);assert.equal(sequence,3);
});
test('HTML report exports selected historical snapshot and escapes hostile text without active HTML',()=>{
  const actor={id:'a',name:'负责人 <甲>',role:'investment_manager',email:'a@example.test'};
  const evidence={materialId:'m1',versionId:'version-frozen-v1',name:'原件 <审计>.txt',sha256:'a'.repeat(64),sizeBytes:8,downloadHref:'/api/frozen/v1'};
  const report:DiligenceReport={id:'report-v1',version:1,origin:'manual_edit',reviewTaskIds:[],status:'returned',savedBy:actor,time:'2026-10-29T01:00:00Z',sections:{findings:'存在问题',summary:'<script>alert(1)</script>',recommendation:'人工结论',workPerformed:'核验\n原件'},sourceFingerprint:'snapshot-hash',source:{items:[{id:'i',title:'财务核查',category:'财务',owner:actor,dueDate:'2026-11-01',requirements:[{id:'r',title:'报表'}],taskId:'t',status:'approved',submissions:[{id:'s',version:1,summary:'旧底稿结论',submittedBy:actor,time:'2026-10-29',status:'approved',decisions:[],evidence:[{requirementId:'r',material:evidence}]}]}],findings:[{id:'finding-only',taskId:'finding-task',evidence:[{...evidence,materialId:'finding-file',name:'发现项独立证据.txt',versionId:'finding-frozen-version',downloadHref:'/api/frozen/finding'}],description:'发现项独立资料',severity:'high',owner:actor,dueDate:'2026-11-01',itemIds:[],materialIds:['finding-file'],blocksReport:false,status:'closed',history:[]}]},decisions:[{actor,decision:'return',opinion:'补充 \"材料\"',time:'2026-10-29'}]};
  const html=renderDiligenceReportHtml('项目 <原名>',report);
  assert.ok(html.startsWith('<!doctype html>'));assert.ok(html.includes('version-frozen-v1'));assert.ok(html.includes('旧底稿结论'));assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.indexOf('<h2>尽调工作</h2>')<html.indexOf('<h2>发现与风险</h2>'));
  assert.ok(!html.includes('<script>'));assert.ok(html.includes('项目 &lt;原名&gt;'));assert.ok(html.includes('已退回'));assert.ok(html.includes('人工结论'));
  assert.ok(html.includes('发现项独立证据.txt'));assert.ok(html.includes('finding-frozen-version'));assert.ok(html.includes('/api/frozen/finding'));
  assert.ok(!html.includes('packetBlobId'));assert.ok(!html.includes('version-current-v2'));
});
test('restricted HTML display copy remains readable without reviving a hidden filename or URL',()=>{
 const actor={id:'actor',name:'负责人',role:'investment_manager',email:'fixture@example.invalid'};
 const material={materialId:'private-material',versionId:'version-v1',name:'合成姓名资料.txt',sha256:'b'.repeat(64),sizeBytes:9,downloadHref:'/api/private-stale',readIssue:'lp_privacy_forbidden'};
 const report:DiligenceReport={id:'restricted-report',version:1,origin:'manual_edit',reviewTaskIds:[],status:'approved',savedBy:actor,time:'2026-11-02T00:00:00Z',sections:{summary:'展示摘要',workPerformed:'核查说明',findings:'受限发现',recommendation:'内部说明'},sourceFingerprint:'source-hash',source:{items:[],findings:[{id:'finding',taskId:'task',evidence:[material],description:'受限来源',severity:'low',owner:actor,dueDate:'2026-11-02',itemIds:[],materialIds:[material.materialId],blocksReport:false,status:'closed',history:[]}]},decisions:[]};
 const before=structuredClone(report),html=renderDiligenceReportHtml('合成项目',report);
 assert.match(html,/当前权限展示副本/);assert.match(html,/LP资料受限/);assert.match(html,/version-v1/);
 assert.doesNotMatch(html,/合成姓名资料|\/api\/private-stale|undefined/);assert.deepEqual(report,before);
});
