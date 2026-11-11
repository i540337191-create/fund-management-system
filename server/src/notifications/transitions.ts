import type {LedgerStore} from '../ledger/store.ts';
import {accessContext} from '../auth/object-access.ts';
import {projectTaskDestination} from '../agent/business-task-view.ts';
import {raisingView} from '../ledger/fundraising.ts';
import {stageNotices,type BusinessNotice} from './outbox.ts';
export type Flow={actorName?:string;key:string;title:string;state:string;assignees:string[];owners:string[];href:string;tasks?:string[];token?:string;projectId?:string;fundId?:string;lpSensitive?:boolean};
type Assignment={key:string;id:string;title:string;ownerId:string;status:string;href:string;projectId?:string;fundId?:string;lpSensitive?:boolean};
const uniq=(ids:(string|null|undefined)[])=>[...new Set(ids.filter((s):s is string=>Boolean(s)))];
const terminal=(status:string)=>['approved','returned','rejected','archived','closed','已完成','已取消','complete','cancelled'].includes(status);
const pending=(status:string)=>['pending','waiting','待审核','待确认'].includes(status);
const projectPath=(id:string,tab:string,q:Record<string,string>={})=>'/projects/'+encodeURIComponent(id)+'?'+new URLSearchParams({tab,...q});
function projectViews(s:any){
 const p=s.project,flows:Flow[]=[],assignments:Assignment[]=[],used=new Set<string>();
 const add=(f:Flow)=>{flows.push({...f,projectId:p.id});for(const id of f.tasks??[])used.add(id);};
 for(const r of s.rounds??[]){const tasks=(s.tasks??[]).filter((t:any)=>t.approvalRoundId===r.id).map((t:any)=>t.id);add({key:'approval:'+r.id,title:r.meetingType+'审批 · '+p.name,state:r.status,token:r.id,assignees:uniq((r.reviewers??[]).filter((u:any)=>!(r.decisions??[]).some((d:any)=>d.actor?.id===u.id)).map((u:any)=>u.id)),owners:uniq([r.ownerId,r.submittedBy?.id]),href:projectPath(p.id,'三会审批',{roundId:r.id}),tasks});}
 const d=s.diligence;
 for(const i of d?.items??[]){const v=i.submissions?.[i.submissions.length-1];if(!v)continue;add({key:'diligence-item:'+i.id,title:'尽调材料审核：'+i.title+' · '+p.name,state:i.status,token:v.id,assignees:uniq([d.ownerId,...(d.reviewers??[]).map((u:any)=>u.id)].filter((id:string)=>!(v.decisions??[]).some((q:any)=>q.actor?.id===id))),owners:uniq([i.owner?.id,v.submittedBy?.id]),href:projectPath(p.id,'尽调分析',{taskId:i.taskId}),tasks:[i.taskId,...(d.supplements??[]).filter((q:any)=>q.itemId===i.id).map((q:any)=>q.taskId)]});}
 for(const r of d?.reports??[]){add({key:'diligence-report:'+r.id,title:'尽调报告评审 · '+p.name,state:r.status,token:String(r.version),assignees:uniq((d.reviewers??[]).filter((u:any)=>!(r.decisions??[]).some((q:any)=>q.actor?.id===u.id)).map((u:any)=>u.id)),owners:uniq([d.ownerId,r.savedBy?.id]),href:projectPath(p.id,'尽调分析'),tasks:[...(r.reviewTaskIds??[]),...(d.supplements??[]).filter((q:any)=>q.reportId===r.id).map((q:any)=>q.taskId)]});}
 for(const deal of s.deals??[]){for(const t of deal.terms??[]){add({key:'terms:'+t.id,title:'投资条款审核：'+deal.title+' · '+p.name,state:t.status,token:String(t.version),assignees:uniq((deal.reviewers??[]).filter((u:any)=>!(t.decisions??[]).some((q:any)=>q.actor?.id===u.id)).map((u:any)=>u.id)),owners:uniq([deal.ownerId,t.savedBy?.id]),href:projectPath(p.id,'投资信息',{dealId:deal.id})});}
 for(const a of deal.agreements??[]){add({key:'agreement:'+a.id,title:'协议审核：'+a.title+' · '+p.name,state:a.review?'approved':'pending',token:String(a.version),assignees:uniq(a.reviewerId?[a.reviewerId]:(deal.reviewers??[]).map((u:any)=>u.id)),owners:uniq([deal.ownerId,a.generatedBy?.id]),href:projectPath(p.id,'投资信息',{dealId:deal.id})});}}
 const post=s.postInvestment;
 for(const [collection,label,tab]of [['financials','投后财务审核','投后经营'],['reports','投后报告审核','报告记录'],['exitPreparations','退出方案审核','投资信息']] as const){for(const r of post?.[collection]??[]){add({key:collection+':'+r.id,title:label+' · '+p.name,state:r.status,token:String(r.version),assignees:uniq([r.reviewer?.id]),owners:uniq([r.owner?.id]),href:projectPath(p.id,tab,{...(r.dealId?{dealId:r.dealId}:{}),...(collection==='reports'?{reportId:r.id}:{}),...(collection==='exitPreparations'?{exitPreparationId:r.id}:{})}),tasks:uniq([r.reviewerTaskId,...(r.taskIds??[])])});}}
 for(const [collection,label]of [['returnBases','收益口径审核'],['returnSamples','独立收益算例审核'],['cashflowReviews','现金流完整性审核']] as const)for(const r of post?.[collection]??[])add({key:collection+':'+r.id,title:label+' · '+p.name,state:r.status,token:String(r.version),assignees:uniq([r.reviewer?.id]),owners:uniq([r.author?.id]),href:projectPath(p.id,'投资信息',{dealId:r.scope.dealId,returnRecordId:r.id,returnVersion:String(r.version),returnHash:r.contentHash,returnFundId:r.scope.fundId})+'#returns',tasks:r.taskIds??[],fundId:r.scope.fundId});
 for(const t of s.tasks??[]){if(used.has(t.id))continue;assignments.push({key:'task:business:'+t.id,id:'business:'+t.id,title:t.name,ownerId:t.ownerId,status:t.status,projectId:p.id,href:projectTaskDestination(t)});}
 return {flows,assignments};
}
function fundViews(s:any){const flows:Flow[]=[],assignments:Assignment[]=[],f=s.fund;
 for(const c of s.data.cases??[])flows.push({key:'fund-case:'+c.id,title:'基金事务审核：'+c.title+' · '+f.name,state:c.deletedAt?'cancelled':c.status,token:c.reviewSubmissionId??String(c.round??1),assignees:uniq([c.reviewerId]),owners:uniq([c.ownerId,c.submittedById]),fundId:f.id,href:'/funds/'+encodeURIComponent(f.id)+'?'+new URLSearchParams({tab:'基金事务',lifecycleId:c.id})});
 for(const c of s.data.clauses??[])assignments.push({key:'task:fund:'+f.id+':'+c.id,id:'fund:'+f.id+':'+c.id,title:c.title,ownerId:c.ownerId,status:c.deletedAt||c.status==='resolved'?'complete':'open',fundId:f.id,href:'/funds/'+encodeURIComponent(f.id)+'?'+new URLSearchParams({tab:'条款监控',lifecycleId:c.id})});
 return {flows,assignments};
}
function lpViews(s:any){const flows:Flow[]=[],assignments:Assignment[]=[];
 for(const i of s.investors){const r=s.data.fundraising?.[i.id];if(!r)continue;
 const href='/funds/'+encodeURIComponent(i.fundId)+'?'+new URLSearchParams({tab:'募集档案',lp:i.id});
 const ready=r.requirements.some((q:any)=>!q.cancelled&&q.proof);
 flows.push({key:'lp-review:'+i.id,title:'LP资料审核：'+i.name,state:r.assessment?.decision==='approve'?'approved':r.assessment?.decision==='return'?'returned':ready?'pending':'draft',token:String(r.reviewRound??1),assignees:uniq([r.reviewerId]),owners:uniq([r.submittedById,...r.requirements.map((q:any)=>q.ownerId)]),href,fundId:i.fundId,lpSensitive:true});
 const view=raisingView(s,i.id);for(const t of view.tasks)assignments.push({key:'task:lp:'+t.id,id:'lp:'+t.id,title:t.name,ownerId:t.ownerId,status:t.status,href:t.href,fundId:i.fundId,lpSensitive:true});}
 return {flows,assignments};
}
export function transitionNotices(before:{flows:Flow[];assignments:Assignment[]},after:{flows:Flow[];assignments:Assignment[]},actor:{id:string;name:string}):Omit<BusinessNotice,'id'|'createdAt'>[]{
 const events:Omit<BusinessNotice,'id'|'createdAt'>[]=[],base=(f:Flow|Assignment)=>({sourceKey:f.key,token:'token' in f?f.token:undefined,href:f.href,actorId:actor.id,projectId:f.projectId,fundId:f.fundId,lpSensitive:f.lpSensitive});
 const emit=(f:Flow|Assignment,recipientId:string,kind:BusinessNotice['kind'],title:string,text:string,tone:BusinessNotice['tone'],taskId?:string)=>{if(recipientId)events.push({...base(f),recipientId,kind,title,text,tone,taskId});};
 for(const f of after.flows){const old=before.flows.find(v=>v.key===f.key),was=pending(old?.state??''),is=pending(f.state),newCycle=!was||old?.token!==f.token;
  if(was&&!old?.assignees.length&&(!is||f.assignees.length||newCycle))for(const id of old?.owners??[])emit({...f,key:f.key+':unassigned'},id,'settled','','','green');
  for(const id of old?.assignees??[])if(was&&(!is||!f.assignees.includes(id)||newCycle))emit(f,id,'settled','','','green');
  if(is)for(const id of f.assignees)if(newCycle||!old?.assignees.includes(id))emit(f,id,'assigned','待审批：'+f.title,(f.actorName??actor.name)+(was&&!newCycle?'将审批转交给您':'提交了审批，请您处理')+'。','red');
  if(old&&old.state!==f.state&&terminal(f.state)){const status=({approved:'已通过',returned:'已退回',rejected:'未通过',archived:'已归档',closed:'已完成',cancelled:'已取消'} as Record<string,string>)[f.state]??'状态已更新';for(const id of f.owners)if(id!==actor.id)emit(f,id,'result',f.title+' · '+status,(f.actorName??actor.name)+'已处理：'+status+(f.state==='returned'?'，请根据意见补充后重新提交。':'。'),f.state==='returned'||f.state==='rejected'?'red':'green');}
 }
 for(const f of before.flows)if(!after.flows.some(v=>v.key===f.key)&&pending(f.state))for(const id of f.assignees)emit(f,id,'settled','','','green');
 for(const t of after.assignments){const old=before.assignments.find(v=>v.key===t.key),active=!terminal(t.status);
  if(old&&!terminal(old.status)&&(!active||old.ownerId!==t.ownerId))emit(old,old.ownerId,'settled','','','green',old.id);
  if(active&&t.ownerId&&(!old||terminal(old.status)||old.ownerId!==t.ownerId))emit(t,t.ownerId,'assigned',old&&old.ownerId!==t.ownerId?'待办转交：'+t.title:'新待办：'+t.title,actor.name+(old&&old.ownerId!==t.ownerId?'将事项转交给您，请处理。':'分配了事项给您，请处理。'),'red',t.id);
 }
 return events;
}
export function notifyingLedgerStore(raw:LedgerStore):LedgerStore{return new Proxy(raw,{get(target,key){const value=Reflect.get(target,key);if(!['workflowTransaction','lifecycleTransaction','lpTransaction'].includes(String(key)))return typeof value==='function'?value.bind(target):value;
 return (...args:any[])=>{const actor=accessContext.getStore()?.actor;if(!actor)return value.apply(target,args);const index=args.findIndex(v=>typeof v==='function'),action=args[index];const project=key==='workflowTransaction',fund=key==='lifecycleTransaction',view=project?projectViews:fund?fundViews:lpViews;
 args[index]=async(s:any)=>{const before=view(s),result=await action(s);stageNotices(s,transitionNotices(before,view(s),actor));return result;};return value.apply(target,args);};}});}

export function recoverApprovalNotices(state:any,kind:'project'|'fund'|'lp',known:Set<string>){
 const view=kind==='project'?projectViews(state):kind==='fund'?fundViews(state):lpViews(state),events:Omit<BusinessNotice,'id'|'createdAt'>[]=[];
 for(const f of view.flows){if(!pending(f.state))continue;const unassigned=!f.assignees.length,recipients=unassigned?f.owners:f.assignees,key=f.key+(unassigned?':unassigned':'');
  for(const recipientId of recipients){if(known.has([recipientId,key,f.token??''].join('|')))continue;
   events.push({sourceKey:key,token:f.token,recovered:true,recipientId,kind:'assigned',title:(unassigned?'待分配审核人：':'待审批：')+f.title,text:unassigned?'本事项尚未指定审核人，请在提交时选择审核人。':'您有一项尚未处理的审批，请核对后办理。',tone:'red',href:f.href,actorId:'system',projectId:f.projectId,fundId:f.fundId,lpSensitive:f.lpSensitive});
  }
 }
 return events;
}
