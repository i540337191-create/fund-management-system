import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardTaskAction,dashboardTaskOrder,dashboardTaskRelation} from '../src/lib/dashboardTaskPresentation.ts';
import {icebergFundStages,icebergProjectStages,lifecycleNodes,icebergProjectStage} from '../src/lib/dashboardLifecycle.ts';
const now=Date.parse('2026-11-07T10:00:00+08:00');
test('dashboard action buckets cover overdue, today, priority, Beijing week and observation without mutating workflow status',()=>{
 const task={id:'t',status:'未开始',dueAt:'2026-11-06T23:59:59+08:00'};
 assert.equal(dashboardTaskAction(task,now),'现在处理');assert.equal(task.status,'未开始');
 assert.equal(dashboardTaskAction({id:'t',dueAt:'2026-11-07T23:59:59+08:00'},now),'今日跟进');
 assert.equal(dashboardTaskAction({id:'t',dueAt:'2026-11-08T23:59:59+08:00'},now),'本周处理');
 assert.equal(dashboardTaskAction({id:'t',dueAt:'2026-11-09T00:00:00+08:00'},now),'持续观察');
 assert.equal(dashboardTaskAction({id:'t',priority:'高'},now),'持续观察');
 assert.equal(dashboardTaskAction({id:'t',dueAt:'invalid'},now),'持续观察');
 assert.equal(dashboardTaskAction({id:'t',status:'已逾期'},now),'现在处理');
 assert.equal(dashboardTaskAction({id:'t',dueAt:'2026-11-09T00:00:00+08:00'},Date.parse('2026-11-09T00:00:00+08:00')),'今日跟进');
});
test('queue prioritizes action then due date then creation, retaining undated and all records',()=>{
 const tasks=[{id:'later',dueAt:'2026-11-08T01:00:00+08:00'},{id:'undated'},{id:'new',createdAt:'2026-11-07T00:00:00Z',dueAt:'2026-11-07T11:00:00+08:00'},{id:'old',createdAt:'2026-11-06T00:00:00Z',dueAt:'2026-11-07T11:00:00+08:00'},{id:'overdue',dueAt:'2026-11-06T12:00:00+08:00'}];
 assert.deepEqual(dashboardTaskOrder(tasks,now).map(t=>t.id),['overdue','new','old','later','undated']);assert.equal(tasks[0].id,'later');
});
test('relations distinguish primary fund, verified joint closing, explicit task fund and unresolved objects',()=>{
 const funds=[{id:'f1',name:'甲基金'},{id:'f2',name:'乙基金'}],project={id:'p',name:'项目甲',fundId:'f1'};
 const deals=[{status:'closed',closing:{termsId:'approved'},terms:[{id:'approved',status:'approved',allocations:[{fundId:'f1'},{fundId:'f2'}]},{id:'draft',status:'draft',allocations:[{fundId:'not-approved'}]}]}] as any;
 const relation=dashboardTaskRelation({projectId:'p',fundId:'f2'},project,funds,deals);
 assert.match(relation,/主归属基金：甲基金 → 项目：项目甲/);assert.match(relation,/交割出资基金：甲基金、乙基金/);assert.match(relation,/任务指定基金：乙基金/);assert.ok(!relation.includes('待核验'));
 assert.match(dashboardTaskRelation({projectId:'p'},project,funds),/交割出资关系待核验/);
 assert.equal(dashboardTaskRelation({fundId:'f2'},undefined,funds),'基金：乙基金');assert.match(dashboardTaskRelation({projectId:'missing'},undefined,funds),/待核验/);assert.match(dashboardTaskRelation({},undefined,funds),/未绑定/);
});
test('five project phases and four fund periods preserve unknowns and follow verified workflow before stale master stage',()=>{
 assert.deepEqual(icebergProjectStages,['初筛','立项','尽调','投决','投后']);assert.deepEqual(icebergFundStages,['募集期','投资期','投后管理','退出期']);
 assert.equal(icebergProjectStage('初筛','尽调办理'),'尽调');assert.equal(icebergProjectStage('初筛','交易交割'),'投决');assert.equal(icebergProjectStage('初筛','投后管理'),'投后');assert.equal(icebergProjectStage('初筛','未发起'),'初筛');
 assert.deepEqual(lifecycleNodes('投资期',icebergFundStages),['complete','current','pending','pending']);assert.ok(lifecycleNodes(icebergProjectStage('投后','读取失败'),icebergProjectStages).every(n=>n==='unknown'));
});
