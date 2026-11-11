import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createServer} from '../src/index.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createSessionCookie,readSessionCookie} from '../src/auth/session.ts';
const auth={mode:'password' as const,sessionSecret:'account-lifecycle-test-key',adminEmail:'accounts@example.test',adminPassword:'test-admin-password'};
async function fixture(t:import('node:test').TestContext){
  const store=createMemoryLedgerStore(),server=createServer({ledgerStore:store,auth});t.after(()=>server.close());
  const login=async(email=auth.adminEmail,password=auth.adminPassword)=>server.inject({method:'POST',url:'/api/session/login',payload:{email,password}});
  const signed=await login();assert.equal(signed.statusCode,200);const admin=String(signed.headers['set-cookie']);
  const call=(url:string,payload?:unknown,cookie=admin)=>server.inject({method:payload===undefined?'GET':'POST',url,...(payload===undefined?{}:{payload}),headers:{cookie}});
  const create=async(role='finance')=>{const input={requestId:randomUUID(),name:'财务测试',email:randomUUID()+'@example.test',role,password:'initial-user-password'};const result=await call('/api/users',input);assert.equal(result.statusCode,201,result.body);return {user:result.json().user,input};};
  const action=(user:any,patch:Record<string,unknown>,cookie=admin)=>call('/api/admin/users/'+user.id+'/actions',{requestId:randomUUID(),expectedRevision:user.revision,action:'update',...patch},cookie);
  return {store,server,login,admin,call,create,action};
}
test('configuration password and email changes invalidate old bootstrap sessions while unchanged restart preserves them',async t=>{
  const f=await fixture(t);const same=createServer({ledgerStore:f.store,auth});t.after(()=>same.close());assert.equal((await same.inject({url:'/api/session/me',headers:{cookie:f.admin}})).statusCode,200);
  for(const patch of [{adminPassword:'new-configuration-password'},{adminEmail:'new-configuration@example.test'}]){const changed=createServer({ledgerStore:f.store,auth:{...auth,...patch}});t.after(()=>changed.close());assert.equal((await changed.inject({url:'/api/session/me',headers:{cookie:f.admin}})).statusCode,401);}
});

test('logout revokes the original cookie and unknown or legacy signed sessions never authenticate',async t=>{
  const f=await fixture(t);const logout=await f.call('/api/session/logout',{});assert.equal(logout.statusCode,200);assert.equal((await f.call('/api/session/me')).statusCode,401);assert.equal((await f.call('/api/projects')).statusCode,401);assert.equal((await f.call('/api/ai/chat',{prompt:'must not run'})).statusCode,401);
  const payload={sub:'user-admin',email:auth.adminEmail,role:'admin',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600},encoded=Buffer.from(JSON.stringify(payload)).toString('base64url'),signature=createHmac('sha256',auth.sessionSecret).update(encoded).digest('base64url');
  assert.equal((await f.call('/api/session/me',undefined,'fundapp_session='+encoded+'.'+signature)).statusCode,401);
  assert.equal((await f.call('/api/session/me',undefined,createSessionCookie({id:'user-admin',name:'管理员',email:auth.adminEmail,role:'admin'},auth.sessionSecret))).statusCode,401);
});

test('disable, enable, role round trips and password reset never revive old sessions',async t=>{
  const f=await fixture(t);let {user,input}=await f.create();const login=await f.login(input.email,input.password),old=String(login.headers['set-cookie']);assert.equal(login.statusCode,200);
  let r=await f.action(user,{enabled:false});assert.equal(r.statusCode,200,r.body);user=r.json().user;assert.equal(r.json().sessionInvalidated,false);assert.equal(r.json().targetSessionsRevoked,true);assert.equal((await f.call('/api/session/me',undefined,old)).statusCode,401);assert.equal((await f.login(input.email,input.password)).statusCode,401);
  const disabled=(await f.call('/api/users')).json().users.find((u:any)=>u.id===user.id);assert.equal(disabled.canLogin,false);assert.equal(disabled.name,user.name);
  r=await f.action(user,{enabled:true});user=r.json().user;assert.equal((await f.call('/api/session/me',undefined,old)).statusCode,401);
  const second=String((await f.login(input.email,input.password)).headers['set-cookie']);
  r=await f.action(user,{role:'viewer'});user=r.json().user;r=await f.action(user,{role:'finance'});user=r.json().user;assert.equal((await f.call('/api/session/me',undefined,second)).statusCode,401);
  const third=String((await f.login(input.email,input.password)).headers['set-cookie']);r=await f.action(user,{password:'replaced-user-password'});assert.equal(r.statusCode,200,r.body);assert.equal((await f.call('/api/session/me',undefined,third)).statusCode,401);assert.equal((await f.login(input.email,input.password)).statusCode,401);assert.equal((await f.login(input.email,'replaced-user-password')).statusCode,200);
  const audit=await f.store.listAuditEvents();assert.ok(audit.some(e=>e.action==='修改账号'&&e.targetId===user.id));const safe=JSON.stringify([(await f.call('/api/admin/users')).json(),audit,await f.store.accountTransaction(s=>s.receipts)]);for(const credential of [input.password,'replaced-user-password',readSessionCookie(old,auth.sessionSecret)!.sid!])assert.ok(!safe.includes(credential));
});

