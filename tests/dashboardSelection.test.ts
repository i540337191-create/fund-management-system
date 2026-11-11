import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardObjectOrder,dashboardPersonalSchedule,dashboardRiskAttention,dashboardRiskOrder,isManagedDashboardFund} from '../src/lib/dashboardSelection.ts';
import {dashboardHighlights} from '../src/lib/dashboardHighlights.ts';
const now=Date.parse('2026-11-10T12:00:00+08:00');
const projects=[{id:'old',name:'旧项目',fundId:'f1',createdAt:'2026-01-01'},{id:'new',name:'新项目',fundId:'f2',createdAt:'2026-11-10'},{id:'risk',name:'风险项目',fundId:'f3',createdAt:'2026-01-02'}];
const funds=projects.map((p)=>({id:p.fundId,name:p.fundId,createdAt:p.createdAt}));
const task=(id:string,projectId:string,dueAt:string)=>({id,projectId,dueAt,item:id,status:'待确认',action:'持续观察' as const});
const risk=(id:string,projectId:string,level:'高'|'中'|'低'='高')=>({id,projectId,level,title:id,target:projectId,type:'经营',source:'登记',time:'2026-01-01',summary:'原始登记',status:'待跟进'});
test('managed funds keep exit-period records; only explicit terminal state excludes',()=>{
 for(const stage of ['募集期','投资期','投后管理','退出期'])assert.equal(isManagedDashboardFund({stage}),true);
 assert.equal(isManagedDashboardFund({stage:'退出期',status:'已退出'}),false);
});
test('object summaries prioritize active risk and dated work, otherwise newest created; do not mutate source',()=>{
 const tasks=[task('due','old','2026-11-09T10:00:00+08:00')],risks=[risk('r','risk')];
 assert.deepEqual(dashboardObjectOrder(projects,'project',projects,tasks,risks,now).map(p=>p.id),['risk','old','new']);
 assert.deepEqual(dashboardObjectOrder(funds,'fund',projects,tasks,risks,now).map(p=>p.id),['f3','f1','f2']);
 assert.deepEqual(dashboardObjectOrder(projects,'project',projects,[],[],now).map(p=>p.id),['new','risk','old']);
 assert.deepEqual(dashboardObjectOrder(funds,'fund',projects,[{id:'fund-task',fundId:'f1',dueAt:'2026-11-10T15:00:00+08:00'}],[],now).map(p=>p.id),['f1','f2','f3']);
 assert.equal(projects[0].id,'old');
 assert.equal(dashboardObjectOrder(projects,'project',projects,[{...tasks[0],status:'complete'}],[{...risks[0],status:'已处理'}],now)[0].id,'new');
});
test('callouts use high risk, overdue, today, then this week; ignore undated priority and completed/unavailable work',()=>{
 const rows=[task('week','new','2026-11-12T12:00:00+08:00'),task('today','risk','2026-11-10T13:00:00+08:00'),task('late','old','2026-11-09T12:00:00+08:00')];
 assert.deepEqual(dashboardHighlights(rows,[],projects,funds,now).map(t=>t.taskId),['late','today']);
 assert.deepEqual(dashboardHighlights(rows,[risk('r','new')],projects,funds,now).map(t=>t.id),['risk:r','task:late']);
 assert.deepEqual(dashboardHighlights([{...rows[0],dueAt:undefined,priority:'高'}],[],projects,funds,now),[]);
});
test('attention is risks only, sorted severity then linked open deadline; mountain risks excluded, risk occurrence time is not due date',()=>{
 const risks=[risk('medium','old','中'),risk('high-later','new'),risk('high-oldest','risk')];
 const tasks=[task('a','new','2026-11-09T12:00:00+08:00'),task('b','risk','2026-11-08T12:00:00+08:00')];
 assert.deepEqual(dashboardRiskOrder(risks,tasks).map(r=>r.id),['high-oldest','high-later','medium']);
 const attention=dashboardRiskAttention(risks,tasks,projects,['risk:high-oldest'],now);
 assert.deepEqual(attention.map(r=>r.signal),['high-later','medium']);
 assert.equal(attention[1].action,'持续观察');
 assert.equal(dashboardRiskOrder([{...risks[0],deletedAt:'2026-11-10'}, {...risks[1],status:'已处理'}]).length,0);
});
test('schedule is personal, open and next seven days, ordered by exact time; overdue separate and boundaries preserved',()=>{
 const rows=[{id:'evening',ownerId:'u',dueAt:'2026-11-10T18:00:00+08:00'}, {id:'afternoon',ownerId:'u',dueAt:'2026-11-10T13:00:00+08:00'}, {id:'other',ownerId:'other',dueAt:'2026-11-10T13:00:00+08:00'}, {id:'late',ownerId:'u',dueAt:'2026-11-10T11:59:59+08:00'}, {id:'done',ownerId:'u',dueAt:'2026-11-10T13:00:00+08:00',status:'complete'}, {id:'no-date',ownerId:'u'}, {id:'end',ownerId:'u',dueAt:new Date(now+7*86400000).toISOString()}, {id:'now',ownerId:'u',dueAt:new Date(now).toISOString()}];
 const result=dashboardPersonalSchedule(rows,'u',now);
 assert.deepEqual(result.schedule.map(t=>t.id),['now','afternoon','evening']);assert.deepEqual(result.overdue.map(t=>t.id),['late']);
 assert.deepEqual(dashboardPersonalSchedule(rows,undefined,now),{schedule:[],overdue:[]});
});
