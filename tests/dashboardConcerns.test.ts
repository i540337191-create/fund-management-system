import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardConcerns,dashboardConcernAttention} from '../src/lib/dashboardConcerns.ts';
import {dashboardHighlights} from '../src/lib/dashboardHighlights.ts';
const now=Date.parse('2026-11-10T12:00:00+08:00');
const projects=[{id:'p',name:'项目甲',shortName:'甲',fundId:'f',risk:'低',updatedAt:'2026-11-01'}] as any, funds=[{id:'f',name:'基金甲',shortName:'甲基金'}] as any;
const r={id:'r',projectId:'p',title:'真实风险',target:'项目甲',type:'经营',level:'高',status:'待跟进',source:'登记',time:'2026-11-01',summary:'风险原文'} as any;
const task=(id:string,extra={})=>({id,item:id,status:'待确认',priority:'高',path:'/tasks?taskId='+id,...extra});
test('one concern list covers registered/reference risks, fund/project/material/approval and high-priority cross-object work',()=>{
 const result=dashboardConcerns({projects,funds,risks:[r],references:[{...r,id:undefined,title:'高等级待核验参考',status:undefined,dataOrigin:'seed_demo'}],tasks:[task('fund',{fundId:'f'}),task('review',{projectId:'p',module:'三会审批'}),task('material',{module:'资料补充'}),task('normal',{priority:'中'}),task('closed',{status:'已完成'}),task('unavailable',{sourceUnavailable:true})]},now);
 assert.equal(result.length,5);assert.ok(result.some(r=>r.id==='reference:高等级待核验参考'&&r.status==='待核验'&&r.dataOrigin==='seed_demo'));
 assert.ok(result.some(r=>r.fundId==='f'&&r.taskId==='fund'));assert.ok(!result.some(r=>['closed','normal','unavailable'].includes(r.taskId??'')));
 const focus=dashboardConcernAttention(result,projects,funds,now).slice(0,3);assert.deepEqual(focus.map(f=>f.path),result.slice(0,3).map(r=>r.path));
});
test('resolved/deleted/cancelled work exits; formal risk and its generated followup count once; references follow persisted handling',()=>{
 const rows=dashboardConcerns({projects,funds,risks:[r,{...r,id:'done',title:'处理完',status:'已处理'},{...r,id:'deleted',title:'已删除',deletedAt:'2026-11-10'}],references:[{...r,title:'处理完',status:undefined},{...r,title:'已删除',status:undefined}],tasks:[task('risk:r',{projectId:'p'}),task('cancelled',{status:'cancelled'})]},now);
 assert.deepEqual(rows.map(r=>r.id),['risk:r']);
});
test('material findings require current visible version, preserve evidence and link to exact document',()=>{
 const material={id:'m',currentVersionId:'v',name:'协议',status:'已入库',time:'2026-11-10',fundId:'f'} as any;
 const finding={materialId:'m',versionId:'v',name:'协议',message:'附件待核对',page:2,quote:'待补附件'};
 const rows=dashboardConcerns({projects,funds,risks:[],tasks:[],materials:[material],findings:[finding,{...finding,materialId:'hidden'},{...finding,versionId:'old'}]},now);
 assert.equal(rows.length,1);assert.match(rows[0].summary,/第2页：待补附件/);assert.equal(rows[0].path,'/materials?materialId=m');
});
test('open diligence findings deduplicate tasks; latest approval only; high project master risk not lost',()=>{
 const snapshots={p:{diligence:{findings:[{id:'df',taskId:'dt',status:'open',severity:'high',description:'尽调发现',dueDate:'2026-11-09'}]},approvals:{rounds:[{id:'old',attempt:1,meetingType:'立项会',createdAt:'2026-10-01',status:'returned',decisions:[]},{id:'latest',attempt:2,meetingType:'立项会',createdAt:'2026-11-01',status:'approved',decisions:[]}]}}} as any;
 const rows=dashboardConcerns({projects,funds,risks:[],tasks:[task('business:dt',{projectId:'p'})],snapshots},now);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'diligence:df');
 const master=dashboardConcerns({projects:[{...projects[0],risk:'高'}],funds,risks:[],tasks:[]},now);assert.equal(master[0].category,'项目风险');
});
test('priority then overdue/due-time ordering; top three are not removed when also shown on mountain',()=>{
 const tasks=[task('future',{fundId:'f',dueAt:'2026-11-12T12:00:00+08:00'}),task('overdue',{projectId:'p',dueAt:'2026-11-09T12:00:00+08:00'}),task('today',{dueAt:'2026-11-10T14:00:00+08:00'}),task('second',{dueAt:'2026-11-10T15:00:00+08:00'})];
 const rows=dashboardConcerns({projects,funds,risks:[],tasks},now);assert.deepEqual(rows.map(r=>r.taskId),['overdue','today','second','future']);
 const focus=dashboardConcernAttention(rows,projects,funds,now).slice(0,3);assert.equal(focus.length,3);assert.equal(focus[0].signal,'overdue');
 const highlights=dashboardHighlights(tasks.map(t=>({...t,action:'现在处理' as const})),rows,projects,funds,now);assert.equal(highlights[0].taskId,'overdue');assert.equal(highlights[0].path,'/tasks?taskId=overdue');
});

test('project checklist problems and fund archive suggestions enter concerns with precise destinations; zero is not a missing amount',()=>{
 const ps=[{...projects[0],risk:'低'}],fs=[{...funds[0],scale:'0元',invested:'待核对',balance:'0',updatedAt:'2026-11-10'}];
 const snapshots={p:{diligence:{items:[{id:'item',taskId:'check',title:'合规原件',requirements:[{id:'required'}],submissions:[],dueDate:'2026-11-09'}],findings:[]}}} as any;
 const rows=dashboardConcerns({projects:ps as any,funds:fs as any,risks:[],tasks:[task('business:check',{projectId:'p'})],snapshots,fundFindings:[{fundId:'f',checkedAt:'2026-11-10',fields:[{label:'核对版本',detail:'核对已登记附件版本',tab:'资料档案',action:'核对',kind:'review'}]}]},now);
 assert.ok(rows.some(r=>r.id==='project-material:p:item'&&r.level==='高'&&r.path.includes('taskId=check')));
 assert.ok(rows.some(r=>r.id==='fund-field:f:已投金额'));assert.ok(rows.some(r=>r.id==='fund-review:f:核对版本'));
 assert.ok(!rows.some(r=>r.id==='task:business:check'));assert.ok(!rows.some(r=>r.title.includes('规模')||r.title.includes('余额')));
});
