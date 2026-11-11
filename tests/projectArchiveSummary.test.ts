import {projectProgress,needsInitialChecklist,type ProgressSnapshot} from '../src/lib/dashboardProgress.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveSummary,type ArchiveData} from '../src/lib/projectArchiveSummary.ts';
import {projectModules} from '../src/lib/projectModules.ts';
const snapshot=(data:unknown)=>data as ArchiveData;
test('unread sources never become zero records or completed workflow',()=>{
 for(const module of ['尽调与决策','投资与协议','投后管理','风险与履约','项目文档','任务待办','资金事项']){
  const value=archiveSummary(module,{});assert.ok(value.steps.every(step=>step.label==='分类目录'||step.value==='待核对'||step.value==='通用 待核对 · 周期 待核对'));assert.doesNotMatch(value.conclusion,/已通过|已批准|0 项|0 笔/);
 }
});
test('each consolidated multi-view module keeps every original destination reachable',()=>{
 for(const module of projectModules.filter(module=>module.views.length>1)){
  const destinations=archiveSummary(module.name,{}).steps.map(step=>step.view);
  for(const view of module.views)assert.ok(destinations.includes(view),`${module.name}: ${view}`);
 }
});
test('an explicit empty diligence case offers preparation, without implying approval completion',()=>{
 const value=archiveSummary('尽调与决策',snapshot({diligence:null,approvals:{rounds:[]},reports:[]}));
 assert.equal(value.steps[0].value,'未建档');assert.equal(value.steps[2].value,'未发起');assert.match(value.conclusion,/确认检查范围/);
});
test('newer approval attempts supersede old returns and rejections in all three meetings',()=>{
 const rounds=['立项会','总办会','投委会'].flatMap(meetingType=>[{meetingType,status:'rejected',attempt:1,createdAt:'2026-11-07'},{meetingType,status:'approved',attempt:2,createdAt:'2026-11-06'}]);
 const value=archiveSummary('尽调与决策',snapshot({diligence:{status:'approved'},approvals:{rounds},reports:[{type:'投决分析报告'},{type:'其他报告'}]}));
 assert.equal(value.steps[2].value,'三会已通过');assert.equal(value.steps[1].value,'1 份');
});
test('investment closing needs actual closing data and signed agreements remain distinct from payment',()=>{
 const value=archiveSummary('投资与协议',snapshot({deals:[{status:'closed',agreements:[{signed:null}]},{status:'closed',closing:{time:'2026-11-08'},agreements:[{signed:{}}]}]}));
 assert.equal(value.steps[2].value,'1 批');assert.equal(value.steps[1].value,'1 份');assert.doesNotMatch(value.conclusion,/已付款/);
});
test('post-investment versions count as one underlying record and no closing remains explicit',()=>{
 const value=archiveSummary('投后管理',snapshot({post:{closedDeals:[],postInvestment:{financials:[{id:'a',version:1},{id:'a',version:2}],visits:[],archives:[]}}}));
 assert.equal(value.steps[0].value,'1 期');assert.match(value.conclusion,/尚无已确认交割/);
});
test('completed and cancelled tasks do not inflate pending tasks; known empty capital differs from unread',()=>{
 const tasks=archiveSummary('任务待办',snapshot({detail:{tasks:[{status:'已完成'},{status:'已取消'},{status:'进行中'}]}}));assert.equal(tasks.steps[1].value,'1 项');
 assert.equal(archiveSummary('资金事项',snapshot({detail:{capitalRecords:[]}})).steps[0].value,'0 笔');
 assert.equal(archiveSummary('资金事项',{}).steps[0].value,'待核对');
});

test('initial preparation never replaces exit, historical-asset or existing transaction actions',()=>{
 const base={approvals:{rounds:[]},deals:[],diligence:null};
 for(const status of ['exiting','exited','legacy_exited']){
  const value={...base,asset:{status,archiveCurrent:false,openClaimCount:0}} as unknown as ProgressSnapshot;
  assert.equal(needsInitialChecklist(value),false);assert.equal(projectProgress(value,[]).actionTab,'投资信息');
 }
 const execution={...base,exit:{executions:[{status:'recorded'}],positions:[]}} as unknown as ProgressSnapshot;assert.equal(needsInitialChecklist(execution),false);
 const active={...base,deals:[{status:'active'}]} as unknown as ProgressSnapshot;assert.equal(needsInitialChecklist(active),false);
 assert.equal(needsInitialChecklist(base as unknown as ProgressSnapshot),true);
});