test('self-service password changes need the old password, revoke the session and replay once after re-login',async t=>{
  const f=await fixture(t);const {user,input}=await f.create('viewer'),old=String((await f.login(input.email,input.password)).headers['set-cookie']);
  const body={requestId:randomUUID(),expectedRevision:user.revision,currentPassword:'wrong-password',newPassword:'own-new-password'};
  assert.equal((await f.call('/api/session/password',body,old)).statusCode,400);assert.equal((await f.call('/api/session/me',undefined,old)).statusCode,200);
  body.currentPassword=input.password;const r=await f.call('/api/session/password',body,old);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().sessionInvalidated,true);assert.equal(r.headers['set-cookie'],undefined);assert.equal((await f.call('/api/session/me',undefined,old)).statusCode,401);assert.equal((await f.login(input.email,input.password)).statusCode,401);
  const fresh=String((await f.login(input.email,body.newPassword)).headers['set-cookie']),replay=await f.call('/api/session/password',body,fresh);assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().sessionInvalidated,false);assert.equal((await f.call('/api/session/me',undefined,fresh)).statusCode,200);assert.equal((await f.store.listAuditEvents()).filter(e=>e.action==='本人修改密码'&&e.targetId===user.id).length,1);
  assert.equal((await f.call('/api/admin/users',undefined,fresh)).statusCode,403);
});

test('administrator self-lockout and configuration-account edits are rejected, while bootstrap revoke is durable',async t=>{
  const f=await fixture(t);const {user,input}=await f.create('admin'),own=String((await f.login(input.email,input.password)).headers['set-cookie']);
  for(const patch of [{role:'viewer'},{enabled:false}])assert.equal((await f.action(user,patch,own)).statusCode,409);
  assert.equal((await f.action(user,{password:'administrator-new-password'},own)).json().error,'current_password_required');
  const b=(await f.call('/api/admin/users')).json().users.find((u:any)=>u.id==='user-admin');assert.equal(b.managedBy,'configuration');assert.equal(b.revision,null);
  assert.equal((await f.call('/api/admin/users/user-admin/actions',{action:'update',requestId:randomUUID(),expectedRevision:null,name:'cannot override'})).statusCode,403);
  const second=String((await f.login()).headers['set-cookie']);const revoked=await f.call('/api/admin/users/user-admin/actions',{action:'revoke_sessions',requestId:randomUUID(),expectedRevision:null});assert.equal(revoked.statusCode,200,revoked.body);assert.equal(revoked.json().sessionInvalidated,true);for(const cookie of [f.admin,second])assert.equal((await f.call('/api/session/me',undefined,cookie)).statusCode,401);
  const restarted=createServer({ledgerStore:f.store,auth});t.after(()=>restarted.close());assert.equal((await restarted.inject({url:'/api/session/me',headers:{cookie:second}})).statusCode,401);assert.equal((await f.login()).statusCode,200);
});

