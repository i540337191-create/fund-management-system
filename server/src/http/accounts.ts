import {createHmac,randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import type {LedgerStore,AuditEvent} from '../ledger/store.ts';
import {accountUser,type AccountState,type AccountUser} from '../ledger/accounts.ts';
import {currentAccountActor,cachedRequestSession} from '../auth/registered-session.ts';
import {resolveRequestUser} from '../auth/authorize.ts';
import {resolveAuthConfig,getAdminUser,type AuthConfigInput,type SessionUser} from '../auth/session.ts';
import {hashPassword,checkPassword} from '../auth/password.ts';
import {isRole} from '../auth/rbac.ts';
import {WorkflowError,fail,object,string,revision,requestId,type StoredUser} from '../ledger/workflow.ts';

type Saved={user:AccountUser;auditEvent:AuditEvent;targetSessionsRevoked:boolean};
function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;}
function password(value:unknown){if(typeof value!=='string'||value.length<12||value.length>128)fail('invalid_password');return value;}
function event(s:AccountState,actor:SessionUser,user:AccountUser,action:string,detail:Record<string,unknown>){
  const auditEvent={id:randomUUID(),module:'账号管理',action,targetType:'账号',targetId:user.id,targetName:user.name,actor:actor.name,actorId:actor.id,time:new Date().toISOString(),detail:JSON.stringify(detail),source:'账号与会话',dataOrigin:'user_input'};
  s.auditEvents.push(auditEvent);return auditEvent;
}
export function registerAccountRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput}={}){
  const auth=resolveAuthConfig(options.auth);
  const wrap=(fn:(r:FastifyRequest,reply:FastifyReply)=>Promise<unknown>)=>async(r:FastifyRequest,reply:FastifyReply)=>{
    try{return await fn(r,reply);}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});r.log.error({code:'account_action_failed'});return reply.code(500).send({error:'account_action_failed'});}
  };
  const administrator=(r:FastifyRequest)=>{const actor=resolveRequestUser(r,auth);if(actor?.role!=='admin')fail('forbidden',403);return actor;};
  const configured=()=>accountUser(getAdminUser(auth),true);
  function find(s:AccountState,id:string){const user=s.users.find(u=>u.id===id);if(!user)fail('user_not_found',404);if(id==='user-admin'||user.email.toLowerCase()===auth.adminEmail.toLowerCase())fail('configuration_managed',403);return user;}
  function revoked(s:AccountState,id:string){s.sessions=s.sessions.filter(v=>v.actorId!==id&&Date.parse(v.expiresAt)>Date.now());}
  function remembered(s:AccountState,id:string,actor:SessionUser,body:unknown,target:string,write:()=>Saved):Saved{
    // Keyed fingerprints make credential-bearing retry bodies comparable without storing them or a password oracle.
    const fingerprint=createHmac('sha256',auth.sessionSecret).update(JSON.stringify(canonical({actorId:actor.id,target,body}))).digest('hex');
    const prior=s.receipts[id];if(prior){if(prior.actorId!==actor.id||prior.fingerprint!==fingerprint)fail('request_conflict',409);return structuredClone(prior.result) as Saved;}
    const result=write();s.receipts[id]={actorId:actor.id,fingerprint,result:structuredClone(result)};return result;
  }
  function response(s:AccountState,r:FastifyRequest,result:Saved){
    const hash=cachedRequestSession(r)?.hash;
    const sessionInvalidated=auth.mode==='password'&&Boolean(hash)&&!s.sessions.some(v=>v.hash===hash);
    return {...result,sessionInvalidated};
  }
  server.get('/api/admin/users',wrap(async r=>{const currentUser=administrator(r);return {currentUser,users:[configured(),...(await store.listUsers()).filter(u=>u.id!=='user-admin'&&u.email.toLowerCase()!==auth.adminEmail.toLowerCase()).map(u=>accountUser(u))]};}));
  server.get('/api/session/account',wrap(async r=>{
    const actor=resolveRequestUser(r,auth)!;if(actor.id==='user-admin')return {user:configured()};
    const user=(await store.listUsers()).find(u=>u.id===actor.id);if(!user)fail('unauthenticated',401);return {user:accountUser(user)};
  }));
  server.post('/api/users',wrap(async(r,reply)=>{
    administrator(r);const b=object(r.body,['name','email','role','password','requestId']);
    const name=string(b.name,true,200),email=string(b.email,true,254).toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!isRole(b.role))fail('invalid_user_payload');
    const role=b.role,newHash=hashPassword(password(b.password)),id=b.requestId===undefined?randomUUID():requestId(b.requestId);
    if(email===auth.adminEmail.toLowerCase())fail('reserved_email',409);
    const result=await store.accountTransaction(s=>{
      const actor=currentAccountActor(s,r,auth);if(actor.role!=='admin')fail('forbidden',403);
      const saved=remembered(s,id,actor,b,'create',()=>{
        if(s.users.some(u=>u.email.toLowerCase()===email))fail('email_exists',409);
        const user:StoredUser={id:randomUUID(),name,email,role,passwordHash:newHash,enabled:true,revision:1};s.users.push(user);const dto=accountUser(user);
        return {user:dto,auditEvent:event(s,actor,dto,'创建账号',{name,email,role,enabled:true,passwordConfigured:true}),targetSessionsRevoked:false};
      });return response(s,r,saved);
    });return reply.code(201).send(result);
  }));
  server.post('/api/admin/users/:id/actions',wrap(async(r,reply)=>{
    administrator(r);const id=string((r.params as {id:string}).id),b=object(r.body,['action','requestId','expectedRevision','name','role','enabled','password']);
    if(!['update','revoke_sessions'].includes(String(b.action)))fail('invalid_account_action');
    const rid=requestId(b.requestId);let newHash:string|undefined;
    if(b.action==='update'){
      if(!['name','role','enabled','password'].some(k=>b[k]!==undefined))fail('invalid_user_payload');
      if(b.name!==undefined)string(b.name,true,200);if(b.role!==undefined&&!isRole(b.role))fail('invalid_user_payload');if(b.enabled!==undefined&&typeof b.enabled!=='boolean')fail('invalid_user_payload');
      if(b.password!==undefined)newHash=hashPassword(password(b.password));
    }else if(['name','role','enabled','password'].some(k=>b[k]!==undefined))fail('invalid_payload');
    const result=await store.accountTransaction(s=>{
      const actor=currentAccountActor(s,r,auth);if(actor.role!=='admin')fail('forbidden',403);
      const saved=remembered(s,rid,actor,b,id,()=>{
        if(id==='user-admin'){
          if(b.action!=='revoke_sessions')fail('configuration_managed',403);if(b.expectedRevision!==null)fail('account_revision_conflict',409);
          revoked(s,id);const user=configured();return {user,auditEvent:event(s,actor,user,'撤销账号会话',{configurationManaged:true}),targetSessionsRevoked:true};
        }
        const user=find(s,id);if(revision(b.expectedRevision)!==(user.revision??1))fail('account_revision_conflict',409);
        if(b.action==='update'){
          if(id===actor.id&&((b.enabled===false)||(b.role!==undefined&&b.role!==actor.role)))fail('self_account_lockout',409);
          if(id===actor.id&&newHash!==undefined)fail('current_password_required',400);
          const changedFields=['name','role','enabled','password'].filter(k=>b[k]!==undefined),before={name:user.name,role:user.role,enabled:user.enabled!==false,passwordConfigured:Boolean(user.passwordHash)};
          if(b.name!==undefined)user.name=string(b.name,true,200);if(b.role!==undefined)user.role=b.role as StoredUser['role'];if(b.enabled!==undefined)user.enabled=b.enabled as boolean;if(newHash!==undefined)user.passwordHash=newHash;
          user.revision=(user.revision??1)+1;revoked(s,id);const dto=accountUser(user);
          return {user:dto,auditEvent:event(s,actor,dto,'修改账号',{changedFields,before,after:{name:dto.name,role:dto.role,enabled:dto.enabled,passwordConfigured:dto.passwordConfigured}}),targetSessionsRevoked:true};
        }
        user.revision=(user.revision??1)+1;revoked(s,id);const dto=accountUser(user);return {user:dto,auditEvent:event(s,actor,dto,'撤销账号会话',{}),targetSessionsRevoked:true};
      });return response(s,r,saved);
    });return result;
  }));
  server.post('/api/session/revoke-sessions',wrap(async(r,reply)=>{
    const b=object(r.body,['requestId','expectedRevision']),rid=requestId(b.requestId);
    const result=await store.accountTransaction(s=>{
      const actor=currentAccountActor(s,r,auth);
      const saved=remembered(s,rid,actor,b,actor.id,()=>{
        let user:AccountUser;
        if(actor.id==='user-admin'){if(b.expectedRevision!==null)fail('account_revision_conflict',409);user=configured();}
        else{const stored=find(s,actor.id);if(revision(b.expectedRevision)!==(stored.revision??1))fail('account_revision_conflict',409);stored.revision=(stored.revision??1)+1;user=accountUser(stored);}
        revoked(s,actor.id);return {user,auditEvent:event(s,actor,user,'本人撤销全部会话',{self:true}),targetSessionsRevoked:true};
      });return response(s,r,saved);
    });return result;
  }));
  server.post('/api/session/password',wrap(async(r,reply)=>{
    const b=object(r.body,['requestId','expectedRevision','currentPassword','newPassword']),rid=requestId(b.requestId);
    if(typeof b.currentPassword!=='string'||b.currentPassword.length>128)fail('invalid_current_password');const newHash=hashPassword(password(b.newPassword));
    const result=await store.accountTransaction(s=>{
      const actor=currentAccountActor(s,r,auth);if(actor.id==='user-admin')fail('configuration_managed',403);
      const saved=remembered(s,rid,actor,b,actor.id,()=>{
        const user=find(s,actor.id);if(revision(b.expectedRevision)!==(user.revision??1))fail('account_revision_conflict',409);
        if(!user.passwordHash||!checkPassword(b.currentPassword as string,user.passwordHash))fail('invalid_current_password',400);
        user.passwordHash=newHash;user.revision=(user.revision??1)+1;revoked(s,user.id);const dto=accountUser(user);
        return {user:dto,auditEvent:event(s,actor,dto,'本人修改密码',{passwordChanged:true}),targetSessionsRevoked:true};
      });return response(s,r,saved);
    });return result;
  }));
}
