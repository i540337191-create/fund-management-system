import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {readWorkflow,workflowProposal,rememberWorkflowNames,workflowCatalog} from '../src/ai/workflow-tools.ts';
import {skillAllows} from '../src/agent/runtime.ts';
import {enabledSkills,emptyAgentState} from '../src/agent/model.ts';
const secret='isolated-workflow-coverage-secret';
async function fixture(loseBindResponse=false){
 const storage=await mkdtemp(join(tmpdir(),'workflow-coverage-'));
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,materialStorageRoot:storage,auth:{mode:'password',sessionSecret:secret,adminEmail:'bootstrap@example.invalid',adminPassword:'password'}});
 server.addHook('onClose',async()=>rm(storage,{recursive:true,force:true}));
 server.addHook('onSend',async(request,reply,payload)=>{if(loseBindResponse&&request.url.endsWith('/bind')&&reply.statusCode===200){loseBindResponse=false;reply.code(503);return JSON.stringify({error:'qa_lost_bind_response'});}return payload;});
 const actor={id:'coverage-admin',name:'Admin',email:'coverage@example.invalid',role:'admin' as const};
 const cookie=await registeredCookie(server,actor,secret),pack={companies:await store.listCompanies(),projects:await store.listProjects(),funds:await store.listFunds(),materials:await store.listMaterials(),investors:[],names:new Map<string,string>()} as any;
 const request={headers:{cookie}} as any;
 const read=(module:string,targetId='workspace')=>readWorkflow(server,request,pack,{module,targetId},true,actor);
 const prepare=(module:string,operation:string,body:any,value:any,targetId='workspace')=>workflowProposal({module,targetId,operation,body},value,pack,actor,randomUUID());
 const execute=(plan:any)=>server.inject({method:plan.method,url:plan.path,headers:{cookie},payload:plan.body});
 return {store,server,actor,pack,read,prepare,execute,request};
}
test('schema preparation retains object type, stage rules and CAS; stale and unauthorized edits do not apply',async()=>{
 const f=await fixture();try{
 const read=await f.read('schema_project');assert.match(read.data.scopeContract,/单对象字段规则当前不支持/);
 const fields=[...read.data.schema.fields,{id:'coverage_review',label:'阶段复核',type:'text',order:100,required:false,enabled:true,requiredStages:['投后'],options:[]}];
 const plan=f.prepare('schema_project','save',{fields},read);assert.equal(plan.path,'/api/custom-field-schemas/project');assert.equal(plan.method,'PUT');assert.equal(plan.body.expectedRevision,read.data.schema.schemaRevision);assert.equal((await f.execute(plan)).statusCode,200);
 assert.equal((await f.execute(plan)).statusCode,200,'same request is idempotent');
 const stale=f.prepare('schema_project','save',{fields},read);assert.equal((await f.execute(stale)).statusCode,409);
 assert.throws(()=>f.prepare('schema_project','save',{fields,fundId:'invented'},read));
 await assert.rejects(readWorkflow(f.server,f.request,f.pack,{module:'schema_project',targetId:'workspace'},true,{...f.actor,role:'finance'}),{code:'forbidden'});
 assert.equal((await f.read('schema_fund')).data.schema.fields.some((v:any)=>v.id==='coverage_review'),false);
 assert.equal(workflowCatalog({...f.actor,role:'viewer'}).some(v=>v.module==='schema_project'),false);
 }finally{await f.server.close();}
});
test('account tools omit credentials, reject credential bodies and preserve original admin/CAS/audit checks',async()=>{
 const f=await fixture();try{
 await registeredCookie(f.server,{id:'coverage-viewer',name:'Viewer',email:'viewer@fixture.invalid',role:'viewer'},secret);
 const read=await f.read('admin_accounts');rememberWorkflowNames(read.data,f.pack.names);assert.equal(JSON.stringify(read.data).includes('password'),false);assert.equal(read.data.users.some((u:any)=>u.id==='user-admin'),false);
 assert.throws(()=>f.prepare('admin_accounts','update',{userId:'coverage-viewer',password:'should-never-be-accepted'},read));
 assert.throws(()=>f.prepare('admin_accounts','update',{userId:'coverage-viewer'},read),{code:'action_missing_fields'});
 assert.throws(()=>f.prepare('admin_accounts','update',{userId:'ambiguous-name',name:'Other'},read),{code:'action_object_unavailable'});
 const plan=f.prepare('admin_accounts','update',{userId:'coverage-viewer',name:'Updated viewer'},read);assert.equal(plan.body.action,'update');assert.equal((await f.execute(plan)).statusCode,200);assert.equal((await f.execute(plan)).statusCode,200);
 const stale=f.prepare('admin_accounts','revoke_sessions',{userId:'coverage-viewer'},read);assert.equal((await f.execute(stale)).statusCode,409);
 const fresh=await f.read('admin_accounts'),revoke=f.prepare('admin_accounts','revoke_sessions',{userId:'coverage-viewer'},fresh);const revoked=await f.execute(revoke);assert.equal(revoked.statusCode,200);assert.equal(revoked.json().auditEvent.action,'撤销账号会话');
 assert.equal(await f.store.accountTransaction(s=>s.sessions.some(v=>v.actorId==='coverage-viewer')),false);
 assert.equal(skillAllows({tools:['project']} as any,'admin_accounts'),false);assert.equal(skillAllows({tools:['admin_accounts']} as any,'admin_accounts'),true);
 assert.equal(enabledSkills(emptyAgentState(),{...f.actor,role:'viewer'}).some(s=>s.id==='skill-admin-system'),false);
 assert.equal(enabledSkills(emptyAgentState(),f.actor).some(s=>s.id==='skill-admin-system'),true);
 }finally{await f.server.close();}
});
test('meeting schedule uses the selected project record revision and original schedule validation',async()=>{
 const f=await fixture();try{
 const project=f.pack.projects[0];assert(project);
 const read=await f.read('meetings',project.id),meeting=read.data.meetings[0];assert(meeting);rememberWorkflowNames(read.data,f.pack.names);
 const plan=f.prepare('meetings','schedule',{meetingId:meeting.id,scheduleStatus:'scheduled',startsAt:'2026-11-11T01:00:00.000Z',endsAt:'2026-11-11T02:00:00.000Z'},read,project.id);
 assert.equal(plan.path,`/api/meetings/${meeting.id}/schedule`);assert.equal(plan.body.expectedRevision,meeting.revision??1);assert.equal((await f.execute(plan)).statusCode,200);
 const bad=f.prepare('meetings','schedule',{meetingId:meeting.id,scheduleStatus:'scheduled',startsAt:'bad',endsAt:'bad'},await f.read('meetings',project.id),project.id);assert.equal((await f.execute(bad)).statusCode,400);
 }finally{await f.server.close();}
});
test('object access plans are bound to selected object and retain access revision guards',async()=>{
 const f=await fixture();try{
 const fund=f.pack.funds[0],read=await f.read('fund_access',fund.id);rememberWorkflowNames(read.data,f.pack.names);f.pack.names.set(f.actor.id,f.actor.name);f.pack.names.set(fund.id,fund.name);
 const plan=f.prepare('fund_access','save',{fundId:fund.id,visibility:'members',memberIds:[f.actor.id]},read,fund.id);assert.equal(plan.path,`/api/object-access/funds/${fund.id}`);assert.equal(plan.body.expectedRevision,read.data.revision);assert.equal((await f.execute(plan)).statusCode,200);
 const stale=f.prepare('fund_access','save',{fundId:fund.id,visibility:'public',memberIds:[]},read,fund.id);assert.equal((await f.execute(stale)).statusCode,409);
 assert.throws(()=>f.prepare('fund_access','save',{fundId:'another-fund',visibility:'public',memberIds:[]},read,fund.id),{code:'action_object_unavailable'});
 }finally{await f.server.close();}
});
test('workspace proposals strictly validate target, role and fields; changed targets require a new card',async()=>{
 const f=await fixture();try{
 const {workspaceProposalInput,allowedWorkspaceProposalActions}=await import('../src/agent/actions.ts');
 assert(allowedWorkspaceProposalActions.includes('read_notice'));assert.equal(allowedWorkspaceProposalActions.includes('confirm_proposal'),false);
 assert.throws(()=>workspaceProposalInput('save_plugin',{endpoint:'https://user:password@example.com'},f.actor));
 assert.throws(()=>workspaceProposalInput('publish_memory',{id:'unknown'},{...f.actor,role:'viewer'}),{code:'forbidden'});
 const current=async()=>(await f.server.inject({url:'/api/agent-workspace',headers:f.request.headers})).json();
 const action=async(action:string,data:any)=>f.server.inject({url:'/api/agent-workspace/actions',method:'POST',headers:f.request.headers,payload:{requestId:randomUUID(),expectedRevision:(await current()).revision,action,data}});
 const prepare=async(action:string,data:any)=>f.server.inject({url:'/api/agent-workspace/proposals',method:'POST',headers:f.request.headers,payload:{action,title:'Workspace coverage',data}});
 assert.equal((await prepare('complete_task',{id:'unobserved-task'})).statusCode,404);
 assert.equal((await prepare('save_reminder',{title:'Reminder',text:'test',dueAt:'2099-01-01T00:00:00.000Z',password:'no'})).statusCode,400);
 const create=await prepare('save_reminder',{title:'Reminder',text:'test',dueAt:'2099-01-01T00:00:00.000Z'});assert.equal(create.statusCode,200,create.body);assert.equal((await current()).reminders.some((r:any)=>r.title==='Reminder'),false);
 const confirmed=await action('confirm_proposal',{id:create.json().proposal.id});assert.equal(confirmed.statusCode,200,confirmed.body);
 const reminder=(await current()).reminders.find((r:any)=>r.title==='Reminder'),cancel=await prepare('cancel_reminder',{id:reminder.id,version:reminder.version});assert.equal(cancel.statusCode,200,cancel.body);
 assert.equal((await action('save_reminder',{id:reminder.id,version:reminder.version,title:'Changed reminder',text:reminder.text,dueAt:reminder.dueAt})).statusCode,200);
 const stale=await action('confirm_proposal',{id:cancel.json().proposal.id});assert.equal(stale.statusCode,409,stale.body);assert.equal(stale.json().error,'workspace_target_changed');
 const latest=(await current()).reminders.find((r:any)=>r.id===reminder.id),fresh=await prepare('cancel_reminder',{id:latest.id,version:latest.version});assert.equal(fresh.statusCode,200,fresh.body);
 assert.equal((await action('confirm_proposal',{id:fresh.json().proposal.id})).statusCode,200);assert.equal((await action('confirm_proposal',{id:fresh.json().proposal.id})).statusCode,200);assert.equal((await current()).reminders.find((r:any)=>r.id===latest.id).status,'cancelled');
 }finally{await f.server.close();}
});
test('business intake adapters reuse original draft CAS, source checking and idempotent binding',async()=>{
 const f=await fixture();try{
 const createdCompany=await f.server.inject({url:'/api/companies',method:'POST',headers:f.request.headers,payload:{requestId:randomUUID(),name:'Original company',shortName:'Original',industry:'科技'}});assert.equal(createdCompany.statusCode,201,createdCompany.body);f.pack.companies=await f.store.listCompanies();
 let read=await f.read('business_intake');const create=f.prepare('business_intake','create',{objectType:'company'},read);let response=await f.execute(create);assert.equal(response.statusCode,200,response.body);const draft=response.json().draft;
 assert.equal((await f.execute(create)).json().draft.id,draft.id);
 read=await f.read('business_intake');rememberWorkflowNames(read.data,f.pack.names);
 const update=f.prepare('business_intake','update',{draftId:draft.id,fields:{name:'Grounded company name',shortName:'Grounded',industry:'科技'}},read);response=await f.execute(update);assert.equal(response.statusCode,200,response.body);assert.equal((await f.execute(update)).statusCode,200,'PATCH replay retains existing idempotency');
 const stale=f.prepare('business_intake','check_sources',{draftId:draft.id},read);response=await f.execute(stale);assert.equal(response.statusCode,409,response.body);
 read=await f.read('business_intake');const check=f.prepare('business_intake','check_sources',{draftId:draft.id},read);assert.equal((await f.execute(check)).statusCode,200);assert.equal((await f.execute(check)).statusCode,200);
 const company=f.pack.companies[0];assert(company);f.pack.names.set(company.id,company.name);
 const bind=f.prepare('business_intake','bind',{draftId:draft.id,objectId:company.id},await f.read('business_intake'));response=await f.execute(bind);assert.equal(response.statusCode,200,response.body);const bound=response.json().draft;assert.equal(bound.objectId,company.id);assert.equal((await f.execute(bind)).json().draft.version,bound.version,'replay does not change version');
 assert.throws(()=>f.prepare('business_intake','bind',{draftId:draft.id,objectId:'unobserved-company'},read),{code:'action_object_unavailable'});
 assert.equal((await f.store.listCompanies()).find(c=>c.id===company.id)?.name,company.name,'binding does not overwrite original business values');
 }finally{await f.server.close();}
});
test('report template import adapter pins source/version and uses original import CAS and receipt',async()=>{
 const f=await fixture();try{
 const project=f.pack.projects[0],upload=await f.server.inject({url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name:'coverage-template.txt',type:'报告模板原件',projectId:project.id}),method:'POST',headers:{...f.request.headers,'content-type':'application/octet-stream'},payload:Buffer.from('一、项目概况\n请记录{{项目名称}}的原文依据。')});assert.equal(upload.statusCode,201,upload.body);
 const material=upload.json().material;f.pack.materials.push(material);f.pack.names.set(material.id,material.name);
 const query={versionId:material.currentVersionId},read=await readWorkflow(f.server,f.request,f.pack,{module:'report_template_import',targetId:material.id,query},true,f.actor);rememberWorkflowNames(read.data,f.pack.names);
 const args={module:'report_template_import',targetId:material.id,query,operation:'confirm',body:{title:'Original report template',source:{materialId:material.id,versionId:material.currentVersionId},sections:read.data.sections,variables:read.data.variables}};
 const plan=workflowProposal(args,read,f.pack,f.actor,randomUUID());assert.equal(plan.path,'/api/report-template-imports/confirm');let response=await f.execute(plan);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().template.status,'draft');const id=response.json().template.id;assert.equal((await f.execute(plan)).json().template.id,id);
 assert.throws(()=>workflowProposal({...args,query:{versionId:'other-version'}},read,f.pack,f.actor,randomUUID()),{code:'workflow_read_required'});
 assert.throws(()=>workflowProposal({...args,body:{...args.body,source:{materialId:material.id,versionId:'other-version'}}},read,f.pack,f.actor,randomUUID()),{code:'action_object_unavailable'});
 assert.throws(()=>f.prepare('report_template_import','confirm',args.body,read,material.id),{code:'workflow_read_required'});
 }finally{await f.server.close();}
});
test('AI completeness adapters read cached findings and reject expansion beyond selected object',async()=>{
 const f=await fixture();try{
 const fund=f.pack.funds[0],read=await f.read('fund_completeness',fund.id);assert.deepEqual(read.data.findings,[]);f.pack.names.set(fund.id,fund.name);
 const plan=f.prepare('fund_completeness','check',{fundIds:[fund.id],includeDemo:true},read,fund.id);assert.equal(plan.path,'/api/ai/fund-completeness');assert.equal(plan.body.expectedRevision,undefined);assert.equal(plan.body.requestId,undefined);
 assert.throws(()=>f.prepare('fund_completeness','check',{fundIds:[fund.id,'other'],includeDemo:true},read,fund.id),{code:'action_object_unavailable'});
 const upload=await f.server.inject({url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name:'coverage-material.txt',type:'资料',projectId:f.pack.projects[0].id}),method:'POST',headers:{...f.request.headers,'content-type':'application/octet-stream'},payload:Buffer.from('可核对原文')});assert.equal(upload.statusCode,201,upload.body);const material=upload.json().material;f.pack.materials.push(material);assert.equal((await f.read('material_versions',material.id)).data.versions.length,1);const findings=await f.read('material_completeness',material.id);assert.deepEqual(findings.data.findings,[]);f.pack.names.set(material.id,material.name);
 assert.throws(()=>f.prepare('material_completeness','check',{materialIds:['other']},findings,material.id),{code:'action_object_unavailable'});
 }finally{await f.server.close();}
});
test('lost draft bind response replays the receipt without reapplying the draft mutation',async()=>{
 const f=await fixture(true);try{
 const fund=f.pack.funds[0];f.pack.names.set(fund.id,fund.name);
 const created=await f.execute(f.prepare('business_intake','create',{objectType:'fund'},await f.read('business_intake')));assert.equal(created.statusCode,200,created.body);const draft=created.json().draft;
 const read=await f.read('business_intake');rememberWorkflowNames(read.data,f.pack.names);const plan=f.prepare('business_intake','bind',{draftId:draft.id,objectId:fund.id},read);
 assert.equal((await f.execute(plan)).statusCode,503);const afterFailure=(await f.read('business_intake')).data.drafts.find((v:any)=>v.id===draft.id);assert.equal(afterFailure.objectId,fund.id);
 const replay=await f.execute(plan);assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().draft.version,afterFailure.version);
 }finally{await f.server.close();}
});