test('opaque registered sessions have no identity claims and reject injected identities; account retries are idempotent',async t=>{
  const f=await fixture(t),input={requestId:randomUUID(),name:'真实存储姓名',email:randomUUID()+'@example.test',role:'viewer',password:'idempotent-user-password'};
  const first=await f.call('/api/users',input),again=await f.call('/api/users',input);assert.equal(first.statusCode,201);assert.equal(again.json().user.id,first.json().user.id);assert.equal((await f.call('/api/users',{...input,password:'different-secret-password'})).statusCode,409);
  const user=first.json().user,login=await f.login(input.email,input.password),cookie=String(login.headers['set-cookie']),session=readSessionCookie(cookie,auth.sessionSecret)!;
  const injected=Buffer.from(JSON.stringify({...session,name:'伪造姓名',role:'admin',email:'spoofed@example.test'})).toString('base64url'),spoofed='fundapp_session='+injected+'.'+createHmac('sha256',auth.sessionSecret).update(injected).digest('base64url');assert.equal((await f.call('/api/admin/users',undefined,spoofed)).statusCode,401);assert.equal((await f.call('/api/admin/users',undefined,cookie)).statusCode,403);assert.deepEqual(Object.keys(session).sort(),['exp','iat','sid','v']);const me=(await f.call('/api/session/me',undefined,cookie)).json().user;assert.equal(me.name,input.name);assert.equal(me.role,'viewer');
  const body={action:'update',requestId:randomUUID(),expectedRevision:user.revision,name:'更新姓名'},endpoint='/api/admin/users/'+user.id+'/actions';const changed=await f.call(endpoint,body);assert.equal(changed.statusCode,200);const newLogin=String((await f.login(input.email,input.password)).headers['set-cookie']);assert.equal((await f.call(endpoint,body)).json().user.revision,changed.json().user.revision);assert.equal((await f.call('/api/session/me',undefined,newLogin)).statusCode,200);assert.equal((await f.call(endpoint,{...body,requestId:randomUUID()})).statusCode,409);
});

test('a credential check before a concurrent disable or reset cannot issue a stale login',async t=>{
  const f=await fixture(t);let {user,input}=await f.create();const original=f.store.listUsers;
  for(const patch of [{enabled:false},{password:'concurrent-new-password'}]){
    let ready!:()=>void,release!:()=>void;const seen=new Promise<void>(resolve=>{ready=resolve}),gate=new Promise<void>(resolve=>{release=resolve});
    f.store.listUsers=async()=>{const snapshot=await original();ready();await gate;return snapshot;};
    const attempt=f.login(input.email,input.password);await seen;f.store.listUsers=original;
    const mutation=await f.action(user,patch);assert.equal(mutation.statusCode,200,mutation.body);user=mutation.json().user;release();assert.equal((await attempt).statusCode,401);
    if(patch.enabled===false){const enabled=await f.action(user,{enabled:true});user=enabled.json().user;}
  }
});

test('account mutations roll back user, sessions, receipt and audit together after a late transaction failure',async t=>{
  const f=await fixture(t);const {user,input}=await f.create(),cookie=String((await f.login(input.email,input.password)).headers['set-cookie']);
  const transaction=f.store.accountTransaction;const before=await transaction(s=>({users:s.users,sessions:s.sessions,receipts:s.receipts})),beforeAudit=await f.store.listAuditEvents();
  f.store.accountTransaction=action=>transaction(async s=>{await action(s);throw Error('forced private persistence failure');});
  const failed=await f.action(user,{enabled:false});assert.equal(failed.statusCode,500);assert.deepEqual(failed.json(),{error:'account_action_failed'});f.store.accountTransaction=transaction;
  assert.deepEqual(await transaction(s=>({users:s.users,sessions:s.sessions,receipts:s.receipts})),before);assert.deepEqual(await f.store.listAuditEvents(),beforeAudit);assert.equal((await f.call('/api/session/me',undefined,cookie)).statusCode,200);
});

test('credential validation and malformed JSON never echo supplied credential text',async t=>{
  const f=await fixture(t),marker='synthetic-password-should-not-be-echoed';
  for(const [url,payload,cookie] of [['/api/session/login','{"email":"x","password":"'+marker+'"',undefined],['/api/users','{"password":"'+marker+'"',f.admin]] as const){
    const r=await f.server.inject({method:'POST',url,payload,headers:{'content-type':'application/json',...(cookie?{cookie}:{})}});assert.equal(r.statusCode,400);assert.ok(!r.body.includes(marker));
  }
  const bad=await f.call('/api/users',{name:'验证',email:'invalid',role:'finance',password:marker});assert.equal(bad.statusCode,400);assert.ok(!bad.body.includes(marker));
});

