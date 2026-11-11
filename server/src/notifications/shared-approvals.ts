import {createHash} from 'node:crypto';
import type {LedgerStore} from '../ledger/store.ts';
import type {AgentRepository} from '../agent/repository.ts';
import {ObjectPolicy} from '../auth/object-access.ts';
import {getAdminUser,type AuthConfig} from '../auth/session.ts';
import {canRole,type Permission} from '../auth/rbac.ts';
import {assertReportReady} from '../ledger/report-readiness.ts';
import {requireCapitalReceipt} from '../ledger/capital-receipt.ts';
import {transitionNotices,type Flow} from './transitions.ts';
import {randomUUID} from 'node:crypto';
const token=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// These older actions use a shared permission queue rather than a designated reviewer.
export async function reconcileSharedApprovals(store:LedgerStore,repo:AgentRepository,auth:AuthConfig){
 const [reports,meetings,capital,projects,funds,users,snapshot,management]=await Promise.all([store.listReports(),store.listMeetings(),store.listCapitalRecords(),store.listProjects(),store.listFunds(),store.listUsers(),store.withObjectAccessLock(()=>store.readObjectAccessSnapshot()),store.readRecordManagement()]);
 const removed=new Set(management.entries.filter(e=>e.deletedAt).map(e=>e.id));
 const admin=getAdminUser(auth),accounts=[...users.filter(u=>u.enabled!==false&&Boolean(u.passwordHash)&&u.id!==admin.id&&u.email.toLowerCase()!==auth.adminEmail.toLowerCase()),admin];
 const policies=accounts.map(user=>({user,policy:new ObjectPolicy(user,snapshot.data,snapshot.projects,snapshot.funds,snapshot.materials,snapshot.rows)}));
 const reviewers=(permission:Permission,projectId?:string|null,fundId?:string|null)=>policies.filter(({user,policy})=>canRole(user.role,permission)&&(!projectId||policy.project(projectId))&&(!fundId||policy.fund(fundId))).map(v=>v.user.id);
 const owner=(name:string)=>{const matches=accounts.filter(u=>u.name===name);return matches.length===1?[matches[0].id]:[];};
 const flows:Flow[]=[];
 for(const r of reports){if(removed.has(r.id))continue;let ready=true;try{assertReportReady(r);}catch{ready=false;}
  flows.push({actorName:accounts.find(u=>u.id===(r.status==='已完成'?r.lastApprovalById:r.createdById))?.name??(r.status!=='已完成'?r.owner:undefined),key:'report-center:'+r.id,title:'报告审核：'+r.name,state:r.status==='已完成'?'approved':ready?'pending':'draft',token:r.updatedAt,assignees:reviewers('report:write',r.projectId,r.fundId),owners:r.createdById?[r.createdById]:owner(r.owner),href:'/reports?'+new URLSearchParams({reportId:r.id}),projectId:r.projectId??undefined,fundId:r.fundId??undefined});
 }
 for(const m of meetings){const p=projects.find(p=>p.id===m.projectId);
  flows.push({actorName:accounts.find(u=>u.id===(m.status==='已归档'?m.lastApprovalById:m.createdById))?.name,key:'meeting-confirm:'+m.id,title:'会议纪要确认：'+m.title,state:m.deletedAt||m.scheduleStatus==='cancelled'?'cancelled':m.status==='已归档'?'approved':m.status==='待确认'?'pending':'draft',token:token([m.summary,m.conclusions,m.todoItems,m.riskItems,m.taskDueDate]),assignees:reviewers('meeting:write',m.projectId,p?.fundId),owners:[...new Set([m.createdById,p?.ownerId].filter((id):id is string=>!!id))],href:'/meetings?'+new URLSearchParams({meetingId:m.id}),projectId:m.projectId??undefined,fundId:p?.fundId??undefined});
 }
 for(const c of capital){if(removed.has(c.id))continue;let ready=true;try{requireCapitalReceipt(c);}catch{ready=false;}const p=projects.find(p=>p.id===c.projectId),f=funds.find(f=>f.id===c.fundId);
  flows.push({actorName:accounts.find(u=>u.id===(c.confirmationStatus?.includes('已确认')?c.lastApprovalById:c.createdById))?.name,key:'capital-confirm:'+c.id,title:'到账确认：'+c.company,state:c.confirmationStatus?.includes('已确认')?'approved':ready?'pending':'draft',token:token([c.received,c.date,c.receivable,c.rule]),assignees:reviewers('capital:write',c.projectId,c.fundId),owners:[...new Set([c.createdById,p?.ownerId,f?.managerId].filter((id):id is string=>!!id))],href:'/capital?'+new URLSearchParams({fundId:c.fundId,capitalFund:c.fundId,fundTab:'records'})+'#capital-record-'+c.id,projectId:c.projectId??undefined,fundId:c.fundId});
 }
 await repo.transaction(s=>{
  for(const [rows,kind,label]of [[s.skills,'skills','能力共享审核'],[s.memories,'memory','记忆共享审核']] as const)for(const row of rows){if(('builtin' in row&&row.builtin)||row.scope!=='organization')continue;const key=kind+':'+(row.baseId??row.id),existing=flows.findIndex(f=>f.key===key);if(existing>=0){if(Number(flows[existing].token)>=row.version)continue;flows.splice(existing,1);}flows.push({actorName:accounts.find(u=>u.id===(row.status==='submitted'?row.ownerId:row.reviewedBy))?.name,key,title:label+'：'+row.title,state:row.status==='submitted'?'pending':row.status==='published'?'approved':row.status==='rejected'?'rejected':row.status==='withdrawn'?'cancelled':'draft',token:String(row.version??1),assignees:accounts.filter(u=>u.role==='admin').map(u=>u.id),owners:[row.ownerId],href:'/ai-assistant/'+kind+'?'+new URLSearchParams({reviewId:row.id})});}
  const events=transitionNotices({flows:s.approvalSnapshots??[],assignments:[]},{flows,assignments:[]},{id:'system',name:'系统'});
  for(const e of events){if(e.kind==='settled'){for(const n of s.notifications)if(n.ownerId===e.recipientId&&n.businessKey===e.sourceKey&&n.businessKind==='assigned')n.read=true;continue;}
   s.notifications.push({...e,id:randomUUID(),createdAt:new Date().toISOString(),scope:'personal',ownerId:e.recipientId,read:false,dedupe:'shared:'+randomUUID(),businessKey:e.sourceKey,businessToken:e.token,businessKind:e.kind,text:e.text.replace('系统提交了审批，请您处理。','有一项待您处理的审核或确认，请核对后办理。').replace('系统已处理：','处理结果：')});
  }
  s.approvalSnapshots=flows;if(events.length)s.revision++;
 });
}
