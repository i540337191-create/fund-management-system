import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {AgentRepository} from '../src/agent/repository.ts';
import {registerAgentWorkspaceRoutes} from '../src/http/agent-workspace.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {accessContext,ObjectPolicy} from '../src/auth/object-access.ts';
import {agentContext} from '../src/agent/runtime.ts';
const user={id:'review-user',name:'reviewer',role:'investment_manager' as const,email:'review@example.invalid'};
// Independent regressions cover permission changes, publication and interruption recovery.
test('review: revoked project provenance must hide cached execution results and prompt task context',async()=>{
 const repository=new AgentRepository(),store=createMemoryLedgerStore(),server=Fastify();
 const workspace=registerAgentWorkspaceRoutes(server,store,{repository,auth:{mode:'local-bypass'},startScheduler:false});
 try{
 const projectId='review-private-project';
 await repository.transaction(s=>{
  s.runs.push({id:'review-run',ownerId:user.id,scope:'personal',scheduleId:'review-schedule',skillId:'skill-profile',title:'analysis',status:'complete',result:'PRIVATE PROJECT RESULT',createdAt:new Date().toISOString()});
  s.schedules.push({id:'review-schedule',ownerId:user.id,scope:'personal',title:'analysis',skillId:'skill-profile',prompt:'analyze',nextAt:new Date().toISOString(),intervalMinutes:0,enabled:false,actor:user,projectId});
  s.tasks.push({id:'review-private-task',ownerId:user.id,scope:'personal',title:'PRIVATE PROJECT TASK',note:'PRIVATE PROJECT DETAIL',projectId,status:'open',remindAheadMinutes:0});
 });
 const policy=new ObjectPolicy(user,{funds:{},projects:{[projectId]:{visibility:'members',memberIds:[],revision:2}}},[{id:projectId,fundId:'review-fund',ownerId:'other'}],[{id:'review-fund',managerId:'other'}],[],[]);
 await accessContext.run({actor:user,refresh:async()=>policy},async()=>{
  const view=await workspace.view(user);assert.equal(view.schedules.length,0);
  assert.equal(view.runs.some(r=>r.result.includes('PRIVATE PROJECT RESULT')),false,'revoked project run result remains readable');
  const context=await agentContext(repository,user);assert.equal(context.tasks.length,0,'revoked project task still enters model context');
 });
 }finally{await server.close();}
});
test('review: retry must resume a durable action whose execution failed after receipt was committed',async()=>{
 const repository=new AgentRepository(),server=Fastify(),store=createMemoryLedgerStore();
 const workspace=registerAgentWorkspaceRoutes(server,store,{repository,auth:{mode:'local-bypass'},startScheduler:false});
 const original=workspace.runtime.run;let attempts=0;
 workspace.runtime.run=async()=>{throw Error('synthetic crash between receipt and execution');};
 try{
 const payload={requestId:randomUUID(),expectedRevision:1,action:'test_skill',data:{id:'skill-profile',prompt:'synthetic prompt'}};
 let response=await server.inject({method:'POST',url:'/api/agent-workspace/actions',payload});assert.equal(response.statusCode,500);
 workspace.runtime.run=async()=>{attempts++;return {} as any;};
 response=await server.inject({method:'POST',url:'/api/agent-workspace/actions',payload});assert.equal(response.statusCode,200,response.body);
 assert.equal(attempts,1,'request receipt suppressed execution of an action that never ran');
 }finally{workspace.runtime.run=original;await server.close();}
});
test('review: personal skill override cannot re-enable an administratively disabled organization skill',async()=>{
 const repository=new AgentRepository();
 await repository.transaction(s=>{s.skills.find(x=>x.id==='skill-profile')!.enabled=false;s.overrides[user.id]={'skill-profile':true};});
 const context=await agentContext(repository,user);
 assert.equal(context.skills.some(s=>s.id==='skill-profile'),false,'personal true override bypasses administrative skill disable');
});
test('review: owner task context must recheck current project access',async()=>{
 const repository=new AgentRepository(),projectId='review-denied-project';
 await repository.transaction(s=>s.tasks.push({id:'review-denied-task',ownerId:user.id,scope:'personal',title:'private task',note:'private details',projectId,status:'open',remindAheadMinutes:0}));
 const policy=new ObjectPolicy(user,{funds:{},projects:{[projectId]:{visibility:'members',memberIds:[],revision:1}}},[{id:projectId,fundId:'review-fund',ownerId:'other'}],[{id:'review-fund',managerId:'other'}],[],[]);
 const context=await accessContext.run({actor:user,refresh:async()=>policy},()=>agentContext(repository,user));
 assert.equal(context.tasks.length,0,'revoked project task still enters model context');
});
test('review: one-shot scheduler claim survives crash before starting its run',async()=>{
 class CrashRepository extends AgentRepository{
  armed=false;
  override async transaction<T>(fn:Parameters<AgentRepository['transaction']>[0]):Promise<T>{
   const result=await super.transaction(fn);
   if(this.armed&&Array.isArray(result)&&result.some((x:any)=>x.skillId&&x.status==='queued')){this.armed=false;throw Error('synthetic process crash after scheduler claim commit');}
   return result as T;
  }
 }
 const {workspaceRuntime}=await import('../src/agent/runtime.ts');
 const repository=new CrashRepository(),store=createMemoryLedgerStore(),server=Fastify();
 const actor={...user,id:'user-admin',role:'admin' as const};
 server.post('/api/ai/conversations',async()=>({id:'synthetic-conversation',revision:1}));
 server.post('/api/ai/conversations/:id/turns',async(_r,p)=>p.type('text/event-stream').send('event: done\ndata: '+JSON.stringify({conversation:{messages:[{role:'assistant',status:'complete',content:'synthetic result'}]}})+'\n\n'));
 const runtime=workspaceRuntime(server,store,repository,{mode:'local-bypass'});
 try{
 await repository.transaction(s=>s.schedules.push({id:'one-shot',ownerId:actor.id,scope:'personal',title:'one shot',skillId:'skill-profile',prompt:'synthetic prompt',nextAt:'2026-01-01T00:00:00.000Z',intervalMinutes:0,enabled:true,actor}));
 repository.armed=true;await assert.rejects(runtime.tick(new Date('2026-11-05T00:00:00.000Z')));
 await runtime.tick(new Date('2026-11-05T00:00:01.000Z'));
 const runs=await repository.transaction(s=>s.runs);
 assert.equal(runs.length,1,'one-shot schedule disabled by claim, crash leaves no recoverable execution');
 }finally{runtime.close();await server.close();}
});
async function templateFixture(repository=new AgentRepository()){
 const store=createMemoryLedgerStore(),server=Fastify(),workspace=registerAgentWorkspaceRoutes(server,store,{repository,auth:{mode:'local-bypass'},startScheduler:false});
 const act=async(action:string,data:any,rid=randomUUID())=>server.inject({method:'POST',url:'/api/agent-workspace/actions',payload:{requestId:rid,expectedRevision:await repository.transaction(s=>s.revision),action,data}});
 const draft={id:'review-template',title:'Review template',objectType:'project',scope:'organization',stage:'',fields:[{id:'review_field',label:'Review field',type:'text',enabled:true,required:false}],materials:[]};
 return {repository,store,server,workspace,act,draft};
}
test('review: published template stays active for team during draft edit and switches only on publication',async()=>{
 const f=await templateFixture();try{
 assert.equal((await f.act('save_template',f.draft)).statusCode,200);assert.equal((await f.act('publish_template',{id:f.draft.id})).statusCode,200);
 let context=await agentContext(f.repository,user);assert.equal(context.templates.length,1);const original=context.templates[0];
 const saved=await f.act('save_template',{...f.draft,title:'Second draft'});assert.equal(saved.statusCode,200,saved.body);const draftId=saved.json().result.id;
 context=await agentContext(f.repository,user);assert.equal(context.templates.length,1);assert.equal(context.templates[0].title,original.title);
 assert.equal((await f.act('publish_template',{id:draftId})).statusCode,200);context=await agentContext(f.repository,user);assert.equal(context.templates.length,1);assert.equal(context.templates[0].title,'Second draft');assert.equal((await f.repository.transaction(s=>s.templateHistory)).length,1);
 }finally{await f.server.close();}
});
test('review: schema write committed before workspace publication failure is safely resumed by same request',async()=>{
 class FailingPublication extends AgentRepository{armed=false;override transaction<T>(fn:Parameters<AgentRepository['transaction']>[0]):Promise<T>{return super.transaction(async s=>{const result=await fn(s);if(this.armed&&s.templates.some(t=>t.status==='published')){this.armed=false;throw Error('synthetic workspace commit failure after schema write');}return result as T;});}}
 const repository=new FailingPublication(),f=await templateFixture(repository);try{
 assert.equal((await f.act('save_template',f.draft)).statusCode,200);const rid=randomUUID();repository.armed=true;
 assert.equal((await f.act('publish_template',{id:f.draft.id},rid)).statusCode,500);const revision=await f.store.masterTransaction(s=>s.schemas.project.schemaRevision);
 assert.equal((await f.act('publish_template',{id:f.draft.id},rid)).statusCode,200);assert.equal(await f.store.masterTransaction(s=>s.schemas.project.schemaRevision),revision);assert.equal((await agentContext(repository,user)).templates.length,1);
 }finally{await f.server.close();}
});
test('review: draft changes after partial publication cannot reuse prior schema receipt as proof for changed fields',async()=>{
 class FailingPublication extends AgentRepository{armed=false;override transaction<T>(fn:Parameters<AgentRepository['transaction']>[0]):Promise<T>{return super.transaction(async s=>{const result=await fn(s);if(this.armed&&s.templates.some(t=>t.status==='published')){this.armed=false;throw Error('synthetic partial publication');}return result as T;});}}
 const repository=new FailingPublication(),f=await templateFixture(repository);try{
 assert.equal((await f.act('save_template',f.draft)).statusCode,200);const rid=randomUUID();repository.armed=true;assert.equal((await f.act('publish_template',{id:f.draft.id},rid)).statusCode,500);
 assert.equal((await f.act('save_template',{...f.draft,fields:[{...f.draft.fields[0],label:'Changed after partial publication'}]})).statusCode,200);
 const retry=await f.act('publish_template',{id:f.draft.id},rid);assert.equal(retry.statusCode,409,'old schema receipt accepted for a different template revision');
 }finally{await f.server.close();}
});
test('review: synced business tasks produce reminders and preserve source completion',async()=>{
 const f=await templateFixture();try{
 const project=(await f.store.listProjects())[0];await f.store.workflowTransaction(project.id,async s=>{s.tasks.push({id:'review-source-task',projectId:project.id,name:'source reminder',ownerId:'user-admin',owner:'管理员',dueDate:'2026-11-04',status:'未开始',kind:'manual'} as any);});
 await f.workspace.runtime.tick(new Date('2026-11-05T00:00:00.000Z'));
 let state=await f.repository.transaction(s=>s);assert(state.notifications.some(n=>n.taskId==='business:review-source-task'));const noticeCount=state.notifications.filter(n=>n.taskId==='business:review-source-task').length;
 await f.workspace.runtime.tick(new Date('2026-11-05T00:00:01.000Z'));state=await f.repository.transaction(s=>s);assert.equal(state.notifications.filter(n=>n.taskId==='business:review-source-task').length,noticeCount);
 assert.equal((await f.act('complete_task',{id:'business:review-source-task'})).statusCode,409);
 await f.store.workflowTransaction(project.id,async s=>{s.tasks.find(t=>t.id==='review-source-task')!.status='已完成';});await f.workspace.runtime.syncBusiness();assert.equal((await f.repository.transaction(s=>s.tasks.find(t=>t.id==='business:review-source-task')))!.status,'complete');
 }finally{await f.server.close();}
});
test('review: revoked source records must disappear from proposals, drafts and notices',async()=>{
 const f=await templateFixture();try{
 const projectId='review-revoked-source',materialId='review-private-material',policy=new ObjectPolicy(user,{funds:{},projects:{[projectId]:{visibility:'members',memberIds:[],revision:2}}},[{id:projectId,fundId:'review-fund',ownerId:'other'}],[{id:'review-fund',managerId:'other'}],[{id:materialId,projectId,relationships:{projects:[],funds:[],companies:[],investors:[]}}],[]);
 await f.repository.transaction(s=>{
 s.proposals.push({id:'review-proposal',ownerId:user.id,scope:'personal',action:'save_task',data:{projectId,title:'PRIVATE SOURCE PROPOSAL'},title:'PRIVATE SOURCE PROPOSAL',state:'pending',actionRequestId:randomUUID(),createdAt:new Date().toISOString()});
 s.drafts.push({id:'review-source-draft',ownerId:user.id,objectType:'company',title:'PRIVATE SOURCE DRAFT',fields:{},materialIds:[materialId],missing:[],updatedAt:new Date().toISOString(),version:1,status:'draft',candidates:[{key:'name',value:'SECRET',quote:'PRIVATE QUOTE',materialId,page:1}]});
 s.notifications.push({id:'review-private-notice',ownerId:user.id,scope:'personal',title:'PRIVATE SOURCE NOTICE',text:'SECRET',tone:'yellow',read:false,createdAt:new Date().toISOString(),dedupe:'review-private',projectId});
 });
 await accessContext.run({actor:user,refresh:async()=>policy},async()=>{const view=await f.workspace.view(user);assert.equal(view.notifications.length,0);assert.equal(view.proposals.length,0,'proposal source payload ignores revoked project');assert.equal(view.drafts.length,0,'draft ignores revoked material provenance');});
 }finally{await f.server.close();}
});
test('review: source material revocation hides extracted draft candidate snapshots',async()=>{
 const f=await templateFixture();try{
 const projectId='review-denied-draft-project',materialId='review-denied-draft-material',policy=new ObjectPolicy(user,{funds:{},projects:{[projectId]:{visibility:'members',memberIds:[],revision:1}}},[{id:projectId,fundId:'review-fund',ownerId:'other'}],[{id:'review-fund',managerId:'other'}],[{id:materialId,projectId,relationships:{projects:[],funds:[],companies:[],investors:[]}}],[]);
 await f.repository.transaction(s=>s.drafts.push({id:'review-material-draft',ownerId:user.id,objectType:'company',title:'PRIVATE extracted draft',fields:{},materialIds:[materialId],missing:[],updatedAt:new Date().toISOString(),version:1,status:'draft',candidates:[{key:'name',value:'PRIVATE',quote:'PRIVATE source quote',materialId,page:1}]}));
 await accessContext.run({actor:user,refresh:async()=>policy},async()=>{assert.equal((await f.workspace.view(user)).drafts.length,0);assert.equal((await agentContext(f.repository,user)).drafts.length,0);});
 }finally{await f.server.close();}
});
test('review: disabled schedule owner cannot receive an executable service session',async()=>{
 const f=await templateFixture();let requests=0;f.server.post('/api/ai/conversations',async()=>{requests++;return {id:'should-not-run'};});
 try{
 await f.store.accountTransaction(s=>s.users.push({...user,passwordHash:'synthetic',enabled:false,revision:1}));
 await f.repository.transaction(s=>s.schedules.push({id:'review-disabled-owner',ownerId:user.id,scope:'personal',title:'disabled user schedule',skillId:'skill-profile',prompt:'test',nextAt:'2026-01-01T00:00:00.000Z',intervalMinutes:0,enabled:true,actor:user}));
 await f.workspace.runtime.tick(new Date('2026-11-05T00:00:00.000Z'));const run=await f.repository.transaction(s=>s.runs.find(r=>r.scheduleId==='review-disabled-owner'));assert.equal(run?.status,'blocked');assert.equal(requests,0);assert.equal(await f.store.accountTransaction(s=>s.sessions.some(x=>x.actorId===user.id)),false);
 }finally{await f.server.close();}
});
test('review: harness receives custom skill instructions and gates workspace report actions by selected skill',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {createTestServer}=await import('./auth-fixture.ts');
 const dir=await mkdtemp(join(tmpdir(),'agent-review-harness-')),path=join(dir,'harness.mjs'),before=process.env.FUNDAPP_HARNESS_MODULE;await writeFile(path,'export async function runBusinessHarness(args){return globalThis.__reviewHarness(args)}');process.env.FUNDAPP_HARNESS_MODULE=path;
 const server=createTestServer({ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>{throw Error('external provider prohibited in review');}}});let deniedTask=false,deniedReport=false,instructionsPresent=false;
 try{
 const workspace=(await server.inject({url:'/api/agent-workspace'})).json();
 const saved=await server.inject({method:'POST',url:'/api/agent-workspace/actions',payload:{requestId:randomUUID(),expectedRevision:workspace.revision,action:'save_skill',data:{id:'review-knowledge-only',title:'Review knowledge only',description:'Review',instructions:'REVIEW_CUSTOM_SKILL_MARKER',category:'Review',tools:['knowledge'],pluginIds:['plugin-business'],enabled:true,scope:'personal'}}});assert.equal(saved.statusCode,200,saved.body);
 (globalThis as any).__reviewHarness=async(args:any)=>{instructionsPresent=args.system.includes('REVIEW_CUSTOM_SKILL_MARKER');await args.onTool('read_agent_workspace',{});try{await args.onTool('prepare_agent_workspace',{action:'save_task',title:'disallowed',data:JSON.stringify({title:'disallowed',note:'test'})});}catch(e){deniedTask=(e as any).code==='skill_unavailable';}try{await args.onTool('prepare_agent_workspace',{action:'save_report_binding',title:'disallowed report action',data:JSON.stringify({reportId:'synthetic-report',templateId:'synthetic-template',version:1})});}catch(e){deniedReport=(e as any).code==='skill_unavailable';}return {text:'review done',toolCalls:3};};
 const conversation=(await server.inject({method:'POST',url:'/api/ai/conversations',payload:{requestId:randomUUID(),includeDemo:true}})).json();
 await server.inject({method:'POST',url:`/api/ai/conversations/${conversation.id}/turns`,payload:{requestId:randomUUID(),expectedRevision:conversation.revision,prompt:'synthetic capability gate review',skillId:'review-knowledge-only'}});
 assert.equal(instructionsPresent,true,'custom skill instructions omitted from harness');assert.equal(deniedTask,true,'knowledge-only skill may prepare task');assert.equal(deniedReport,true,'knowledge-only skill may prepare report binding despite report capability disabled');
 }finally{await server.close();if(before===undefined)delete process.env.FUNDAPP_HARNESS_MODULE;else process.env.FUNDAPP_HARNESS_MODULE=before;delete (globalThis as any).__reviewHarness;await rm(dir,{recursive:true,force:true});}
});
test('review: LP task notifications remain private after owner loses LP-reading role',async()=>{
 const {createTestServer,registeredCookie}=await import('./auth-fixture.ts'),store=createMemoryLedgerStore(),secret='review-synthetic-session-secret-32-chars',auth={mode:'password' as const,sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'synthetic-password'},server=createTestServer({ledgerStore:store,auth});
 try{
 const viewer={...user,role:'viewer' as const},cookie=await registeredCookie(server,viewer,secret),investor=await store.lpTransaction(s=>s.investors[0]);
 await store.fundTransaction(async s=>{s.funds.find(f=>f.id===investor.fundId)!.managerId=viewer.id;});
 await store.lpTransaction(s=>{(s.data.fundraising??={})[investor.id]={requirements:[{id:'review-sensitive-requirement',name:'身份证附件 13700112233 PRIVATE-LP-REQUIREMENT',required:true,ownerId:viewer.id,dueDate:'2026-01-01'}],plans:[],allocations:[],history:[]};});
 const response=await server.inject({url:'/api/agent-workspace',headers:{cookie}});assert.equal(response.statusCode,200,response.body);assert.equal(response.body.includes('PRIVATE-LP-REQUIREMENT'),false,'LP source task title bypasses LP projection because it lacks investor provenance');
 }finally{await server.close();}
});
test('review: LP source task links preserve selected investor in ledger navigation',async()=>{
 const f=await templateFixture();try{
 const investor=await f.store.lpTransaction(s=>s.investors[0]);await f.store.lpTransaction(s=>{(s.data.fundraising??={})[investor.id]={requirements:[{id:'review-deeplink',name:'source evidence',required:true,ownerId:'user-admin',dueDate:'2026-01-01'}],plans:[],allocations:[],history:[]};});
 await f.workspace.runtime.syncBusiness();const task=await f.repository.transaction(s=>s.tasks.find(t=>t.id==='lp:raising-material-review-deeplink'));assert(task);assert.equal(new URL(task.href!,'http://local.invalid').searchParams.get('lp'),investor.id,'LP ledger selects URL parameter lp, not investorId');
 }finally{await f.server.close();}
});
