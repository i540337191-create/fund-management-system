import {projectTaskDestination} from './business-task-view.ts';
import {templateSourceAllowed,templateSourceReadable} from './template-source.ts';
import {nextScheduleAt,taskPreparation,DEFAULT_REMIND_AHEAD_MINUTES,businessDueAt,sameBusinessDate} from './time.ts';
import {canReadMaterial} from '../http/material-files.ts';
import {canReadLp} from '../ledger/lp-privacy.ts';
import type {FastifyInstance} from 'fastify';
import type {LedgerStore} from '../ledger/store.ts';
import {randomUUID} from 'node:crypto';
import {resolveAuthConfig,createRegisteredSessionCookie,type AuthConfigInput,type SessionUser} from '../auth/session.ts';
import {bootstrapSessionBinding,sessionHash} from '../auth/registered-session.ts';
import {accountUser} from '../ledger/accounts.ts';
import {fail} from '../ledger/workflow.ts';
import {accessContext,type ObjectPolicy,objectPolicy} from '../auth/object-access.ts';
import {lifecycleView} from '../ledger/fund-lifecycle.ts';
import {raisingView} from '../ledger/fundraising.ts';
import {AgentRepository} from './repository.ts';
import {enabledSkills,visible,type AgentState,type Skill,type Run,type Schedule,type Owned} from './model.ts';
export function skillAllows(skill:Skill,module:string){
 const category=module==='audit'||module.startsWith('field_export_')?'knowledge':module==='business_intake'?'intake':['material_versions','material_completeness'].includes(module)?'knowledge':module==='admin_accounts'||module.endsWith('_access')?'admin_accounts':['document_templates','report_template_import'].includes(module)||module.startsWith('schema_')?'template':['fund_lifecycle','fund_deals','fund_completeness'].includes(module)?'fund':/investor|lp_ledger|fundraising/.test(module)?'investors':/report/.test(module)?'report':/capital|cashflow|ledger|returns/.test(module)?'capital':/risk/.test(module)?'risk':/meeting/.test(module)?'meeting':module==='tasks'?'task':'project';
 return skill.tools.includes(category)||skill.tools.includes(module);
}
export function scopeAllowed(s:AgentState,row:{projectId?:string;fundId?:string;scopeIds?:string[];scheduleId?:string;taskId?:string;objectType?:string;objectId?:string;materialIds?:string[];attachments?:{materialId:string}[];data?:Record<string,unknown>;source?:string;lpSensitive?:boolean},policy?:ObjectPolicy):boolean{
 if(!policy||policy.actor.role==='admin')return true;
 if((row.source==='LP募集'||row.lpSensitive)&&!canReadLp(policy.actor))return false;
 if(row.data&&!scopeAllowed(s,row.data as typeof row,policy))return false;
 if(row.materialIds?.some(id=>!row.attachments?.some(a=>a.materialId===id)&&!policy.allowsKnown(id)))return false;
 if(row.projectId&&!policy.project(row.projectId)||row.fundId&&!policy.fund(row.fundId)||row.scopeIds?.some(id=>!policy.allowsKnown(id)))return false;
 if(row.objectId&&row.objectType==='project'&&!policy.project(row.objectId)||row.objectId&&row.objectType==='fund'&&!policy.fund(row.objectId))return false;
 const parent=row.scheduleId?s.schedules.find(x=>x.id===row.scheduleId):row.taskId?s.tasks.find(x=>x.id===row.taskId):undefined;
 return !parent||scopeAllowed(s,parent,policy);
}
export async function agentContext(repository:AgentRepository,actor:SessionUser,skillId?:string,store?:LedgerStore){
 const policy=await accessContext.getStore()?.refresh?.()??(store?await objectPolicy(store,actor):undefined),today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),sourceMaterials=store?await store.listMaterials():[];
 const readableSource=(id:string)=>sourceMaterials.some(m=>m.id===id&&canReadMaterial(actor,m)&&(!policy||policy.allowsKnown(id)));
 return repository.transaction(s=>{
  const skills=enabledSkills(s,actor).filter(skill=>(!skill.catalogueArchivedAt||skill.id===skillId)&&(skill.materialIds??[]).every(readableSource));if(skillId&&!skills.some(x=>x.id===skillId))fail('skill_unavailable',409);const selected=skillId?skills.filter(x=>x.id===skillId):skills;
  return {skills:selected,plugins:s.plugins.filter(p=>visible(p,actor)&&p.enabled&&p.connected&&selected.some(x=>x.pluginIds.includes(p.id))),memories:s.memories.filter(x=>!x.catalogueArchivedAt&&skills.some(k=>k.tools.includes('memory'))&&visible(x,actor)&&x.enabled&&(x.scope==='personal'||x.status==='published')&&(!x.effectiveFrom||x.effectiveFrom<=today)&&(!x.effectiveUntil||x.effectiveUntil>=today)&&(x.sourceMaterialIds??[]).every(readableSource)),templates:s.templates.filter(x=>visible(x,actor)&&x.status==='published'&&x.enabled!==false&&templateSourceAllowed(x,policy)&&templateSourceReadable(x,sourceMaterials,actor)),drafts:s.drafts.filter(x=>x.ownerId===actor.id&&x.status==='draft'&&scopeAllowed(s,x,policy)).map(x=>({id:x.id,title:x.title,objectType:x.objectType,objectId:x.objectId,missing:x.missing,candidates:x.candidates,updatedAt:x.updatedAt})),tasks:s.tasks.filter(x=>x.ownerId===actor.id&&!['complete','cancelled'].includes(x.status)&&scopeAllowed(s,x,policy)),instruction:selected.map(x=>`能力：${x.title}（V${x.version}）\n${x.instructions}`).join('\n\n')};
 });
}
export function queueRun(s:AgentState,actor:SessionUser,skillId:string,prompt:string,schedule?:Schedule):Run{
 if(schedule?.catalogueArchivedAt)fail('agent_record_not_found',404);
 const skill=enabledSkills(s,actor).find(x=>x.id===skillId);if(!skill)fail('skill_unavailable',409);
 const row:Run={id:randomUUID(),ownerId:actor.id,scope:'personal',skillId,title:schedule?.title??skill.title,status:'queued',result:'',createdAt:new Date().toISOString(),actor,prompt,...(schedule?{scheduleId:schedule.id,projectId:schedule.projectId,fundId:schedule.fundId}:{})};s.runs.push(row);return row;
}
export function workspaceRuntime(server:FastifyInstance,store:LedgerStore,repository:AgentRepository,authInput?:AuthConfigInput){
 const auth=resolveAuthConfig(authInput);let timer:ReturnType<typeof setInterval>|undefined,ticking=false,closed=false;
 async function serviceCookie(a:SessionUser){
  const sid=randomUUID(),hash=sessionHash(sid),expiresAt=new Date(Date.now()+240000).toISOString();
  await store.accountTransaction(s=>{if(a.id!=='user-admin'){const u=s.users.find(u=>u.id===a.id);if(!u||!accountUser(u).canLogin||u.role!==a.role)fail('schedule_owner_unavailable',403);}s.sessions.push({hash,actorId:a.id,expiresAt});});
  const cookie=createRegisteredSessionCookie(sid,auth.sessionSecret,{bootstrapBinding:a.id==='user-admin'?bootstrapSessionBinding(auth):undefined,maxAgeSeconds:240}).split(';')[0];
  return {cookie,dispose:()=>store.accountTransaction(s=>{s.sessions=s.sessions.filter(x=>x.hash!==hash);})};
 }
 async function run(actor:SessionUser,skillId:string,prompt:string,scheduleId?:string,cookie?:string,reservedId?:string):Promise<Run>{
  const token=randomUUID();
  const claimed=await repository.transaction(s=>{
   const execution=reservedId?s.runs.find(x=>x.id===reservedId):queueRun(s,actor,skillId,prompt,s.schedules.find(x=>x.id===scheduleId));if(!execution||execution.ownerId!==actor.id)fail('run_not_found',404);
   if(execution.status!=='queued')return {execution,execute:false};
   if(!enabledSkills(s,actor).some(x=>x.id===skillId)){execution.status='blocked';execution.error='skill_unavailable';execution.result='能力或插件已停用，本次未执行。';return {execution,execute:false};}
   execution.status='running';execution.leaseToken=token;execution.leaseUntil=new Date(Date.now()+240000).toISOString();s.revision++;return {execution,execute:true};
  });
  if(!claimed.execute)return claimed.execution;
  const execution=claimed.execution;let session:Awaited<ReturnType<typeof serviceCookie>>|undefined;
  const heartbeat=setInterval(()=>void repository.transaction(s=>{const row=s.runs.find(x=>x.id===execution.id);if(row?.status==='running'&&row.leaseToken===token)row.leaseUntil=new Date(Date.now()+240000).toISOString();}).catch(()=>{}),30000);heartbeat.unref();
  try{
   session=cookie?undefined:await serviceCookie(actor);const headers={cookie:cookie??session!.cookie};
   const created=await server.inject({method:'POST',url:'/api/ai/conversations',headers,payload:{requestId:randomUUID(),includeDemo:true,...(execution.fundId?{fundId:execution.fundId}:{})}});if(![200,201].includes(created.statusCode))fail('agent_conversation_unavailable',created.statusCode);
   const c=created.json();const response=await server.inject({method:'POST',url:`/api/ai/conversations/${encodeURIComponent(c.id)}/turns`,headers,payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt,skillId,...(execution.projectId?{projectId:execution.projectId}:{}),...(execution.fundId?{fundId:execution.fundId}:{})}});
   if(response.statusCode!==200)fail(response.json().error??'agent_execution_failed',response.statusCode);
   const done=response.body.split('\n\n').filter(x=>x.startsWith('event: done\n')).at(-1);if(!done)fail('agent_result_incomplete',502);
   const data=JSON.parse(done.slice(done.indexOf('data: ')+6)),message=data.conversation?.messages.filter((m:any)=>m.role==='assistant').at(-1);if(!message||message.status!=='complete')fail('agent_result_incomplete',502);
   execution.status='complete';execution.result=message.content;execution.href='/ai-assistant?conversation='+encodeURIComponent(c.id);
   const provenance=await store.assistantTransaction(actor.id+':'+actor.role,s=>s.conversations.find(x=>x.id===c.id)?.messages.filter(x=>x.role==='assistant').at(-1)?.scopeIds??[]);execution.scopeIds=provenance;
  }catch(error){execution.status=(error as any)?.status===403?'blocked':'error';execution.error=String((error as any)?.code??'agent_execution_failed');execution.result='本次未完成，请检查能力、账号权限、模型服务和执行记录后重试。';}
  finally{clearInterval(heartbeat);await session?.dispose();}
  execution.finishedAt=new Date().toISOString();delete execution.leaseUntil;
  return repository.transaction(s=>{const row=s.runs.find(x=>x.id===execution.id);if(!row||row.leaseToken!==token||row.status!=='running')return row??execution;Object.assign(row,execution);delete row.leaseToken;delete row.actor;delete row.prompt;const schedule=s.schedules.find(x=>x.id===scheduleId);if(schedule)schedule.lastRunId=execution.id;notice(s,actor.id,execution.title,execution.status==='complete'?'执行结果已生成；涉及业务写入的确认卡请继续核对。':'执行未完成：'+execution.error,execution.status==='complete'?'green':'red','run:'+execution.id,execution.href,undefined,{projectId:row.projectId,fundId:row.fundId,scopeIds:row.scopeIds});s.revision++;return row;});
 }
 async function syncBusiness(){return accessContext.exit(()=>syncAllBusiness());}
 async function syncAllBusiness(){
  const users=await store.listUsers(),tasks=await store.listTasks(),derived:any[]=[];
  for(const t of tasks){const named=users.filter(u=>u.name===t.owner);const ownerId=t.ownerId??(named.length===1?named[0].id:undefined);if(!ownerId)continue;const dueAt=businessDueAt(t.dueDate);derived.push({id:'business:'+t.id,title:t.name,note:t.kind??'',ownerId,scope:'personal',dueAt,dueBasis:t.dueDate?(dueAt?'日期型截止按北京时间当日结束':'原截止日期无效，请到来源任务核对'):undefined,remindAheadMinutes:DEFAULT_REMIND_AHEAD_MINUTES,status:t.status==='已完成'?'complete':t.status==='已取消'?'cancelled':'open',source:'项目业务',projectId:t.projectId,href:projectTaskDestination(t)});}
  const funds=await store.listFunds();for(const f of funds){const v=await store.lifecycleTransaction(f.id,async s=>lifecycleView(s));const rows=[...v.clauses.map(t=>({...t,targetTab:'条款监控',name:t.title,state:t.deletedAt?'cancelled':t.status==='resolved'?'complete':'open'})),...v.cases.map(t=>({...t,targetTab:'基金事务',name:t.title,state:t.deletedAt?'cancelled':['submitted','archived'].includes(t.status)?'complete':'open'})),...v.charges.map(t=>({...t,targetTab:'费用流水',name:t.title,state:t.cancelled?'cancelled':t.remaining==='0.00'?'complete':'open'}))];for(const t of rows)derived.push({id:'fund:'+f.id+':'+t.id,title:t.name,note:'基金运营事项',ownerId:t.ownerId,scope:'personal',dueAt:businessDueAt(t.dueDate),dueBasis:businessDueAt(t.dueDate)?'日期型截止按北京时间当日结束':'原截止日期无效，请到来源任务核对',remindAheadMinutes:DEFAULT_REMIND_AHEAD_MINUTES,status:t.state,source:'基金运营',dataOrigin:f.dataOrigin,dataPurpose:f.dataPurpose,fundId:f.id,href:'/funds/'+encodeURIComponent(f.id)+'?'+new URLSearchParams({tab:t.targetTab,lifecycleId:t.id,...(t.targetTab==='费用流水'?{feeId:t.id}:{})})});}

  await store.lpTransaction(s=>{for(const investor of s.investors){const v=raisingView(s,investor.id);for(const t of v.tasks)derived.push({id:'lp:'+t.id,title:t.name,note:t.note||'投资者募集事项',ownerId:t.ownerId,scope:'personal',dueAt:businessDueAt(t.dueDate),dueBasis:businessDueAt(t.dueDate)?'日期型截止按北京时间当日结束':'原截止日期无效，请到来源任务核对',remindAheadMinutes:DEFAULT_REMIND_AHEAD_MINUTES,status:t.status==='已完成'?'complete':t.status==='已取消'?'cancelled':'open',source:'LP募集',dataOrigin:investor.dataOrigin,dataPurpose:investor.dataPurpose,fundId:investor.fundId,href:t.href});}});
  await repository.transaction(s=>{let changed=false;const ids=new Set(derived.map(x=>x.id));for(const row of derived){row.sourceUnavailable=false;row.sourceStatus=undefined;const old=s.tasks.find(x=>x.id===row.id),preferred=s.preferences?.[row.ownerId]?.remindAheadMinutes??DEFAULT_REMIND_AHEAD_MINUTES,previousDefault=(old as (typeof old)&{reminderDefault?:number})?.reminderDefault??1440;row.remindAheadMinutes=old&&(old.reminderCustom||old.remindAheadMinutes!==previousDefault)?old.remindAheadMinutes:preferred;row.reminderCustom=old?.reminderCustom;row.reminderDefault=preferred;if(old){const before=JSON.stringify(old);const migrated=Boolean(row.dueBasis&&old.dueBasis!==row.dueBasis&&sameBusinessDate(old.dueAt,row.dueAt)&&new Date(Date.parse(old.dueAt!)+8*3600000).toISOString().slice(11)==='00:00:00.000Z');const reminder={remindedFor:migrated&&old.remindedFor?old.remindedFor.replace(old.dueAt!,row.dueAt):old.remindedFor,snoozedUntil:old.snoozedUntil};if(old.ownerId!==row.ownerId)for(const n of s.notifications.filter(n=>n.taskId===old.id&&n.ownerId===old.ownerId))n.read=true;Object.assign(old,row,old.ownerId===row.ownerId&&(old.dueAt===row.dueAt&&old.remindAheadMinutes===row.remindAheadMinutes||migrated)?reminder:{remindedFor:undefined,snoozedUntil:undefined});if(before!==JSON.stringify(old))changed=true;}else{row.createdAt=new Date().toISOString();s.tasks.push(row);changed=true;}}for(const row of s.tasks)if(['项目业务','基金运营','LP募集'].includes(row.source??'')&&!ids.has(row.id)&&!row.sourceUnavailable){row.sourceUnavailable=true;row.sourceStatus='来源待核验';changed=true;}if(changed)s.revision++;});
 }
 async function tick(now=new Date()){
  if(ticking||closed)return;ticking=true;
  try{
   await syncBusiness();
   const tasks=await repository.transaction(s=>[...s.tasks.filter(t=>t.dueAt&&!['complete','cancelled'].includes(t.status)),...s.reminders.filter(r=>r.status==='scheduled')]),policies=new Map<string,ObjectPolicy>();
   for(const t of tasks){if(policies.has(t.ownerId))continue;const u=(await store.listUsers()).find(u=>u.id===t.ownerId);const a:SessionUser|undefined=t.ownerId==='user-admin'?{id:'user-admin',name:'管理员',email:auth.adminEmail,role:'admin'}:u&&accountUser(u).canLogin?u:undefined;if(a)policies.set(t.ownerId,await objectPolicy(store,a));}
   const due=await repository.transaction(s=>{
    const stamp=now.toISOString();let changed=false;
    for(const r of s.runs)if(r.status==='running'&&r.leaseUntil&&r.leaseUntil<stamp){r.status='error';r.error='execution_interrupted';r.result='执行中断，需核对实际业务后再重试。';r.finishedAt=stamp;delete r.leaseToken;notice(s,r.ownerId,r.title,r.result,'red','interrupted:'+r.id,r.href,undefined,{projectId:r.projectId,fundId:r.fundId,scopeIds:r.scopeIds});changed=true;}
    for(const reminder of s.reminders){if(reminder.status!=='scheduled'||Date.parse(reminder.dueAt)>now.getTime()||!policies.has(reminder.ownerId))continue;notice(s,reminder.ownerId,reminder.title,reminder.text||'自定义提醒已到设定时间。','yellow','reminder:'+reminder.id+':'+reminder.version,'/tasks/notifications');reminder.status='delivered';reminder.deliveredAt=stamp;changed=true;}
    for(const task of s.tasks){if(task.sourceUnavailable||!task.dueAt||['complete','cancelled'].includes(task.status)||!policies.has(task.ownerId)||!scopeAllowed(s,task,policies.get(task.ownerId)))continue;if(taskPreparation(task,now.getTime())==='preparing'){
     const dedupe='preparation:'+task.id+':'+task.dueAt;let preparationSent=false;
     if(!s.notifications.some(n=>n.ownerId===task.ownerId&&(n.dedupe===dedupe||task.dueBasis?.startsWith('日期型截止')&&n.dedupe.startsWith('preparation:'+task.id+':')&&sameBusinessDate(n.dedupe.slice(('preparation:'+task.id+':').length),task.dueAt)))){notice(s,task.ownerId,task.title,'已进入截止前48小时准备阶段；请核对所需资料并开始准备。原业务状态保持不变。','yellow',dedupe,task.href??'/tasks',task.id,{projectId:task.projectId,fundId:task.fundId,lpSensitive:task.source==='LP募集'||Boolean(task.lpSensitive)});changed=true;preparationSent=true;}
     // A late scheduler tick coalesces preparation and an already-due reminder.
     if(preparationSent&&Date.parse(task.snoozedUntil??task.dueAt)-(task.snoozedUntil?0:task.remindAheadMinutes*60000)<=now.getTime()){
      const key=task.dueAt+':'+(task.snoozedUntil??'')+':ahead';if(task.remindedFor!==key){task.remindedFor=key;changed=true;}
     }
     if(task.remindAheadMinutes===DEFAULT_REMIND_AHEAD_MINUTES&&!task.snoozedUntil)continue;
    }
    const trigger=Date.parse(task.snoozedUntil??task.dueAt)-(task.snoozedUntil?0:task.remindAheadMinutes*60000),key=task.dueAt+':'+(task.snoozedUntil??'')+':'+(Date.parse(task.dueAt)<now.getTime()?'overdue':'ahead');if(trigger<=now.getTime()&&task.remindedFor!==key){notice(s,task.ownerId,task.title,task.note||'请核对并处理这项待办。',Date.parse(task.dueAt)<now.getTime()?'red':'yellow','task:'+task.id+':'+key,task.href??'/tasks',task.id,{projectId:task.projectId,fundId:task.fundId,lpSensitive:task.source==='LP募集'||Boolean(task.lpSensitive)});task.remindedFor=key;changed=true;}}
    for(const task of s.schedules.filter(x=>!x.catalogueArchivedAt&&x.enabled&&x.nextAt<=stamp)){
     if(s.runs.some(r=>r.scheduleId===task.id&&['queued','running'].includes(r.status)))continue;
     if(!enabledSkills(s,task.actor).some(x=>x.id===task.skillId)){task.enabled=false;notice(s,task.ownerId,task.title,'依赖能力或插件已停用，定时任务已暂停。','yellow','blocked:'+task.id+':'+task.nextAt,'/ai-assistant/schedules',undefined,{projectId:task.projectId,fundId:task.fundId});changed=true;continue;}
     queueRun(s,task.actor,task.skillId,task.prompt,task);const next=nextScheduleAt(task,now);if(next)task.nextAt=next;else task.enabled=false;changed=true;
    }
    if(changed)s.revision++;return s.runs.filter(x=>x.status==='queued').map(x=>structuredClone(x));
   });
   for(const item of due)if(item.actor)await run(item.actor,item.skillId,item.prompt??'',item.scheduleId,undefined,item.id);
  }finally{ticking=false;}
 }
 return {run,tick,syncBusiness,start(){timer=setInterval(()=>void tick().catch(()=>server.log.error({code:'agent_scheduler_failed'})),15000);timer.unref();},close(){closed=true;if(timer)clearInterval(timer);}};
}
export function notice(s:AgentState,ownerId:string,title:string,text:string,tone:'red'|'yellow'|'green',dedupe:string,href?:string,taskId?:string,scope?:{projectId?:string;fundId?:string;scopeIds?:string[];lpSensitive?:boolean}){if(s.notifications.some(x=>x.ownerId===ownerId&&x.dedupe===dedupe))return;s.notifications.push({id:randomUUID(),ownerId,scope:'personal',title,text,tone,read:false,createdAt:new Date().toISOString(),dedupe,href,taskId,...scope});}
