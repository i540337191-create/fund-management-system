import {reconcileSharedApprovals} from './shared-approvals.ts';
import {recoverApprovalNotices} from './transitions.ts';
import {stageNotices} from './outbox.ts';
import type {FastifyInstance} from 'fastify';
import type {LedgerStore} from '../ledger/store.ts';
import type {AgentRepository} from '../agent/repository.ts';
import {resolveRequestUser} from '../auth/authorize.ts';
import {resolveAuthConfig,type AuthConfigInput} from '../auth/session.ts';
import {accessContext} from '../auth/object-access.ts';
export function registerBusinessNotifications(server:FastifyInstance,store:LedgerStore,repo:AgentRepository,options:{auth?:AuthConfigInput}={}){
 const auth=resolveAuthConfig(options.auth),streams=new Map<string,Set<()=>void>>(),closers=new Set<()=>void>();let recovery:Promise<void>|undefined,recovered=false;let working:Promise<void>|undefined,timer:ReturnType<typeof setInterval>|undefined,closed=false;
 const unsubscribe=repo.subscribe(owners=>{for(const owner of owners)for(const send of streams.get(owner)??[])send();});
 async function deliver(){if(closed)return;if(working){await working;return deliver();}working=(async()=>{
  for(let batch=0;batch<20;batch++){
   const events=await store.readPendingBusinessNotices();if(!events.length)break;
   await repo.transaction(s=>{let changed=false;
    for(const event of events){
     if(event.kind==='settled'){for(const n of s.notifications)if(n.ownerId===event.recipientId&&!n.read&&(n.businessKey===event.sourceKey||event.taskId&&n.taskId===event.taskId)){n.read=true;changed=true;}continue;}
     if(s.notifications.some(n=>n.ownerId===event.recipientId&&(n.dedupe==='business:'+event.id||event.recovered&&n.businessKind==='assigned'&&n.businessKey===event.sourceKey&&n.businessToken===event.token)))continue;
     s.notifications.push({id:event.id,ownerId:event.recipientId,scope:'personal',title:event.title,text:event.text,tone:event.tone,read:false,createdAt:event.createdAt,href:event.href,taskId:event.taskId,dedupe:'business:'+event.id,businessKey:event.sourceKey,businessToken:event.token,businessKind:event.kind,projectId:event.projectId,fundId:event.fundId,lpSensitive:event.lpSensitive});changed=true;
    }
    if(changed)s.revision++;
   });
   await store.acknowledgeBusinessNotices(events.map(e=>e.id));
  }
  await reconcileSharedApprovals(store,repo,auth).catch(()=>server.log.error({code:'shared_approval_sync_pending'}));
 })().finally(()=>{working=undefined;});return working;}
 async function recover(){
  await deliver();const known=new Set(await repo.transaction(s=>s.notifications.filter(n=>n.businessKind==='assigned').map(n=>[n.ownerId,n.businessKey,n.businessToken??''].join('|'))));
  const removed=new Set((await store.readRecordManagement()).entries.filter(e=>e.deletedAt).map(e=>e.id));
  for(const p of await store.listProjects()){if(closed)return;if(!removed.has(p.id))await store.workflowTransaction(p.id,async s=>{stageNotices(s,recoverApprovalNotices(s,'project',known));});}
  for(const f of await store.listFunds()){if(closed)return;if(!removed.has(f.id))await store.lifecycleTransaction(f.id,async s=>{stageNotices(s,recoverApprovalNotices(s,'fund',known));});}
  if(closed)return;await store.lpTransaction(s=>{stageNotices(s,recoverApprovalNotices({...s,investors:s.investors.filter(i=>!removed.has(i.id)&&!removed.has(i.fundId))},'lp',known));});await deliver();
 }
 server.addHook('onSend',async(request,reply,payload)=>{if(['POST','PUT','PATCH','DELETE'].includes(request.method)&&reply.statusCode<400)try{await deliver();}catch{server.log.error({code:'business_notification_delivery_pending'},'Business notification queued for retry');}return payload;});
 const startRecovery=()=>{if(closed||recovered||recovery)return;recovery=recover().then(()=>{recovered=true;}).catch(()=>server.log.error({code:'business_notification_recovery_pending'})).finally(()=>{recovery=undefined;});};
 server.addHook('onReady',async()=>{timer=setInterval(()=>void deliver().then(startRecovery).catch(()=>server.log.error({code:'business_notification_retry_failed'})),5000);timer.unref();startRecovery();});
 server.get('/api/notifications/stream',async(request,reply)=>{
  const actor=resolveRequestUser(request,auth);if(!actor)return reply.code(401).send({error:'unauthenticated'});
  const validate=accessContext.getStore()?.validate;reply.hijack();const response=reply.raw;
  response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'private, no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});response.write('retry: 2000\nevent: ready\ndata: {}\n\n');
  let checking=false,again=false,ended=false;const close=()=>{if(ended)return;ended=true;closers.delete(close);clearInterval(heartbeat);listeners.delete(send);if(!listeners.size)streams.delete(actor.id);response.end();};
  const send=()=>{if(ended)return;if(checking){again=true;return;}checking=true;void(async()=>{if(validate&&!await validate()){close();return;}if(response.writableLength>65536){close();return;}response.write('event: changed\ndata: {}\n\n');})().catch(close).finally(()=>{checking=false;if(again){again=false;send();}});};
  const listeners=streams.get(actor.id)??new Set<()=>void>();streams.set(actor.id,listeners);listeners.add(send);
  const heartbeat=setInterval(()=>{if(validate)void validate().then(ok=>{if(!ok)close();else if(!ended)response.write(': heartbeat\n\n');}).catch(close);else if(!ended)response.write(': heartbeat\n\n');},10000);heartbeat.unref();closers.add(close);response.on('close',close);
 });
 server.addHook('preClose',async()=>{for(const close of closers)close();});
 server.addHook('onClose',async()=>{closed=true;if(timer)clearInterval(timer);unsubscribe();for(const listeners of streams.values())for(const send of listeners)send();streams.clear();await working?.catch(()=>{});await recovery?.catch(()=>{});});
 return {deliver};
}
