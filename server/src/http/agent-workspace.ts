import {templateMaterial} from '../ledger/template-material.ts';
import {creationOrder} from '../ledger/creation-order.ts';
import {assertReusableSkill} from '../agent/skill-sharing.ts';
import {reportWeekRange} from '../agent/report-week.ts';
import {templateChangePreview} from '../ledger/template-change.ts';
import {templateSchemaPlan} from '../ledger/template-schema.ts';
import {projectTaskView,otherBusinessTaskView} from '../agent/business-task-view.ts';
import {taskPreparation,DEFAULT_REMIND_AHEAD_MINUTES} from '../agent/time.ts';
import {canReadMaterial} from './material-files.ts';
import {canReadLp} from '../ledger/lp-privacy.ts';
import {probePlugin} from '../agent/connectors.ts';
import {writeSchema} from '../ledger/custom-fields.ts';
import {randomUUID,createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {LedgerStore} from '../ledger/store.ts';
import {resolveAuthConfig,type AuthConfigInput,type SessionUser} from '../auth/session.ts';
import {resolveRequestUser} from '../auth/authorize.ts';
import {canRole} from '../auth/rbac.ts';
import {accessContext} from '../auth/object-access.ts';
import {WorkflowError,fail,object,string,requestId} from '../ledger/workflow.ts';
import {AgentRepository} from '../agent/repository.ts';
import {emptyAgentState,visible,assertEditable,enabledSkills,type AgentState,type Owned,type Skill,type Memory,type Template,type WorkTask,type Schedule} from '../agent/model.ts';
import {workspaceRuntime,notice,scopeAllowed,queueRun} from '../agent/runtime.ts';
import {workspaceProposalInput} from '../agent/actions.ts';

const stamp=(v:unknown,required=true)=>{
 if(!required&&(v===undefined||v===''))return undefined;
 const m=typeof v==='string'?/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(v):null;
 if(!m)fail('invalid_schedule_date');const parts=m!.slice(1,7).map(x=>Number(x??0)),local=new Date(Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5]));
 if(local.getUTCFullYear()!==parts[0]||local.getUTCMonth()+1!==parts[1]||local.getUTCDate()!==parts[2]||local.getUTCHours()!==parts[3]||local.getUTCMinutes()!==parts[4]||local.getUTCSeconds()!==parts[5]||!Number.isFinite(Date.parse(v as string)))fail('invalid_schedule_date');return new Date(v as string).toISOString();
};
const integer=(v:unknown,min:number,max:number)=>{if(!Number.isSafeInteger(v)||Number(v)<min||Number(v)>max)fail('invalid_integer');return Number(v);};
const text=(v:unknown,max=1000,required=true)=>string(v,required,max);
function activePolicy(){return accessContext.getStore()?.refresh?.();}
function workspaceProposalCollection(action:string):'skills'|'plugins'|'schedules'|'tasks'|'reminders'|'notifications'|'memories'|'templates'|'weeklyReports'|undefined{
 if(action==='apply_template')return 'templates';
 if(action==='save_report_binding'||action==='save_preferences')return;
 if(action.includes('reminder')&&!action.includes('task'))return 'reminders';
 if(action.includes('notice'))return 'notifications';
 if(action.includes('schedule'))return 'schedules';
 if(action.includes('skill'))return 'skills';
 if(action.includes('plugin'))return 'plugins';
 if(action.includes('memory'))return 'memories';
 if(action.includes('template'))return 'templates';
 if(action.includes('weekly'))return 'weeklyReports';
 if(action.includes('task'))return 'tasks';
}
function workspaceTargetFingerprint(row:Owned){const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;return createHash('sha256').update(JSON.stringify(canonical(row))).digest('hex');}
export function registerAgentWorkspaceRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput;repository:AgentRepository;startScheduler?:boolean}){
 const repository=options.repository,auth=resolveAuthConfig(options.auth),runtime=workspaceRuntime(server,store,repository,options.auth);
 const actor=(r:any)=>{const a=resolveRequestUser(r,auth);if(!a)fail('unauthenticated',401);return a;};
 const handler=(fn:(r:any,p:any)=>Promise<unknown>)=>async(r:any,p:any)=>{try{return await fn(r,p);}catch(e){if(e instanceof WorkflowError||typeof(e as any)?.status==='number')return p.code((e as any).status).send({error:(e as any).code??'agent_operation_failed'});r.log.error({code:'agent_operation_failed'});return p.code(500).send({error:'agent_operation_failed'});}};
 async function view(a:SessionUser){const policy=await activePolicy(),materials=await store.listMaterials();const sourcesReadable=(ids:string[]|undefined)=>(ids??[]).every(id=>materials.some(m=>m.id===id&&canReadMaterial(a,m)&&(canReadLp(a)||!m.lpSensitive&&!m.relationships?.investors?.length)));return repository.transaction(s=>{
  const valid=(x:Owned&{projectId?:string;fundId?:string})=>visible(x,a)&&scopeAllowed(s,x,policy);
  return {reminders:creationOrder(s.reminders.filter(x=>x.ownerId===a.id)),skillHistory:s.skillHistory.filter(x=>!s.skills.some(k=>k.catalogueArchivedAt&&(k.id===x.id||k.id===x.baseId))&&visible(x,a)&&(x.scope==='personal'||x.builtin&&!['draft','submitted'].includes(x.status??'')||x.status==='published'||x.ownerId===a.id||a.role==='admin')&&sourcesReadable(x.materialIds)),memoryHistory:s.memoryHistory.filter(x=>!s.memories.some(m=>m.catalogueArchivedAt&&(m.id===x.id||m.id===x.baseId||m.baseId===x.id))&&visible(x,a)&&(x.scope==='personal'||x.status==='published'||x.ownerId===a.id||a.role==='admin')&&sourcesReadable(x.sourceMaterialIds)),preferences:s.preferences[a.id]??{remindAheadMinutes:DEFAULT_REMIND_AHEAD_MINUTES},templateHistory:s.templateHistory.filter(x=>visible(x,a)&&sourcesReadable(x.sourceMapping?[x.sourceMapping.materialId]:[])),revision:s.revision,proposals:creationOrder(s.proposals.filter(x=>x.ownerId===a.id&&scopeAllowed(s,x,policy))),skills:creationOrder(s.skills.filter(x=>!x.catalogueArchivedAt&&visible(x,a)&&sourcesReadable(x.materialIds)&&(x.scope==='personal'||x.builtin&&!['draft','submitted'].includes(x.status??'')||x.status==='published'||x.ownerId===a.id||a.role==='admin')).map(x=>({...x,globallyEnabled:x.enabled,submittedReviewId:s.skills.find(t=>t.submittedFrom===x.id&&t.status==='submitted')?.id,enabled:x.enabled&&s.overrides[a.id]?.[x.id]!==false,available:enabledSkills(s,a).some(k=>k.id===x.id)}))),plugins:creationOrder(s.plugins.filter(x=>!x.catalogueArchivedAt&&visible(x,a))),schedules:creationOrder(s.schedules.filter(x=>!x.catalogueArchivedAt&&x.ownerId===a.id&&valid(x)).map(({actor,...x})=>x)),runs:creationOrder(s.runs.filter(x=>!x.catalogueArchivedAt&&x.ownerId===a.id&&scopeAllowed(s,x,policy)).map(({actor,prompt,leaseToken,...row})=>row)),tasks:creationOrder(s.tasks.filter(x=>(x.ownerId===a.id||x.createdBy===a.id||['项目业务','基金运营','LP募集'].includes(x.source??''))&&scopeAllowed(s,x,policy)).map(x=>({...x,preparation:taskPreparation(x)}))),notifications:creationOrder(s.notifications.filter(x=>x.ownerId===a.id&&scopeAllowed(s,x,policy)&&(!x.snoozedUntil||Date.parse(x.snoozedUntil)<=Date.now()))),memories:creationOrder(s.memories.filter(x=>!x.catalogueArchivedAt&&visible(x,a)&&sourcesReadable(x.sourceMaterialIds)&&(x.scope==='personal'||x.status==='published'||x.ownerId===a.id||a.role==='admin'))),templates:creationOrder(s.templates.filter(x=>visible(x,a)&&sourcesReadable(x.sourceMapping?[x.sourceMapping.materialId]:[])&&(x.status==='published'||x.ownerId===a.id||a.role==='admin'))),weeklyReports:creationOrder(s.weeklyReports.filter(x=>x.ownerId===a.id&&scopeAllowed(s,x,policy))),drafts:creationOrder(s.drafts.filter(x=>x.ownerId===a.id&&scopeAllowed(s,x,policy))),reportBindings:s.reportBindings.filter(x=>x.ownerId===a.id).map(x=>({...x,templateSnapshot:x.templateSnapshot??[...s.templates,...s.templateHistory].find(t=>t.id===x.templateId&&t.version===x.version)})).filter(x=>sourcesReadable(x.templateSnapshot?.sourceMapping?[x.templateSnapshot.sourceMapping.materialId]:[])),audit:s.audit.filter(x=>x.actorId===a.id||a.role==='admin').slice(-100).reverse()};
 });}
 async function enrichedView(a:SessionUser){
  await runtime.syncBusiness();
  const [data,users,projects,funds,materials,projectTasks,reports,capital,meetings,riskRecords,exitStates]=await Promise.all([view(a),store.listUsers(),store.listProjects(),store.listFunds(),store.listMaterials(),store.listTasks(),store.listReports(),store.listCapitalRecords(),store.listMeetings(),store.listRisks(),store.readExitStates()]);
  return {...data,currentUserId:a.id,tasks:projectTaskView(projectTasks,[...data.tasks,...otherBusinessTaskView(reports,capital,meetings,[...exitStates.flatMap(s=>s.postInvestment?.manualRisks??[]),...riskRecords.filter(r=>!exitStates.some(s=>s.postInvestment?.manualRisks?.some(m=>m.id===r.id)))])]).map(x=>({...x,...(x.projectId&&projects.find(p=>p.id===x.projectId)?.fundId?{fundId:projects.find(p=>p.id===x.projectId)!.fundId}:{}),...(x.source==='业务材料'&&x.draftId?{href:'/tasks?'+new URLSearchParams({intakeDraft:x.draftId,...(x.id.includes(':field:')?{field:x.id.split(':field:')[1]}:{})})}:{}),preparation:taskPreparation(x),canConfigureReminder:x.ownerId===a.id||x.createdBy===a.id})),materials:materials.filter(m=>canReadMaterial(a,m)&&(canReadLp(a)||!m.lpSensitive&&!m.relationships?.investors?.length)).map(m=>({id:m.id,name:m.name})),users:[...users.filter(u=>u.enabled!==false).map(u=>({id:u.id,name:u.name,role:u.role})),...(!users.some(u=>u.id===a.id)?[{id:a.id,name:a.name,role:a.role}]:[])],projects:projects.map(p=>({id:p.id,name:p.name})),funds:funds.map(f=>({id:f.id,name:f.name}))};
 }
 server.get('/api/agent-workspace',handler(async r=>enrichedView(actor(r))));
 server.post('/api/agent-workspace/proposals',handler(async r=>{
  const a=actor(r),b=object(r.body,['action','data','title']);const action=text(b.action,80);
  if(['save_template','apply_template'].includes(action)&&a.role!=='admin')fail('forbidden',403);if(action==='save_task'&&!canRole(a.role,'task:write'))fail('forbidden',403);
  if(!b.data||typeof b.data!=='object'||Array.isArray(b.data)||JSON.stringify(b.data).length>60000)fail('invalid_action_payload');const data=workspaceProposalInput(action,b.data,a),allowed=await enrichedView(a),policy=await activePolicy();
  if(!scopeAllowed({} as AgentState,data,policy))fail('forbidden',403);
  for(const [key,rows] of [['projectId',allowed.projects],['fundId',allowed.funds],['ownerId',allowed.users]] as const)if(data[key]!==undefined&&!rows.some(x=>x.id===data[key]))fail('action_object_unavailable',409);
  for(const key of ['materialIds','sourceMaterialIds'] as const)if(data[key]!==undefined&&(!Array.isArray(data[key])||(data[key] as unknown[]).some(id=>!allowed.materials.some(m=>m.id===id))))fail('source_material_unavailable',403);
  const targetCollection=workspaceProposalCollection(action),target=targetCollection&&data.id!==undefined?(allowed[targetCollection] as Owned[]).find(x=>x.id===data.id):undefined;
  if(data.id!==undefined&&(!target))fail('agent_record_not_found',404);
  if(target&&target.scope==='personal'&&target.ownerId!==a.id&&!['save_task','configure_task_reminder','snooze_task','complete_task','cancel_task'].includes(action))fail('forbidden',403);
  if(target&&['save_skill','save_memory','save_schedule','save_template','save_weekly','save_reminder'].includes(action)&&data.version!==target.version)fail('workspace_target_changed',409);
  if(target&&['save_skill','save_memory','save_template','save_weekly','restore_skill','restore_memory'].includes(action))assertEditable(target,a);
  if(target&&['submit_memory','submit_skill','withdraw_skill_submission','toggle_schedule','run_schedule','save_schedule','save_reminder','cancel_reminder','read_notice','snooze_notice'].includes(action)&&target.ownerId!==a.id)fail('forbidden',403);
  if(target&&['save_task','configure_task_reminder','snooze_task','complete_task','cancel_task'].includes(action)){const task=target as WorkTask;if(task.ownerId!==a.id&&task.createdBy!==a.id)fail('forbidden',403);if(['save_task','complete_task','cancel_task'].includes(action)&&task.source&&task.source!=='个人安排')fail('business_task_requires_source_action',409);}
  if(targetCollection&&action!=='apply_template'&&!action.startsWith('save_')&&data.id===undefined&&!(action==='read_notice'&&data.all===true))fail('action_missing_fields');
  if(action==='save_report_binding'&&(!canRole(a.role,'report:write')||!(await store.listReports()).some(x=>x.id===data.reportId)||!allowed.templates.some(t=>t.id===data.templateId&&t.version===data.version)))fail('action_object_unavailable',409);
  return repository.transaction(async s=>{const prepared=action==='apply_template'?templateChangePreview(data,s.templates):null;const proposed=prepared?{...prepared.data,...(['company','project','fund'].includes(prepared.data.objectType)?{expectedSchemaRevision:await store.masterTransaction(master=>master.schemas[prepared.data.objectType as 'company'|'project'|'fund'].schemaRevision)}:{})}:data;const row=targetCollection&&data.id!==undefined?(s[targetCollection] as Owned[]).find(x=>x.id===data.id):undefined;if(targetCollection&&data.id!==undefined&&!row)fail('business_task_requires_source_action',409);const proposal={...(row?{targetFingerprint:workspaceTargetFingerprint(row)}:{}),...(prepared?{preview:prepared.preview}:{}),id:randomUUID(),ownerId:a.id,scope:'personal' as const,action,data:proposed,title:text(b.title,200),state:'pending' as const,actionRequestId:randomUUID(),createdAt:new Date().toISOString()};s.proposals.push(proposal);s.revision++;return {proposal};});
 }));
 server.post('/api/agent-workspace/actions',handler(async r=>{
  const a=actor(r),body=object(r.body,['requestId','expectedRevision','action','data']),rid=requestId(body.requestId),action=text(body.action,80),data=object(body.data??{},['id','title','description','instructions','category','tools','pluginIds','enabled','scope','version','builtin','kind','endpoint','connected','status','skillId','prompt','nextAt','intervalMinutes','projectId','fundId','lastRunId','ownerId','note','dueAt','remindAheadMinutes','source','href','until','all','text','objectType','stage','fields','materials','week','thisWeek','nextWeek','reportId','templateId','materialIds','priority','isDefault','appliesTo','effectiveFrom','effectiveUntil','sourceMaterialIds','conflictNote','recurrence','taskIds','expectedSchemaRevision','reviewedForSharing']);
  if(action==='apply_template'){
   if(a.role!=='admin')fail('forbidden',403);
   const fingerprint=createHash('sha256').update(JSON.stringify({action,data})).digest('hex'),cached=await repository.transaction(s=>s.receipts[a.id+':'+rid]);if(cached){if(cached.fingerprint!==fingerprint)fail('request_conflict',409);return enrichedView(a);}
   const prepared=await repository.transaction(async s=>{const key=a.id+':'+rid+':plan',prior=s.receipts[key];if(prior){if(prior.fingerprint!==fingerprint)fail('request_conflict',409);return prior.result as unknown as ReturnType<typeof templateChangePreview>;}
    const prepared=templateChangePreview(data,s.templates);if(['company','project','fund'].includes(prepared.data.objectType)){const schema=await store.masterTransaction(master=>master.schemas[prepared.data.objectType as 'company'|'project'|'fund']);if(data.expectedSchemaRevision!==schema.schemaRevision)fail('custom_schema_revision_conflict',409);}s.receipts[key]={fingerprint,result:prepared as never};return prepared;});
   const child=(suffix:string)=>{const hex=createHash('sha256').update(rid+':'+suffix).digest('hex');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-5'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32);};
   const headers=r.headers.cookie?{cookie:r.headers.cookie}:{};
   const draft=await server.inject({method:'POST',url:'/api/agent-workspace/actions',headers,payload:{requestId:child('draft'),expectedRevision:body.expectedRevision,action:'save_template',data:prepared.data}});if(draft.statusCode!==200)fail(draft.json().error??'template_change_failed',draft.statusCode);
   const saved=draft.json(),priorPublish=await repository.transaction(s=>s.receipts[a.id+':'+child('publish')]);if(!priorPublish&&['company','project','fund'].includes(prepared.data.objectType)){const revision=await store.masterTransaction(master=>master.schemas[prepared.data.objectType as 'company'|'project'|'fund'].schemaRevision);if(data.expectedSchemaRevision!==revision)fail('custom_schema_revision_conflict',409);}
   const published=await server.inject({method:'POST',url:'/api/agent-workspace/actions',headers,payload:{requestId:child('publish'),expectedRevision:saved.revision,action:'publish_template',data:{id:saved.result.id}}});if(published.statusCode!==200)fail(published.json().error??'template_change_failed',published.statusCode);
   await repository.transaction(s=>{s.receipts[a.id+':'+rid]={fingerprint:createHash('sha256').update(JSON.stringify({action,data})).digest('hex'),result:{templateId:published.json().result?.id??prepared.data.id??saved.result.id}};});return enrichedView(a);
  }
  if(action==='confirm_proposal'||action==='cancel_proposal'){
   const proposalPolicy=await activePolicy();
   const claim=await repository.transaction(s=>{const proposal=s.proposals.find(x=>x.id===data.id&&x.ownerId===a.id);if(!proposal)fail('proposal_not_found',404);if(!scopeAllowed(s,proposal,proposalPolicy))fail('forbidden',403);if(proposal.state==='applied'||proposal.state==='cancelled')return {proposal,execute:false,revision:s.revision};if(action==='cancel_proposal'){if(proposal.state==='executing')fail('proposal_executing',409);proposal.state='cancelled';s.revision++;return {proposal,execute:false,revision:s.revision};}if(proposal.targetFingerprint&&!s.receipts[a.id+':'+proposal.actionRequestId]&&proposal.action!=='apply_template'){const collection=workspaceProposalCollection(proposal.action),row=collection?(s[collection] as Owned[]).find(x=>x.id===proposal.data.id):undefined;if(!row||workspaceTargetFingerprint(row)!==proposal.targetFingerprint)fail('workspace_target_changed',409);}if(proposal.action==='apply_template'&&proposal.state==='executing'&&Date.parse(proposal.executionLeaseUntil??'')>Date.now())return {proposal,execute:false,revision:s.revision};proposal.state='executing';proposal.executionToken=randomUUID();proposal.executionLeaseUntil=new Date(Date.now()+60000).toISOString();s.revision++;return {proposal:structuredClone(proposal),execute:true,revision:s.revision};});
   if(claim.execute){const response=await server.inject({method:'POST',url:'/api/agent-workspace/actions',headers:r.headers.cookie?{cookie:r.headers.cookie}:{},payload:{requestId:claim.proposal.actionRequestId,expectedRevision:claim.revision,action:claim.proposal.action,data:claim.proposal.data}});if(response.statusCode!==200){await repository.transaction(s=>{const p=s.proposals.find(x=>x.id===data.id)!;if(p.state==='executing'&&p.executionToken===claim.proposal.executionToken){p.state='pending';delete p.executionLeaseUntil;s.revision++;}});fail(response.json().error??'proposal_apply_failed',response.statusCode);}await repository.transaction(s=>{const p=s.proposals.find(x=>x.id===data.id)!;if(p.executionToken===claim.proposal.executionToken){p.state='applied';delete p.executionLeaseUntil;s.revision++;}});}
   return enrichedView(a);
  }
  const policy=await activePolicy(),sourceMaterials=await store.listMaterials();const requireSources=(row:{materialIds?:string[];sourceMaterialIds?:string[];sourceMapping?:{materialId:string}})=>{const ids=[...(row.materialIds??[]),...(row.sourceMaterialIds??[]),...(row.sourceMapping?[row.sourceMapping.materialId]:[])];if(ids.some(id=>!sourceMaterials.some(m=>m.id===id&&canReadMaterial(a,m))))fail('source_material_unavailable',403);};for(const key of ['projectId','fundId'] as const)if(data[key]&&policy&&!(key==='projectId'?policy.project(String(data[key])):policy.fund(String(data[key]))))fail('forbidden',403);
  if(['save_task','save_schedule'].includes(action)){for(const [key,rows] of [['projectId',await store.listProjects()],['fundId',await store.listFunds()]] as const)if(data[key]&&!rows.some(row=>row.id===data[key]))fail(key==='projectId'?'project_not_found':'fund_not_found',404);}
  if(action==='save_task'&&data.ownerId&&data.ownerId!==a.id){const user=(await store.listUsers()).find(u=>u.id===data.ownerId&&u.enabled!==false);if(!user)fail('task_owner_unavailable',400);}
  if(action==='save_report_binding'&&!canRole(a.role,'report:write'))fail('forbidden',403);
  if(action==='save_report_binding'&&!(await store.listReports()).some(x=>x.id===data.reportId))fail('report_not_found',404);
  if(['save_skill','save_memory'].includes(action)&&(data.materialIds!==undefined||data.sourceMaterialIds!==undefined)){const materials=await store.listMaterials(),ids=action==='save_memory'?data.sourceMaterialIds:data.materialIds;if(!Array.isArray(ids)||ids.length>10||ids.some(id=>typeof id!=='string'||!materials.some(m=>m.id===id&&canReadMaterial(a,m)&&(canReadLp(a)||!m.lpSensitive&&!m.relationships?.investors?.length))))fail('invalid_skill_materials',403);}
  const weeklyTaskSnapshot=action==='save_weekly'?(await enrichedView(a)).tasks:undefined;
  const fingerprint=createHash('sha256').update(JSON.stringify({action,data})).digest('hex'),key=a.id+':'+rid;
  let job:{skillId:string;prompt:string;scheduleId?:string;runId?:string}|undefined,testPlugin:string|undefined;
  const result=await repository.transaction(async s=>{
   const prior=s.receipts[key];if(prior){if(prior.fingerprint!==fingerprint)fail('request_conflict',409);const saved=prior.result as any;if(!saved.completed){job=saved.job;testPlugin=saved.testPlugin;}return prior.result;}
   if(body.expectedRevision!==s.revision)fail('workspace_revision_conflict',409);
   const id=typeof data.id==='string'?text(data.id,200):randomUUID(),now=new Date().toISOString();
   const find=<T extends Owned>(items:T[])=>{const row=items.find(x=>x.id===id);if(!row||row.catalogueArchivedAt||!visible(row,a))fail('agent_record_not_found',404);return row!;};
   const scope=data.scope==='organization'?'organization':'personal';if(scope==='organization'&&a.role!=='admin'&&action.startsWith('save_'))fail('forbidden',403);
   const owned={id,ownerId:a.id,scope} as Owned;
   // Publication may replace an existing ID; preserve its original time, including unknown history.
   const creationLists=['skills','plugins','schedules','memories','templates','weeklyReports'] as const;
   const originalCreation=new Map(creationLists.map(key=>[key,new Map(s[key].map(row=>[row.id,row.createdAt]))]));
   let output:unknown={id};
   if(action==='save_preferences'){
    s.preferences[a.id]={remindAheadMinutes:integer(data.remindAheadMinutes,0,525600)};
   }else if(action==='save_reminder'){
    if(data.ownerId!==undefined&&data.ownerId!==a.id)fail('forbidden',403);
    const before=s.reminders.find(x=>x.id===id);if(before&&before.ownerId!==a.id)fail('agent_record_not_found',404);if(before&&data.version!==before.version)fail('reminder_revision_conflict',409);
    const dueAt=stamp(data.dueAt)!;if(Date.parse(dueAt)<=Date.now())fail('reminder_must_be_future');
    s.reminders=s.reminders.filter(x=>x.id!==id);s.reminders.push({...owned,scope:'personal',version:(before?.version??0)+1,title:text(data.title,200),text:text(data.text??'',4000,false),dueAt,status:'scheduled',createdAt:before?.createdAt??now});
   }else if(action==='cancel_reminder'){
    const row=s.reminders.find(x=>x.id===id&&x.ownerId===a.id);if(!row)fail('agent_record_not_found',404);if(data.version!==row!.version)fail('reminder_revision_conflict',409);row!.status='cancelled';row!.version=(row!.version??0)+1;
   }else if(action==='save_skill'){
    const before=s.skills.find(x=>x.id===id);if(before){assertEditable(before,a);if(data.version!==before.version)fail('skill_revision_conflict',409);}
    const tools=data.tools,pluginIds=data.pluginIds;if(!Array.isArray(tools)||!tools.length||tools.some(x=>typeof x!=='string'||!['knowledge','intake','project','fund','entity','investors','fundraising','meeting','report','capital','task','weekly','risk','template','memory','admin_accounts'].includes(x)))fail('invalid_skill_tools');
    if(!Array.isArray(pluginIds)||pluginIds.some(x=>!s.plugins.some(p=>p.id===x&&visible(p,a))))fail('invalid_skill_plugins');
    const draftId=before?.scope==='organization'&&(before.status==='published'||before.builtin)?id+':draft':id;if(draftId!==id&&s.skills.some(x=>x.id===draftId))fail('skill_draft_exists',409);
    const row:Skill={...owned,...(before?.submittedFrom?{submittedFrom:before.submittedFrom,submittedVersion:before.submittedVersion}:{}),id:draftId,...(draftId!==id?{baseId:id}:before?.baseId?{baseId:before.baseId}:{}),status:'draft',title:text(data.title,120),description:text(data.description,1000),instructions:text(data.instructions,16000),category:text(data.category||'自定义',60),tools:tools as string[],pluginIds:pluginIds as string[],enabled:draftId===id&&data.enabled!==false,builtin:false,materialIds:Array.isArray(data.materialIds)?data.materialIds as string[]:before?.materialIds,version:(before?.version??0)+1};
    if(before&&draftId===id)s.skillHistory.push(structuredClone(before));s.skills=s.skills.filter(x=>x.id!==draftId);s.skills.push(row);output={id:row.id};
   }else if(action==='toggle_skill'){
    const row=find(s.skills);(s.overrides[a.id]??={})[id]=data.enabled===true;
    for(const t of s.schedules)if(t.ownerId===a.id&&t.skillId===id&&!data.enabled)t.enabled=false;
    output={id,enabled:data.enabled===true};
   }else if(action==='test_skill'){
    if(!enabledSkills(s,a).some(x=>x.id===id))fail('skill_unavailable',409);job={skillId:id,prompt:text(data.prompt||'说明这个能力可以完成的工作，检索可用依据；没有依据明确说明，不准备或执行业务写入。',4000)};
   }else if(action==='save_plugin'){
    if(a.role!=='admin')fail('forbidden',403);let row=s.plugins.find(x=>x.id===id);if(!row){if(!['public-feed','local-library'].includes(String(data.kind)))fail('invalid_plugin_kind');row={...owned,title:text(data.title,120),description:text(data.description??'',1000,false),kind:data.kind as any,enabled:false,connected:false};s.plugins.push(row);}else{if(!visible(row,a))fail('forbidden',403);if(data.version!==undefined&&data.version!==row.version)fail('plugin_revision_conflict',409);}if(row.kind==='business'&&data.endpoint)fail('builtin_plugin_endpoint_fixed');const endpoint=data.endpoint===undefined?row.endpoint:text(data.endpoint,1000,false);Object.assign(row,{version:(row.version??0)+1,endpoint,enabled:data.enabled===true,connected:row.kind==='business',status:row.kind==='business'?'已连接':'待测试'});
   }else if(action==='test_plugin'){
    if(a.role!=='admin')fail('forbidden',403);find(s.plugins);testPlugin=id;
   }else if(action==='save_schedule'){
    const before=s.schedules.find(x=>x.id===id);if(before?.catalogueArchivedAt)fail('agent_record_not_found',404);if(before){assertEditable(before,a);if(data.version!==before.version)fail('schedule_revision_conflict',409);if(before.ownerId!==a.id)fail('forbidden',403);}
    if(data.recurrence!==undefined&&!['once','daily','weekly','monthly','interval'].includes(String(data.recurrence)))fail('invalid_recurrence');
    const skillId=text(data.skillId,100);if(!enabledSkills(s,a).some(x=>x.id===skillId))fail('skill_unavailable',409);
    const nextAt=stamp(data.nextAt)!,recurrence=data.recurrence as Schedule['recurrence'];
    const row:Schedule={...owned,recurrence,monthlyDay:recurrence==='monthly'?(before?.recurrence==='monthly'&&before.nextAt===nextAt?before.monthlyDay:new Date(Date.parse(nextAt)+8*3600000).getUTCDate()):undefined,version:(before?.version??0)+1,scope:'personal',title:text(data.title,160),skillId,prompt:text(data.prompt,8000),nextAt,intervalMinutes:integer(data.intervalMinutes??0,0,527040),enabled:data.enabled!==false,actor:a,projectId:typeof data.projectId==='string'&&data.projectId?data.projectId:undefined,fundId:typeof data.fundId==='string'&&data.fundId?data.fundId:undefined,lastRunId:before?.lastRunId};
    s.schedules=s.schedules.filter(x=>x.id!==id);s.schedules.push(row);
   }else if(action==='toggle_schedule'||action==='run_schedule'){
    const row=find(s.schedules);if(row.ownerId!==a.id)fail('forbidden',403);if(action==='toggle_schedule'){if(data.enabled&&!enabledSkills(s,a).some(x=>x.id===row.skillId))fail('skill_unavailable',409);row.enabled=data.enabled===true;}else job={skillId:row.skillId,prompt:row.prompt,scheduleId:row.id};
   }else if(action==='save_task'){
    if(!canRole(a.role,'task:write'))fail('forbidden',403);const before=s.tasks.find(x=>x.id===id);if(before){if(!scopeAllowed(s,before,policy))fail('forbidden',403);if(before.createdBy!==a.id)assertEditable(before,a);if(data.version!==before.version)fail('task_revision_conflict',409);if(before.source&&before.source!=='个人安排')fail('business_task_requires_source_action',409);}
    
    if(data.priority!==undefined&&!['low','normal','high','urgent'].includes(String(data.priority)))fail('invalid_task_priority');
    const status=['open','waiting','complete','cancelled'].includes(String(data.status))?String(data.status) as WorkTask['status']:before?.status??'open';
    const row:WorkTask={...owned,createdAt:before?before.createdAt:now,reminderCustom:data.remindAheadMinutes!==undefined||before?.reminderCustom,createdBy:before?.createdBy??before?.ownerId??a.id,version:(before?.version??0)+1,scope:'personal',ownerId:typeof data.ownerId==='string'&&data.ownerId.trim()?data.ownerId:a.id,title:text(data.title,200),note:text(data.note??'',4000,false),dueAt:stamp(data.dueAt,false),remindAheadMinutes:integer(data.remindAheadMinutes??s.preferences[a.id]?.remindAheadMinutes??DEFAULT_REMIND_AHEAD_MINUTES,0,525600),priority:(data.priority??before?.priority??'normal') as WorkTask['priority'],status,projectId:typeof data.projectId==='string'&&data.projectId?data.projectId:undefined,fundId:typeof data.fundId==='string'&&data.fundId?data.fundId:undefined,source:'个人安排',href:'/tasks?focus='+encodeURIComponent(id)};
    if(before&&row.ownerId!==before.ownerId)for(const n of s.notifications.filter(n=>n.taskId===id&&n.ownerId===before.ownerId))n.read=true;
    if(before&&row.ownerId===before.ownerId&&row.dueAt===before.dueAt&&row.remindAheadMinutes===before.remindAheadMinutes){row.remindedFor=before.remindedFor;row.snoozedUntil=before.snoozedUntil;}s.tasks=s.tasks.filter(x=>x.id!==id);s.tasks.push(row);
    if(row.ownerId!==a.id&&(!before||before.ownerId!==row.ownerId))notice(s,row.ownerId,(before?'待办转交：':'新待办：')+row.title,a.name+(before?'将事项转交给您，请处理。':'分配了事项给您，请处理。'),'red','assignment:'+row.id+':'+row.version,row.href??'/tasks',row.id,{projectId:row.projectId,fundId:row.fundId});
   }else if(action==='configure_task_reminder'){
    const row=s.tasks.find(t=>t.id===id&&(t.ownerId===a.id||t.createdBy===a.id));if(!row||!scopeAllowed(s,row,policy))fail('agent_record_not_found',404);if(data.version!==row.version)fail('task_revision_conflict',409);row.remindAheadMinutes=integer(data.remindAheadMinutes,0,525600);row.reminderCustom=true;row.remindedFor=undefined;row.version=(row.version??0)+1;
   }else if(['complete_task','cancel_task','snooze_task'].includes(action)){
    const row=s.tasks.find(t=>t.id===id&&(t.ownerId===a.id||t.createdBy===a.id));if(!row||!scopeAllowed(s,row,policy))fail('agent_record_not_found',404);if(action!=='snooze_task'&&row.source&&row.source!=='个人安排')fail('business_task_requires_source_action',409);if(action==='snooze_task'){row.snoozedUntil=stamp(data.until);row.remindedFor=undefined;}else{const previousStatus=row.status;row.status=action==='complete_task'?'complete':'cancelled';if(previousStatus!==row.status&&row.createdBy&&row.createdBy!==a.id)notice(s,row.createdBy,row.title+(row.status==='complete'?' · 已完成':' · 已取消'),a.name+(row.status==='complete'?'已完成这项待办。':'已取消这项待办。'),'green','task-result:'+row.id+':'+row.status,row.href??'/tasks',row.id,{projectId:row.projectId,fundId:row.fundId});for(const n of s.notifications.filter(n=>n.taskId===id&&n.ownerId===row.ownerId))n.read=true;}
   }else if(action==='read_notice'||action==='snooze_notice'){
    const rows=data.all===true?s.notifications.filter(x=>x.ownerId===a.id&&scopeAllowed(s,x,policy)&&(!x.snoozedUntil||Date.parse(x.snoozedUntil)<=Date.now())):[find(s.notifications)];for(const row of rows){if(row.ownerId!==a.id||!scopeAllowed(s,row,policy))fail('forbidden',403);if(action==='read_notice')row.read=true;else row.snoozedUntil=stamp(data.until);}
   }else if(action==='save_memory'){
    const before=s.memories.find(x=>x.id===id);if(before?.catalogueArchivedAt)fail('agent_record_not_found',404);if(before){assertEditable(before,a);if(data.version!==before.version)fail('memory_revision_conflict',409);}const day=(value:unknown)=>{if(value===undefined||value==='')return undefined;const v=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail('invalid_rule_date');return v;};
    const effectiveFrom=day(data.effectiveFrom),effectiveUntil=day(data.effectiveUntil);if(effectiveFrom&&effectiveUntil&&effectiveUntil<effectiveFrom)fail('invalid_rule_period');
    const draftId=before?.scope==='organization'&&before.status==='published'?id+':draft':id;if(draftId!==id&&s.memories.some(x=>x.id===draftId))fail('memory_draft_exists',409);if(before&&draftId===id)s.memoryHistory.push(structuredClone(before));s.memories=s.memories.filter(x=>x.id!==draftId);s.memories.push({...owned,id:draftId,...(draftId!==id?{baseId:id}:before?.baseId?{baseId:before.baseId}:{}),title:text(data.title,160),text:text(data.text,12000),appliesTo:text(data.appliesTo??'',1000,false),conflictNote:text(data.conflictNote??'',2000,false),effectiveFrom,effectiveUntil,sourceMaterialIds:(data.sourceMaterialIds??[]) as string[],enabled:draftId===id&&data.enabled!==false,status:'draft',version:(before?.version??0)+1});output={id:draftId};
   }else if(action==='submit_memory'){
    const row=find(s.memories);if(row.ownerId!==a.id)fail('forbidden',403);row.scope='organization';row.status='submitted';row.enabled=false;
   }else if(action==='submit_skill'){
    const row=find(s.skills);if(row.ownerId!==a.id||row.builtin||row.scope!=='personal')fail('forbidden',403);if(data.version!==row.version)fail('skill_revision_conflict',409);assertReusableSkill(row,data.reviewedForSharing);
    const pending=s.skills.find(t=>t.submittedFrom===row.id&&t.status==='submitted');if(pending)output={id:pending.id};else{
     const current=s.skills.find(t=>t.submittedFrom===row.id&&t.status==='published'),target=current?.id??row.id+':shared',draftId=current?target+':draft':target,previous=s.skills.find(t=>t.id===draftId);if(previous&&['draft','submitted'].includes(previous.status??''))fail('skill_draft_exists',409);if(previous)s.skillHistory.push(structuredClone(previous));
     const shared:Skill={...structuredClone(row),id:draftId,...(current?{baseId:target}:{}),submittedFrom:row.id,submittedVersion:row.version,scope:'organization',status:'submitted',enabled:false,version:(current?.version??previous?.version??0)+1};s.skills=s.skills.filter(t=>t.id!==draftId);s.skills.push(shared);output={id:draftId};
    }
   }else if(action==='withdraw_skill_submission'||action==='reject_skill_submission'){
    const row=find(s.skills);if(row.status!=='submitted'||row.scope!=='organization')fail('skill_submission_closed',409);if(data.version!==row.version)fail('skill_revision_conflict',409);if(action==='withdraw_skill_submission'?row.ownerId!==a.id:a.role!=='admin')fail('forbidden',403);s.skillHistory.push(structuredClone(row));row.status=action==='withdraw_skill_submission'?'withdrawn':'rejected';row.enabled=false;row.version++;row.reviewNote=action==='withdraw_skill_submission'?'申请人已撤回':text(data.note,2000);row.reviewedBy=a.id;row.reviewedAt=now;
   }else if(action==='set_shared_skill_enabled'){
    if(a.role!=='admin')fail('forbidden',403);if(typeof data.enabled!=='boolean')fail('invalid_action_payload');const row=find(s.skills);if(row.scope!=='organization'||row.status!=='published'||row.builtin)fail('shared_skill_not_published',409);if(data.version!==row.version)fail('skill_revision_conflict',409);if(data.enabled===true)requireSources(row);s.skillHistory.push(structuredClone(row));row.enabled=data.enabled===true;row.version++;output={id:row.id,enabled:row.enabled};
   }else if(action==='restore_skill'||action==='restore_memory'){
    const skills=action==='restore_skill',items:(Skill|Memory)[]=skills?s.skills:s.memories,history:(Skill|Memory)[]=skills?s.skillHistory:s.memoryHistory,current=find(items),historic=history.find(x=>x.id===id&&x.version===data.version);assertEditable(current,a);if(!historic)fail('history_version_not_found',404);requireSources(historic);const draftId=current.scope==='organization'?id+':draft':id;if(draftId!==id&&items.some(x=>x.id===draftId))fail('restore_draft_exists',409);const restored={...structuredClone(historic),id:draftId,...(draftId!==id?{baseId:id}:{}),ownerId:a.id,version:(current.version??0)+1,status:'draft' as const,enabled:false};if(draftId===id){history.push(structuredClone(current) as never);items.splice(items.indexOf(current),1);}items.push(restored as never);output={id:draftId};
   }else if(action==='publish_skill'){
    if(a.role!=='admin')fail('forbidden',403);const row=find(s.skills);if(!['draft','submitted'].includes(row.status??''))fail('skill_submission_closed',409);requireSources(row);assertReusableSkill(row,data.reviewedForSharing);if(row.baseId){const old=s.skills.find(x=>x.id===row.baseId);if(old)s.skillHistory.push(structuredClone(old));s.skills=s.skills.filter(x=>x.id!==row.baseId);row.id=row.baseId;delete row.baseId;}row.scope='organization';row.status='published';row.enabled=true;row.reviewedBy=a.id;row.reviewedAt=now;row.version++;
   }else if(action==='publish_memory'){
    const row=find(s.memories);if(a.role!=='admin')fail('forbidden',403);requireSources(row);if(row.baseId){const old=s.memories.find(x=>x.id===row.baseId);if(old)s.memoryHistory.push(structuredClone(old));s.memories=s.memories.filter(x=>x.id!==row.baseId);row.id=row.baseId;delete row.baseId;}row.scope='organization';row.status='published';row.enabled=true;row.reviewedBy=a.id;row.reviewedAt=now;row.version++;
   }else if(action==='save_template'){
    if(a.role!=='admin')fail('forbidden',403);const before=s.templates.find(x=>x.id===id);if(before){assertEditable(before,a);if(data.version!==undefined&&data.version!==before.version)fail('template_version_conflict',409);if(before.status==='published'&&s.templates.some(x=>x.baseId===id))fail('template_draft_exists',409);}const objectType=text(data.objectType,30) as Template['objectType'];if(!['company','project','fund','lp','report'].includes(objectType))fail('invalid_template_type');if(before?.sourceMapping&&objectType!=='report')fail('imported_report_template_type_fixed');
    if(!Array.isArray(data.fields)||data.fields.length>100||!Array.isArray(data.materials)||data.materials.length>100)fail('invalid_template_fields');
    const fields=data.fields.map(v=>{const f=object(v,['id','label','type','required','enabled','options']);if(!['text','number','date','boolean','choice'].includes(String(f.type)))fail('invalid_template_field');if(f.options!==undefined&&(!Array.isArray(f.options)||f.options.some(x=>typeof x!=='string')))fail('invalid_template_options');return {id:text(f.id||randomUUID(),100),label:text(f.label,120),type:f.type as Template['fields'][number]['type'],required:f.required===true,enabled:f.enabled!==false,...(Array.isArray(f.options)?{options:f.options as string[]}:{})};});
    if(new Set(fields.map(f=>f.id)).size!==fields.length)fail('duplicate_template_field');
    const materials=data.materials.map(templateMaterial);if(new Set(materials.map(m=>m.id)).size!==materials.length)fail('duplicate_template_material');
    const draftId=before?.status==='published'?id+':draft':id;
    const row:Template={...owned,...(before?.schemaSources?{schemaSources:structuredClone(before.schemaSources)}:{}),...(before?.sourceMapping?{sourceMapping:structuredClone(before.sourceMapping)}:{}),id:draftId,...(before?.status==='published'?{baseId:id}:before?.baseId?{baseId:before.baseId}:{}),scope:'organization',enabled:data.enabled!==false,isDefault:data.isDefault===true,title:text(data.title,160),objectType,stage:text(data.stage??'',60,false),fields,materials,version:(before?.version??0)+1,status:'draft'};s.templates=s.templates.filter(x=>x.id!==row.id);s.templates.push(row);output={id:row.id};
   }else if(action==='copy_template'){
    if(a.role!=='admin')fail('forbidden',403);const row=find(s.templates);requireSources(row);const copied={...structuredClone(row),id:randomUUID(),title:row.title+'（副本）',ownerId:a.id,scope:'personal' as const,version:1,status:'draft' as const,isDefault:false};delete copied.baseId;s.templates.push(copied);output={id:copied.id};
   }else if(action==='restore_template'){
    if(a.role!=='admin')fail('forbidden',403);const current=find(s.templates),historic=s.templateHistory.find(x=>x.id===id&&x.version===data.version);if(!historic)fail('template_version_conflict',409);requireSources(historic);if(current.status!=='published'||s.templates.some(x=>x.baseId===id))fail('template_draft_exists',409);const restored={...structuredClone(historic),id:id+':draft',baseId:id,version:current.version+1,status:'draft' as const,ownerId:a.id};s.templates.push(restored);output={id:restored.id};
   }else if(action==='toggle_template'||action==='set_default_template'){
    if(a.role!=='admin')fail('forbidden',403);const row=find(s.templates);if(row.status!=='published')fail('template_not_published',409);if(action==='toggle_template'){
     const enabled=data.enabled===true;if(['company','project','fund'].includes(row.objectType)){
      const kind=row.objectType as 'company'|'project'|'fund';const plan=await store.masterTransaction(master=>{
       const digest=createHash('sha256').update('agent-template-toggle:'+rid).digest('hex'),key=digest.slice(0,8)+'-'+digest.slice(8,12)+'-5'+digest.slice(13,16)+'-8'+digest.slice(17,20)+'-'+digest.slice(20,32),fingerprint=JSON.stringify({actorId:a.id,row,enabled}),prior=master.receipts[key];if(prior){if(prior.fingerprint!==fingerprint)fail('request_conflict',409);return prior.result as any;}
       const result={expectedRevision:master.schemas[kind].schemaRevision,...templateSchemaPlan(master.schemas[kind],s.templates,row,enabled)};master.receipts[key]={fingerprint,result:result as never};return result;
      });
      await writeSchema(store,kind,{requestId:rid,expectedRevision:plan.expectedRevision,fields:plan.fields},a);row.schemaSources=plan.sources;
     }row.enabled=enabled;if(!row.enabled)row.isDefault=false;}else{if(row.enabled===false)fail('template_disabled',409);for(const t of s.templates)if(t.objectType===row.objectType&&t.stage===row.stage)t.isDefault=t.id===row.id;}
   }else if(action==='publish_template'){
    if(a.role!=='admin')fail('forbidden',403);const row=find(s.templates);requireSources(row);
    if(['company','project','fund'].includes(row.objectType)){
     const kind=row.objectType as 'company'|'project'|'fund';
     const publication=await store.masterTransaction(master=>{
      const digest=createHash('sha256').update('agent-template:'+rid).digest('hex'),key=digest.slice(0,8)+'-'+digest.slice(8,12)+'-5'+digest.slice(13,16)+'-8'+digest.slice(17,20)+'-'+digest.slice(20,32),fingerprint=JSON.stringify({actorId:a.id,row}),prior=master.receipts[key];
      if(prior){if(prior.fingerprint!==fingerprint)fail('request_conflict',409);return prior.result as any;}
      const plan=templateSchemaPlan(master.schemas[kind],s.templates,row,row.enabled!==false),result={requestId:rid,expectedRevision:master.schemas[kind].schemaRevision,...plan};master.receipts[key]={fingerprint,result:result as never};return result;
     });
     await writeSchema(store,kind,{requestId:publication.requestId,expectedRevision:publication.expectedRevision,fields:publication.fields},a);row.schemaSources=publication.sources;
    }
    if(row.baseId){const old=s.templates.find(x=>x.id===row.baseId);if(old)s.templateHistory.push(structuredClone(old));s.templates=s.templates.filter(x=>x.id!==row.baseId);row.id=row.baseId;delete row.baseId;}row.scope='organization';row.status='published';if(row.isDefault)for(const t of s.templates)if(t.id!==row.id&&t.objectType===row.objectType&&t.stage===row.stage)t.isDefault=false;
   }else if(action==='save_report_binding'){
    const reportId=text(data.reportId,100),templateId=text(data.templateId,100),template=s.templates.find(x=>x.id===templateId&&x.version===data.version&&x.status==='published')??s.templateHistory.find(x=>x.id===templateId&&x.version===data.version);if(!template||template.version!==data.version)fail('template_version_conflict',409);s.reportBindings=s.reportBindings.filter(x=>!(x.reportId===reportId&&x.ownerId===a.id));s.reportBindings.push({reportId,templateId,version:template.version,ownerId:a.id,templateSnapshot:structuredClone(template)});
   }else if(action==='save_weekly'){
    const before=s.weeklyReports.find(x=>x.id===id);if(before){assertEditable(before,a);if(data.version!==before.version)fail('weekly_revision_conflict',409);}const week=text(data.week,12);if(!reportWeekRange(week))fail('invalid_week');const taskIds=data.taskIds??before?.taskIds??[];if(!Array.isArray(taskIds)||taskIds.length>100||taskIds.some(id=>typeof id!=='string'||!weeklyTaskSnapshot?.some(t=>t.id===id&&scopeAllowed(s,t,policy))))fail('invalid_weekly_tasks',403);const scopeIds=[...new Set(taskIds.flatMap(id=>{const t=weeklyTaskSnapshot!.find(t=>t.id===id)!;return [t.projectId,t.fundId,...(t.scopeIds??[])].filter((v):v is string=>!!v);}))];s.weeklyReports=s.weeklyReports.filter(x=>x.id!==id);s.weeklyReports.push({...owned,...(before?before.createdAt?{createdAt:before.createdAt}:{}:{createdAt:now}),version:(before?.version??0)+1,scope:'personal',taskIds:taskIds as string[],scopeIds,title:text(data.title,160),week,thisWeek:text(data.thisWeek??'',16000,false),nextWeek:text(data.nextWeek??'',16000,false),status:data.status==='published'?'published':'draft'});
   }else fail('unsupported_workspace_action');
   if(job){const queued=queueRun(s,a,job.skillId,job.prompt,s.schedules.find(x=>x.id===job?.scheduleId));job.runId=queued.id;output={...(output as any),job,runId:queued.id,completed:false};}else if(testPlugin)output={...(output as any),testPlugin,completed:false};
   for(const key of creationLists){const before=originalCreation.get(key)!;for(const row of s[key]){if(!before.has(row.id))row.createdAt=now;else if(before.get(row.id))row.createdAt=before.get(row.id);else delete row.createdAt;}}
   s.audit.push({id:randomUUID(),actorId:a.id,action,targetId:id,time:now});s.revision++;s.receipts[key]={fingerprint,result:output};return output;
  });

  if(job)await runtime.run(a,job.skillId,job.prompt,job.scheduleId,r.headers.cookie,job.runId);
  if(testPlugin){const plugin=await repository.transaction(s=>structuredClone(s.plugins.find(x=>x.id===testPlugin)!));let connected=false,status='尚未配置';try{status=await probePlugin(plugin);connected=true;}catch(e){status=String((e as any)?.code??'plugin_connection_failed');}
   await repository.transaction(s=>{const row=s.plugins.find(x=>x.id===testPlugin)!;if(row.endpoint!==plugin.endpoint)fail('plugin_configuration_changed',409);row.connected=connected;row.status=status;s.revision++;});}
  if(job||testPlugin)await repository.transaction(s=>{const receipt=s.receipts[key];if(receipt)(receipt.result as any).completed=true;});

  return {...await enrichedView(a),result:{id:(result as any)?.id,runId:(result as any)?.runId}};
 }));
 if(options.startScheduler!==false)server.addHook('onReady',async()=>runtime.start());server.addHook('onClose',async()=>runtime.close());
 return {runtime,view,repository};
}
