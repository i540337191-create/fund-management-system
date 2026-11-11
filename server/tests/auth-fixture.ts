import {randomUUID} from 'node:crypto';
import {createServer as productionServer} from '../src/index.ts';
import {createMemoryLedgerStore,type LedgerStore} from '../src/ledger/store.ts';
import {createRegisteredSessionCookie,readSessionCookie,type SessionUser,resolveAuthConfig} from '../src/auth/session.ts';
import {sessionHash,bootstrapSessionBinding} from '../src/auth/registered-session.ts';
import {hashPassword} from '../src/auth/password.ts';
const stores=new WeakMap<object,LedgerStore>();
const configs=new WeakMap<object,ReturnType<typeof resolveAuthConfig>>();
const fixtureHash=hashPassword('registered-fixture-password');
export function createTestServer(options:Parameters<typeof productionServer>[0]={}){
  const store=options.ledgerStore??createMemoryLedgerStore(),fetchImpl=options.ai?.fetchImpl;
  const ai=fetchImpl?{...options.ai,fetchImpl:async(input:string,init?:Parameters<typeof fetchImpl>[1])=>{const body=init?.body?JSON.parse(init.body):{};if(body.messages?.[0]?.content?.startsWith('FUNDAPP_BUSINESS_SCOPE'))return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'{\"scope\":\"business\"}'}}]})};return fetchImpl(input,init);}}:options.ai;
  const server=productionServer({...options,ai,ledgerStore:store});stores.set(server,store);configs.set(server,resolveAuthConfig(options.auth));return server;
}
// Business-route tests use stored actors and registered sessions; login/revocation tests exercise the public login API instead.
export async function registeredCookie(server:object,user:SessionUser,secret:string){
  const store=stores.get(server);if(!store)throw Error('Use createTestServer for registered fixture sessions');
  const cookie=createRegisteredSessionCookie(randomUUID(),secret,user.id==='user-admin'?{bootstrapBinding:bootstrapSessionBinding(configs.get(server)!)}:{}),payload=readSessionCookie(cookie,secret)!;
  await store.accountTransaction(s=>{
    if(user.id!=='user-admin'&&!s.users.some(u=>u.id===user.id))s.users.push({...user,passwordHash:fixtureHash,enabled:true,revision:1});
    s.sessions.push({hash:sessionHash(payload.sid!),actorId:user.id,expiresAt:new Date(payload.exp*1000).toISOString()});
  });return cookie;
}
