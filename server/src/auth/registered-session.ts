import {createHash,createHmac} from 'node:crypto';
import type {FastifyRequest} from 'fastify';
import type {AuthConfig,SessionUser} from './session.ts';
import {readSessionCookie,getAdminUser} from './session.ts';
import {sessionActor,type AccountState,type AccountStore} from '../ledger/accounts.ts';
import {fail} from '../ledger/workflow.ts';

const requestSessions=new WeakMap<object,{user:SessionUser;hash:string|null}>();
export const bootstrapSessionBinding=(auth:AuthConfig)=>createHmac('sha256',auth.sessionSecret).update(JSON.stringify({email:auth.adminEmail,password:auth.adminPassword})).digest('hex');
export const sessionHash=(id:string)=>createHash('sha256').update(id).digest('hex');
export function cacheRequestSession(request:object,user:SessionUser,hash:string|null){requestSessions.set(request,{user,hash});}
export function cachedRequestSession(request:object){return requestSessions.get(request);}
export async function registeredSession(cookie:string|undefined,auth:AuthConfig,store:AccountStore){
  const payload=readSessionCookie(cookie,auth.sessionSecret);
  if(payload?.v!==2||typeof payload.sid!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(payload.sid))return null;
  const hash=sessionHash(payload.sid),stored=await store.readAuthSession(hash);
  if(!stored)return null;
  if(stored.session.actorId==='user-admin'&&payload.binding!==bootstrapSessionBinding(auth))return null;
  const user=sessionActor(stored.session,stored.user,auth);
  return user?{user,hash}:null;
}
export function currentAccountActor(state:Pick<AccountState,'users'|'sessions'>,request:FastifyRequest,auth:AuthConfig){
  if(auth.mode==='local-bypass')return getAdminUser(auth);
  const cached=requestSessions.get(request),session=state.sessions.find(s=>s.hash===cached?.hash);
  const user=session&&sessionActor(session,state.users.find(u=>u.id===session.actorId)??null,auth);
  if(!user)fail('unauthenticated',401);
  return user;
}
