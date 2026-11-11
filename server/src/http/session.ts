import {randomUUID} from 'node:crypto';
import {WorkflowError} from '../ledger/workflow.ts';
import type {LedgerStore} from '../ledger/store.ts';
import {checkPassword} from '../auth/password.ts';
import {resolveRequestUser} from '../auth/authorize.ts';
import {cachedRequestSession,currentAccountActor,sessionHash,bootstrapSessionBinding} from '../auth/registered-session.ts';
import {accountUser} from '../ledger/accounts.ts';
import type {FastifyInstance} from 'fastify';
import {createRegisteredSessionCookie,getAdminUser,resolveAuthConfig,verifyPasswordLogin,type AuthConfigInput} from '../auth/session.ts';

type SessionRouteOptions={auth?:AuthConfigInput;store?:LedgerStore};
export function registerSessionRoutes(server:FastifyInstance,options:SessionRouteOptions={}){
  const auth=resolveAuthConfig(options.auth);
  server.get('/api/session/me',async request=>({user:resolveRequestUser(request,auth)}));
  server.post('/api/session/logout',async(request,reply)=>{
    try{
      if(auth.mode==='password'){
        if(!options.store)return reply.code(503).send({error:'session_unavailable'});
        await options.store.accountTransaction(s=>{currentAccountActor(s,request,auth);const hash=cachedRequestSession(request)?.hash;s.sessions=s.sessions.filter(v=>v.hash!==hash);});
      }
      return {ok:true};
    }catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});request.log.error({code:'session_logout_failed'});return reply.code(503).send({error:'session_unavailable'});}
  });
  server.post('/api/session/login',async(request,reply)=>{
    if(auth.mode==='local-bypass')return {user:getAdminUser(auth)};
    const body=(request.body??{}) as {email?:unknown;password?:unknown};
    if(typeof body.email!=='string'||typeof body.password!=='string'||body.password.length>128)return reply.code(401).send({error:'invalid_credentials'});
    if(!options.store)return reply.code(503).send({error:'session_unavailable'});
    try{
      const configured=verifyPasswordLogin({email:body.email,password:body.password},auth);
      const record=configured?null:(await options.store.listUsers()).find(u=>u.email.toLowerCase()===String(body.email).trim().toLowerCase()&&u.email.toLowerCase()!==auth.adminEmail.toLowerCase()&&u.id!=='user-admin');
      if(!configured&&(!record||!accountUser(record).canLogin||!record.passwordHash||!checkPassword(body.password,record.passwordHash)))return reply.code(401).send({error:'invalid_credentials'});
      const sid=randomUUID(),issuedAt=Math.floor(Date.now()/1000),expiresAt=new Date((issuedAt+auth.sessionMaxAgeSeconds)*1000).toISOString();
      const user=await options.store.accountTransaction(s=>{
        const current=configured??s.users.find(u=>u.id===record!.id&&u.passwordHash===record!.passwordHash&&accountUser(u).canLogin);
        // Recheck after password verification so disable/reset cannot race a valid stale login into existence.
        if(!current)return null;
        s.sessions=s.sessions.filter(v=>Date.parse(v.expiresAt)>Date.now());
        s.sessions.push({hash:sessionHash(sid),actorId:current.id,expiresAt});
        return {id:current.id,name:current.name,email:current.email,role:current.role};
      });
      if(!user)return reply.code(401).send({error:'invalid_credentials'});
      reply.header('x-fundapp-session-context',sessionHash(sid));reply.header('Cache-Control','private, no-store');
      reply.header('Set-Cookie',createRegisteredSessionCookie(sid,auth.sessionSecret,{...(configured?{bootstrapBinding:bootstrapSessionBinding(auth)}:{}),nowSeconds:issuedAt,secure:auth.sessionCookieSecure,maxAgeSeconds:auth.sessionMaxAgeSeconds}));return {user};
    }catch{request.log.error({code:'session_login_failed'});return reply.code(503).send({error:'session_unavailable'});}
  });
}
