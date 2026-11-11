import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {AgentRepository} from '../src/agent/repository.ts';
import {workspaceRuntime} from '../src/agent/runtime.ts';
import {readSessionCookie,resolveAuthConfig,type SessionUser} from '../src/auth/session.ts';
import {registeredSession} from '../src/auth/registered-session.ts';
const auth={mode:'password' as const,sessionSecret:'scheduler-registered-session-fixture-secret',adminEmail:'configured@example.invalid',adminPassword:'fixture-password'};
async function fixture(actor:SessionUser){
 const store=createMemoryLedgerStore(),repo=new AgentRepository();let modelCalls=0;
 const server=createTestServer({ledgerStore:store,auth,ai:{env:{QWEN_API_KEY:'synthetic-fixture-only'},fetchImpl:async()=>{modelCalls++;return new Response('data: '+JSON.stringify({choices:[{delta:{content:'已核对当前账号可见的业务范围。'}}]})+'\n\ndata: [DONE]\n\n',{status:200,headers:{'Content-Type':'text/event-stream'}});}}});
 const observed:{version:number|undefined;user:SessionUser|null}[]=[];
 server.addHook('preHandler',async request=>{if(request.method==='POST'&&request.url==='/api/ai/conversations'){const payload=readSessionCookie(request.headers.cookie,auth.sessionSecret),session=await registeredSession(request.headers.cookie,resolveAuthConfig(auth),store);observed.push({version:payload?.v,user:session?.user??null});}});
 await registeredCookie(server,actor,auth.sessionSecret);
 const runtime=workspaceRuntime(server,store,repo,auth),scheduleId=randomUUID();
 await repo.transaction(s=>s.schedules.push({id:scheduleId,ownerId:actor.id,scope:'personal',version:1,title:'密码模式真实调度',skillId:'skill-knowledge',prompt:'请核对当前账号可见的基金资料；没有依据明确说明。',nextAt:'2020-01-01T00:00:00.000Z',intervalMinutes:0,recurrence:'once',enabled:true,actor}));
 const run=()=>repo.transaction(s=>s.runs.find(r=>r.scheduleId===scheduleId));
 const sessionCount=()=>store.accountTransaction(s=>s.sessions.length);
 return {store,repo,server,runtime,observed,run,sessionCount,get modelCalls(){return modelCalls;},close:async()=>{runtime.close();await server.close();}};
}
test('password-mode tick signs a registered v2 session, executes as current stored actor, and cleans temporary session',async()=>{
 const actor={id:'scheduler-viewer',name:'Old schedule name',email:'schedule@fixture.invalid',role:'viewer' as const},f=await fixture(actor);
 try{
 await f.store.accountTransaction(s=>{s.users.find(u=>u.id===actor.id)!.name='Current stored name';});const before=await f.sessionCount();
 await f.runtime.tick();const run=await f.run();assert.equal(run?.status,'complete',JSON.stringify(run));assert.equal(f.modelCalls,1);assert.deepEqual(f.observed,[{version:2,user:{...actor,name:'Current stored name'}}]);assert.equal(await f.sessionCount(),before);
 assert.equal(await f.store.assistantTransaction(actor.id+':viewer',s=>s.conversations.length),1);assert.equal(await f.store.assistantTransaction(actor.id+':admin',s=>s.conversations.length),0);
 await f.runtime.tick();assert.equal(f.modelCalls,1,'one-shot schedule must not rerun');
 }finally{await f.close();}
});
test('disabled, deleted, credential-revoked or role-revoked owners cannot obtain a scheduled service session',async()=>{
 for(const change of ['disabled','deleted','credentials','role'] as const){
 const actor={id:'scheduler-owner-'+change,name:'Schedule owner',email:change+'@fixture.invalid',role:'investment_manager' as const},f=await fixture(actor);
 try{
 await f.store.accountTransaction(s=>{const user=s.users.find(u=>u.id===actor.id)!;if(change==='disabled')user.enabled=false;if(change==='deleted')s.users=s.users.filter(u=>u.id!==actor.id);if(change==='credentials')delete user.passwordHash;if(change==='role')user.role='viewer';});const before=await f.sessionCount();
 await f.runtime.tick();const run=await f.run();assert.equal(run?.status,'blocked',JSON.stringify({change,run}));assert.equal(run?.error,'schedule_owner_unavailable');assert.equal(f.modelCalls,0);assert.deepEqual(f.observed,[]);assert.equal(await f.sessionCount(),before);
 }finally{await f.close();}
 }
});
test('revoked fund access blocks a scheduled run through the original permission boundary',async()=>{
 const actor={id:'scheduler-scoped-viewer',name:'Scoped viewer',email:'scoped@fixture.invalid',role:'viewer' as const},f=await fixture(actor);
 try{
 const fund=(await f.store.listFunds())[0];await f.repo.transaction(s=>{s.schedules[0].fundId=fund.id;});await f.store.accessTransaction(s=>{s.data.funds[fund.id]={visibility:'members',memberIds:[],revision:2};});const before=await f.sessionCount();
 await f.runtime.tick();assert.equal((await f.run())?.status,'blocked',JSON.stringify(await f.run()));assert.equal(f.modelCalls,0);assert.equal(await f.sessionCount(),before);
 }finally{await f.close();}
});
test('configured administrator schedule preserves the required bootstrap binding',async()=>{
 const actor={id:'user-admin',name:'Old admin label',email:auth.adminEmail,role:'admin' as const},f=await fixture(actor);
 try{
 const before=await f.sessionCount();await f.runtime.tick();assert.equal((await f.run())?.status,'complete',JSON.stringify(await f.run()));assert.deepEqual(f.observed,[{version:2,user:{id:'user-admin',name:'管理员',email:auth.adminEmail,role:'admin'}}]);assert.equal(await f.sessionCount(),before);
 }finally{await f.close();}
});