test('legacy named users without passwords stay non-login identities until explicitly configured, and disabled reviewers disappear from eligibility',async t=>{
  const f=await fixture(t),id=randomUUID(),email='legacy-'+id+'@example.test';await f.store.insertUser({id,name:'原负责人姓名',email,role:'finance',passwordHash:null});
  let directory=(await f.call('/api/admin/users')).json().users;let user=directory.find((u:any)=>u.id===id);assert.equal(user.enabled,true);assert.equal(user.passwordConfigured,false);assert.equal(user.canLogin,false);assert.equal((await f.login(email,'not-configured')).statusCode,401);
  let changed=await f.action(user,{enabled:true,password:'explicit-legacy-password'});assert.equal(changed.statusCode,200,changed.body);user=changed.json().user;assert.equal(user.canLogin,true);assert.equal((await f.login(email,'explicit-legacy-password')).statusCode,200);
  changed=await f.action(user,{enabled:false});assert.equal(changed.statusCode,200);const visible=(await f.call('/api/users')).json().users.find((u:any)=>u.id===id);assert.equal(visible.name,'原负责人姓名');assert.equal(visible.canLogin,false);
  const pid=(await f.call('/api/projects')).json().projects[0].id,returns=await f.call('/api/projects/'+pid+'/returns');assert.equal(returns.statusCode,200);assert.ok(!returns.json().reviewers.some((u:any)=>u.id===id));
});

test('non-admin self revoke removes every own session only, rejects injected targets and never replays against a new login',async t=>{
  const f=await fixture(t),{user,input}=await f.create('finance');
  const one=String((await f.login(input.email,input.password)).headers['set-cookie']),two=String((await f.login(input.email,input.password)).headers['set-cookie']);
  const body={requestId:randomUUID(),expectedRevision:user.revision};
  for(const extra of [{userId:'user-admin'},{role:'admin'},{action:'update'},{enabled:false}]){const invalid=await f.call('/api/session/revoke-sessions',{...body,...extra},one);assert.equal(invalid.statusCode,400);}
  assert.equal((await f.call('/api/admin/users/'+user.id+'/actions',{action:'revoke_sessions',...body},one)).statusCode,403);
  const result=await f.call('/api/session/revoke-sessions',body,one);assert.equal(result.statusCode,200,result.body);assert.equal(result.json().user.id,user.id);assert.equal(result.json().sessionInvalidated,true);assert.equal(result.headers['set-cookie'],undefined);
  for(const cookie of [one,two])assert.equal((await f.call('/api/session/me',undefined,cookie)).statusCode,401);assert.equal((await f.call('/api/session/me')).statusCode,200);
  const fresh=String((await f.login(input.email,input.password)).headers['set-cookie']),retry=await f.call('/api/session/revoke-sessions',body,fresh);assert.equal(retry.statusCode,200);assert.equal(retry.json().sessionInvalidated,false);assert.equal((await f.call('/api/session/me',undefined,fresh)).statusCode,200);assert.equal((await f.store.listAuditEvents()).filter(e=>e.action==='本人撤销全部会话'&&e.targetId===user.id).length,1);
  const bootstrap=await f.call('/api/session/revoke-sessions',{requestId:randomUUID(),expectedRevision:null});assert.equal(bootstrap.statusCode,200,bootstrap.body);assert.equal(bootstrap.json().sessionInvalidated,true);assert.equal((await f.call('/api/session/me')).statusCode,401);
});

test('concurrent logout treats the already-revoked session as unauthenticated rather than a server outage',async t=>{
  const f=await fixture(t),results=await Promise.all([f.call('/api/session/logout',{}),f.call('/api/session/logout',{})]);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,401]);assert.equal((await f.call('/api/session/me')).statusCode,401);
});

test('expired or corrupt server registry expiry fails closed even when the signed cookie has time left; login cleans expired rows',async t=>{
  const f=await fixture(t);await f.store.accountTransaction(s=>{s.sessions[0].expiresAt='not-a-time';});assert.equal((await f.call('/api/session/me')).statusCode,401);
  await f.store.accountTransaction(s=>{s.sessions[0].expiresAt=new Date(Date.now()-1000).toISOString();});assert.equal((await f.call('/api/session/me')).statusCode,401);
  const fresh=await f.login();assert.equal(fresh.statusCode,200);const remaining=await f.store.accountTransaction(s=>s.sessions);assert.equal(remaining.length,1);assert.ok(Date.parse(remaining[0].expiresAt)>Date.now());
});

