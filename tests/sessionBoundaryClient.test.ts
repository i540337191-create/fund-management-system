import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../src/lib/apiClient.ts';
import {subscribeSessionInvalidation} from '../src/lib/sessionBoundary.ts';

test('a real business401 invalidates the UI session, while login rejection and network failure do not',async()=>{
 let changes=0;const stop=subscribeSessionInvalidation(()=>changes++);
 try{
  const api=createApiClient({fetchImpl:async url=>{if(String(url).includes('funds'))throw Error('offline');return new Response('{"error":"unauthenticated"}',{status:401,headers:{'content-type':'application/json'}});}});
  await assert.rejects(api.login({email:'test@example.test',password:'test-only-password'}));assert.equal(changes,0);
  await assert.rejects(api.getFunds());assert.equal(changes,0);
  await assert.rejects(api.getProjects());assert.equal(changes,1);
 }finally{stop();}
});

for(const status of [200,401])test(`late old-session ${status} body cannot override or sign out a newly logged in actor`,async()=>{
 let changes=0;const stop=subscribeSessionInvalidation(()=>changes++);let release!:(v:unknown)=>void;let parsing!:()=>void;
 const body=new Promise<unknown>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{parsing=resolve;});
 try{
  const api=createApiClient({fetchImpl:async url=>String(url).endsWith('/api/session/login')?new Response('{"user":{"id":"new-actor"}}',{headers:{'content-type':'application/json'}}):({ok:status===200,status,json:()=>{parsing();return body;}} as Response)});
  const pending=api.getProjects();const rejected=assert.rejects(pending,(e:any)=>e.code==='client_session_changed');await started;
  await api.login({email:'test@example.test',password:'test-only-password'});
  release(status===200?{projects:[{id:'old-private-project'}]}:{error:'unauthenticated'});await rejected;assert.equal(changes,0);
 }finally{stop();}
});

test('each tab binds writes to its established identity and a changed me clears rather than adopts another actor',async()=>{
 const {SESSION_CONTEXT_HEADER,clientSessionContext,invalidateClientSession}=await import('../src/lib/sessionBoundary.ts');
 const reasons:string[]=[],stop=subscribeSessionInvalidation(reason=>reasons.push(reason));let identity='a'.repeat(64),captured:RequestInit|undefined;
 try{
  const api=createApiClient({fetchImpl:async(url,init)=>{captured=init;return new Response(JSON.stringify(String(url).endsWith('/api/session/me')?{user:{id:identity[0]}}:{ok:true}),{headers:{'content-type':'application/json',[SESSION_CONTEXT_HEADER]:identity}});}});
  await api.getSessionMe();assert.equal(clientSessionContext(),identity);assert.equal(new Headers(captured?.headers).has(SESSION_CONTEXT_HEADER),false);
  await api.actOnAccount('target',{action:'revoke_sessions',requestId:'guarded-write',expectedRevision:2});assert.equal(new Headers(captured?.headers).get(SESSION_CONTEXT_HEADER),identity);
  identity='b'.repeat(64);await assert.rejects(api.getSessionMe(),(e:any)=>e.code==='session_context_changed');assert.equal(clientSessionContext(),null);assert.deepEqual(reasons,['context_changed']);
 }finally{stop();invalidateClientSession();}
});

test('AI requests carry the same expected identity and external document fetches never receive that context',async()=>{
 const {SESSION_CONTEXT_HEADER,acceptClientSession,invalidateClientSession,fetchInSession}=await import('../src/lib/sessionBoundary.ts');
 const {requestProjectAiReply}=await import('../src/lib/aiService.ts');
 acceptClientSession('c'.repeat(64));let captured:RequestInit|undefined;
 try{
  await requestProjectAiReply({prompt:'工程身份隔离验证'},async(_url,init)=>{captured=init;return new Response('{"role":"assistant","content":"synthetic"}',{headers:{'content-type':'application/json'}});});assert.equal(new Headers(captured?.headers).get(SESSION_CONTEXT_HEADER),'c'.repeat(64));
  await fetchInSession(async(_url,init)=>{captured=init;return new Response('external');},'https://outside.example.test/document');assert.equal(new Headers(captured?.headers).has(SESSION_CONTEXT_HEADER),false);assert.equal(captured?.credentials,undefined);
 }finally{invalidateClientSession();}
});

test('concurrent initial me requests in StrictMode establish one identical context without invalidating the active mount',async()=>{
 const {SESSION_CONTEXT_HEADER,clientSessionEpoch,clientSessionContext,invalidateClientSession}=await import('../src/lib/sessionBoundary.ts');
 invalidateClientSession();const before=clientSessionEpoch();
 const api=createApiClient({fetchImpl:async()=>new Response('{"user":{"id":"same-actor"}}',{headers:{'content-type':'application/json',[SESSION_CONTEXT_HEADER]:'d'.repeat(64)}})});
 const [cancelledMount,activeMount]=await Promise.all([api.getSessionMe(),api.getSessionMe()]);assert.equal(activeMount.user.id,'same-actor');assert.equal(cancelledMount.user.id,'same-actor');assert.equal(clientSessionContext(),'d'.repeat(64));assert.equal(clientSessionEpoch(),before);invalidateClientSession();
});


test('logout accepts cancellation and failed revocation does not invalidate the active client',async()=>{
 let changes=0;const stop=subscribeSessionInvalidation(()=>changes++),controller=new AbortController();
 try{
  const api=createApiClient({fetchImpl:async(_url,init)=>{assert.equal(init?.signal,controller.signal);throw new DOMException('Aborted','AbortError');}});
  await assert.rejects(api.logout(controller.signal));assert.equal(changes,0);
  const unavailable=createApiClient({fetchImpl:async()=>new Response('{"error":"session_unavailable"}',{status:503})});
  await assert.rejects(unavailable.logout());assert.equal(changes,0);
 }finally{stop();}
});

test('a delayed automatic session handshake cannot restore the UI after successful logout',async()=>{
 let release!:(v:unknown)=>void,started!:()=>void;
 const parsed=new Promise<void>(resolve=>{started=resolve;}),body=new Promise<unknown>(resolve=>{release=resolve;});
 const api=createApiClient({fetchImpl:async url=>String(url).endsWith('/api/session/me')?({ok:true,status:200,json:()=>{started();return body;}} as Response):new Response('{"ok":true}',{headers:{'content-type':'application/json'}})});
 const restoring=api.getSessionMe();const rejected=assert.rejects(restoring,(error:any)=>error.code==='client_session_changed');await parsed;
 await api.logout();release({user:{id:'old-user'}});await rejected;
});
