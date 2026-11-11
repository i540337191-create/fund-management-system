import type {RiskItem} from '../data/risks';
import type {Project} from '../data/projects';
import {overviewRequirements} from '../iterationB/projectOverviewModel.ts';
import type {Fund} from '../data/funds';
import type {FundCompletenessField,ApiMaterial} from './apiClient';
import type {ProgressSnapshot} from './dashboardProgress';
import type {DashboardDecisionItem} from './workbenchLogic';
import {findProjectForTarget} from './workbenchLogic.ts';
import {dashboardTaskAction} from './dashboardTaskPresentation.ts';
import {openDashboardTask,activeDashboardRisk,type DashboardPriorityTask} from './dashboardSelection.ts';
export type DashboardConcern=RiskItem&{id:string;category:string;path:string;fundId?:string;dueAt?:string;createdAt?:string;taskId?:string};
export type MaterialConcernFinding={materialId:string;versionId:string;name:string;message:string;page:number;quote:string;checkedAt?:string};
export type FundConcernFinding={fundId:string;fields:FundCompletenessField[];checkedAt:string};
type Task=DashboardPriorityTask&{item:string;priority?:string;module?:string;path?:string;note?:string;dataOrigin?:string;dataPurpose?:string};
const dateDue=(value:string)=>/^\d{4}-\d\d-\d\d$/.test(value)?value+'T23:59:59+08:00':value;
export function dashboardConcerns({risks,references=[],projects,funds,tasks,materials=[],snapshots={},findings=[],fundFindings=[]}:{risks:RiskItem[];references?:RiskItem[];projects:Project[];funds:Fund[];tasks:Task[];materials?:ApiMaterial[];snapshots?:Record<string,ProgressSnapshot>;findings?:MaterialConcernFinding[];fundFindings?:FundConcernFinding[]},now=Date.now()):DashboardConcern[]{
 const rows:DashboardConcern[]=[],representedTasks=new Set<string>();
 const allowed=(projectId?:string|null,fundId?:string)=>projectId?projects.some(p=>p.id===projectId):fundId?funds.some(f=>f.id===fundId):true;
 for(const r of risks.filter(activeDashboardRisk)){
  if(!allowed(r.projectId))continue;
  const id=r.id??r.title;representedTasks.add('risk:'+id);
  rows.push({...r,id:'risk:'+id,category:'风险登记',path:r.projectId?'/projects/'+encodeURIComponent(r.projectId)+'?'+new URLSearchParams({tab:'风险监控',riskId:id}):'/monitoring?riskId='+encodeURIComponent(id)});
 }
 for(const r of references.filter(activeDashboardRisk)){
  // A persisted handling result overrides its original reference row, including deletion.
  if(risks.some(saved=>saved.title===r.title&&saved.target===r.target))continue;
  const project=r.projectId?projects.find(p=>p.id===r.projectId):findProjectForTarget(projects,r.target);
  if(r.projectId&&!project)continue;
  rows.push({...r,id:'reference:'+(r.id??r.title),projectId:project?.id,category:'风险参考',status:r.status||'待核验',path:'/monitoring?risk='+encodeURIComponent(r.title)});
 }
 for(const project of projects){
  const snapshot=snapshots[project.id],diligence=snapshot?.diligence;
  if(diligence!==undefined){
   for(const item of overviewRequirements(diligence)){
    if(!item.missing&&!item.unreadable)continue;representedTasks.add('business:'+item.taskId);
    const source=diligence?.items.find(i=>i.id===item.id),dueAt=source?.dueDate?dateDue(source.dueDate):undefined;
    rows.push({id:'project-material:'+project.id+':'+item.id,projectId:project.id,fundId:project.fundId,target:project.name,title:item.title+'：资料待补齐或核对',summary:'待补原件 '+item.missing+' 项，待读取 '+item.unreadable+' 项。',level:dueAt&&Date.parse(dueAt)<now?'高':'中',status:'待核验',category:'项目资料',type:'资料清单',source:'尽调资料清单',time:'',dueAt,path:'/projects/'+encodeURIComponent(project.id)+'?'+new URLSearchParams({tab:'尽调分析',taskId:item.taskId}),dataOrigin:project.dataOrigin,dataPurpose:project.dataPurpose});
   }
  }
  for(const f of diligence?.findings??[]){if(f.status!=='open')continue;representedTasks.add('business:'+f.taskId);rows.push({id:'diligence:'+f.id,projectId:project.id,fundId:project.fundId,target:project.name,title:f.description,summary:f.description,level:f.severity==='high'?'高':f.severity==='medium'?'中':'低',status:'待处理',category:'尽调发现',type:'尽调风险',source:'尽调分析',time:'',dueAt:dateDue(f.dueDate),path:'/projects/'+encodeURIComponent(project.id)+'?'+new URLSearchParams({tab:'尽调分析',taskId:f.taskId}),dataOrigin:project.dataOrigin,dataPurpose:project.dataPurpose});}
  const latest=new Map<string,NonNullable<ProgressSnapshot['approvals']>['rounds'][number]>();
  for(const round of snapshot?.approvals?.rounds??[]){const prior=latest.get(round.meetingType);if(!prior||round.attempt>prior.attempt||round.attempt===prior.attempt&&round.createdAt>prior.createdAt)latest.set(round.meetingType,round);}
  for(const round of latest.values()){
   if(!['returned','rejected'].includes(round.status))continue;
   if(tasks.some(t=>t.projectId===project.id&&t.path?.includes('roundId='+encodeURIComponent(round.id))&&openDashboardTask(t)))continue;
   rows.push({id:'approval:'+round.id,projectId:project.id,fundId:project.fundId,target:project.name,title:round.meetingType+(round.status==='returned'?'审批退回':'审批未通过'),summary:round.decisions[round.decisions.length-1]?.opinion||round.note,level:'高',status:round.status==='returned'?'待补充':'待核验',category:'审批事项',type:'审批异常',source:'三会审批',time:round.createdAt,createdAt:round.createdAt,dueAt:dateDue(round.dueDate),path:'/projects/'+encodeURIComponent(project.id)+'?'+new URLSearchParams({tab:'三会审批',roundId:round.id}),dataOrigin:project.dataOrigin,dataPurpose:project.dataPurpose});
  }
  if(project.risk==='高'&&!rows.some(r=>r.projectId===project.id&&r.level==='高'))rows.push({id:'project-level:'+project.id,projectId:project.id,fundId:project.fundId,target:project.name,title:'项目高风险等级待核验',summary:project.latest||project.nextAction,level:'高',status:'待核验',category:'项目风险',type:'项目风险等级',source:'项目档案',time:project.updatedAt,path:'/projects/'+encodeURIComponent(project.id)+'?tab='+encodeURIComponent('风险监控'),dataOrigin:project.dataOrigin,dataPurpose:project.dataPurpose});
 }
 for(const fund of funds){
  for(const [label,value,tab] of [['基金规模',fund.scale,'概览'],['已投金额',fund.invested,'账户资金'],['账户余额',fund.balance,'账户资金']] as const){
   if(typeof value!=='string'||!(/待|未|—/.test(value)||!value.trim()))continue;
   rows.push({id:'fund-field:'+fund.id+':'+label,fundId:fund.id,target:fund.name,title:label+'待核对',summary:'当前台账记录：'+(value||'未填写'),level:'中',status:'待核验',category:'基金档案',type:'档案核对',source:'基金台账',time:fund.updatedAt,path:'/funds/'+encodeURIComponent(fund.id)+'?tab='+encodeURIComponent(tab),dataOrigin:fund.dataOrigin,dataPurpose:fund.dataPurpose});
  }
 }
 for(const review of fundFindings){
  const fund=funds.find(f=>f.id===review.fundId);if(!fund)continue;
  for(const field of review.fields)rows.push({id:(field.kind==='missing'?'fund-field:':'fund-review:')+fund.id+':'+field.label,fundId:fund.id,target:fund.name,title:field.label,summary:field.detail,level:'中',status:'待核验',category:'基金档案核查',type:'基金档案',source:field.kind==='review'?'AI档案核查':'基金台账',time:review.checkedAt,path:'/funds/'+encodeURIComponent(fund.id)+'?tab='+encodeURIComponent(field.tab),dataOrigin:fund.dataOrigin,dataPurpose:fund.dataPurpose});
 }
 for(const task of tasks){
  if(!openDashboardTask(task)||representedTasks.has(task.id)||!allowed(task.projectId,task.fundId))continue;
  const overdue=dashboardTaskAction(task,now)==='现在处理',high=['高','high','urgent','紧急'].includes(task.priority??'');
  if(!overdue&&!high&&!/风险|预警|退回|待核验|补件|资料补充|材料缺失|补齐材料|核对适用条件|业务材料/.test((task.module??'')+' '+task.item))continue;
  const project=projects.find(p=>p.id===task.projectId),fund=funds.find(f=>f.id===(task.fundId??project?.fundId));
  rows.push({id:'task:'+task.id,taskId:task.id,projectId:task.projectId,fundId:task.fundId??project?.fundId,target:project?.name??fund?.name??'跨对象事项',title:task.item,summary:task.note||task.module||'',level:high||overdue?'高':'中',status:task.status||'待处理',category:task.module||'待办事项',type:'待办关注',source:task.module||'任务中心',time:task.createdAt??'',createdAt:task.createdAt,dueAt:task.dueAt,path:task.path||'/tasks',dataOrigin:task.dataOrigin,dataPurpose:task.dataPurpose});
 }
 for(const finding of findings){
  const material=materials.find(m=>m.id===finding.materialId&&m.currentVersionId===finding.versionId);if(!material)continue;
  rows.push({id:'material:'+material.id+':'+finding.page+':'+finding.message,projectId:material.projectId,fundId:material.fundId??undefined,target:material.name,title:finding.message,summary:'第'+finding.page+'页：'+finding.quote,level:'中',status:'待核验',category:'资料核查',type:'资料问题',source:'AI资料核查',time:finding.checkedAt??'',path:'/materials?materialId='+encodeURIComponent(material.id),dataOrigin:material.dataOrigin,dataPurpose:material.dataPurpose});
 }
 for(const material of materials){
  if(!/识别失败|待补充|缺失|校验失败/.test(material.status)||rows.some(r=>r.id.startsWith('material:'+material.id+':')))continue;
  rows.push({id:'material:'+material.id,projectId:material.projectId,fundId:material.fundId??undefined,target:material.name,title:material.name+' · '+material.status,summary:material.status,level:'中',status:'待核验',category:'资料异常',type:'资料问题',source:'资料库',time:material.time,path:'/materials?materialId='+encodeURIComponent(material.id),dataOrigin:material.dataOrigin,dataPurpose:material.dataPurpose});
 }
 return dashboardConcernOrder([...new Map(rows.map(r=>[r.id,r])).values()],now);
}
export function dashboardConcernOrder(rows:readonly DashboardConcern[],now=Date.now()){
 const due=(r:DashboardConcern)=>Number.isFinite(Date.parse(r.dueAt??''))?Date.parse(r.dueAt!):Infinity;
 const bucket=(r:DashboardConcern)=>({现在处理:0,今日跟进:1,本周处理:2,持续观察:3}[dashboardTaskAction({id:r.id,dueAt:r.dueAt,status:r.status},now)]);
 return rows.slice().sort((a,b)=>({高:0,中:1,低:2}[a.level]-{高:0,中:1,低:2}[b.level])||bucket(a)-bucket(b)||due(a)-due(b)||(b.createdAt??b.time).localeCompare(a.createdAt??a.time)||a.id.localeCompare(b.id));
}
export function dashboardConcernAttention(rows:DashboardConcern[],projects:Project[],funds:Fund[],now=Date.now()):DashboardDecisionItem[]{
 return dashboardConcernOrder(rows,now).map(r=>{const p=projects.find(p=>p.id===r.projectId),f=funds.find(f=>f.id===r.fundId),bucket=dashboardTaskAction({id:r.id,dueAt:r.dueAt,status:r.status},now),action=r.level==='高'||bucket==='现在处理'?'现在处理':bucket==='今日跟进'?'今日跟进':bucket==='本周处理'?'本周推进':'持续观察';return {project:p?.shortName||p?.name||f?.shortName||f?.name||r.target,signal:[r.status==='待核验'?'待核验':'',r.dataPurpose==='engineering_fixture'?'工程测试':r.dataOrigin==='seed_demo'?'模拟':'',r.title].filter(Boolean).join(' · '),reason:r.summary,path:r.path,importance:r.level==='高'?'高重要':'中重要',urgency:action==='现在处理'?'高紧急':'低紧急',action,tone:r.level==='高'?'red':r.level==='中'?'gold':'green'};});
}