for(const kind of ['logout','password','self_revoke','bootstrap_revoke'] as const)test(`a delayed original ${kind} response cannot clear a later login cookie`,async t=>{
  const f=await fixture(t),created=await f.create('viewer');const isBootstrap=kind==='bootstrap_revoke',email=isBootstrap?auth.adminEmail:created.input.email,oldPassword=isBootstrap?auth.adminPassword:created.input.password;
  const before=String((await f.login(email,oldPassword)).headers['set-cookie']);let response;
  if(kind==='logout')response=await f.call('/api/session/logout',{},before);
  else if(kind==='password')response=await f.call('/api/session/password',{requestId:randomUUID(),expectedRevision:created.user.revision,currentPassword:oldPassword,newPassword:'later-login-password'},before);
  else if(kind==='self_revoke')response=await f.call('/api/session/revoke-sessions',{requestId:randomUUID(),expectedRevision:created.user.revision},before);
  else response=await f.call('/api/admin/users/user-admin/actions',{action:'revoke_sessions',requestId:randomUUID(),expectedRevision:null},before);
  assert.equal(response.statusCode,200,response.body);assert.equal((await f.call('/api/session/me',undefined,before)).statusCode,401);
  // Hold the original response, apply a new login first, then apply any Set-Cookie from that delayed response.
  const signed=await f.login(email,kind==='password'?'later-login-password':oldPassword);assert.equal(signed.statusCode,200);const fresh=String(signed.headers['set-cookie']),afterLateResponse=response.headers['set-cookie']?String(response.headers['set-cookie']):fresh;
  assert.equal((await f.call('/api/session/me',undefined,afterLateResponse)).statusCode,200);
});

test('expected session context blocks an old filled form after another identity logs in, before body parsing',async t=>{
  const f=await fixture(t),{user,input}=await f.create('admin'),signed=await f.login(input.email,input.password),b=String(signed.headers['set-cookie']);
  const {sessionHash}=await import('../src/auth/registered-session.ts');
  const aContext=sessionHash(readSessionCookie(f.admin,auth.sessionSecret)!.sid!),bContext=sessionHash(readSessionCookie(b,auth.sessionSecret)!.sid!);
  const payload={requestId:randomUUID(),name:'旧A表单',email:randomUUID()+'@example.test',role:'viewer',password:'stale-form-user-password'};
  const before={users:await f.store.listUsers(),audit:await f.store.listAuditEvents(),security:await f.store.accountTransaction(s=>({sessions:s.sessions,receipts:s.receipts}))};
  const stale=await f.server.inject({method:'POST',url:'/api/users',payload,headers:{cookie:b,'x-fundapp-session-context':aContext}});assert.equal(stale.statusCode,401);assert.equal(stale.json().error,'session_context_changed');
  assert.deepEqual({users:await f.store.listUsers(),audit:await f.store.listAuditEvents(),security:await f.store.accountTransaction(s=>({sessions:s.sessions,receipts:s.receipts}))},before);
  const allowed=await f.server.inject({url:'/api/admin/users',headers:{cookie:f.admin,'x-fundapp-session-context':aContext}});assert.equal(allowed.statusCode,200);assert.equal(allowed.headers['x-fundapp-session-context'],aContext);
  const malformed=await f.server.inject({method:'POST',url:'/api/users',payload:'{"password":"not-complete',headers:{cookie:b,'x-fundapp-session-context':aContext,'content-type':'application/json'}});assert.equal(malformed.statusCode,401);assert.equal(malformed.json().error,'session_context_changed');
  for(const bad of [undefined,'fundapp_session=wrong-cookie']){const r=await f.server.inject({url:'/api/admin/users',headers:{...(bad?{cookie:bad}:{}),'x-fundapp-session-context':bContext}});assert.equal(r.statusCode,401);}
  const me=await f.server.inject({url:'/api/session/me',headers:{cookie:b,'x-fundapp-session-context':aContext}});assert.equal(me.statusCode,200);assert.equal(me.json().user.id,user.id);assert.equal(me.headers['x-fundapp-session-context'],bContext);assert.equal(signed.headers['x-fundapp-session-context'],bContext);assert.match(bContext,/^[a-f0-9]{64}$/);assert.notEqual(bContext,readSessionCookie(b,auth.sessionSecret)!.sid);
  const legacy=await f.call('/api/users',payload,b);assert.equal(legacy.statusCode,201);assert.equal(legacy.json().auditEvent.actorId,user.id);
  const bypass=createServer({auth:{mode:'local-bypass'}});t.after(()=>bypass.close());const local=await bypass.inject({url:'/api/projects',headers:{'x-fundapp-session-context':aContext}});assert.equal(local.statusCode,200);assert.equal(local.headers['x-fundapp-session-context'],undefined);
});
