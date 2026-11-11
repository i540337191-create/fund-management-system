import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {transitionNotices} from '../src/notifications/transitions.ts';
import {stageNotices} from '../src/notifications/outbox.ts';
const a={id:'sender-a',name:'经办A',email:'a@example.invalid',role:'investment_manager' as const},b={id:'receiver-b',name:'审核B',email:'b@example.invalid',role:'investment_manager' as const};
async function fixture(t:import('node:test').TestContext){
 const root=await mkdtemp(join(tmpdir(),'business-notices-')),store=createMemoryLedgerStore(),secret='business-notices-fixture',server=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'password',sessionSecret:secret}});
 t.after(async()=>{await server.close();await rm(root,{recursive:true,force:true});});
 const admin=await registeredCookie(server,{id:'user-admin',name:'管理员',email:'admin@example.invalid',role:'admin'},secret),ca=await registeredCookie(server,a,secret),cb=await registeredCookie(server,b,secret);
 await store.accessTransaction(s=>{s.data.funds['fundapp-growth-i']={visibility:'members',memberIds:[a.id,b.id],revision:1};});
 const req=async(method:any,url:string,payload?:any,cookie=admin)=>{const r=await server.inject({method,url,payload,headers:{cookie}});assert.ok(r.statusCode<300,r.body);return r.json();};
 const p=(await req('POST','/api/projects',{requestId:randomUUID(),name:'隔离通知项目',shortName:'通知',industry:'合成',fundId:'fundapp-growth-i',manager:a.name,collaborators:'',sourceChannel:'',description:''})).project;
 await req('PUT','/api/projects/'+p.id+'/owner',{ownerId:a.id});
 const upload=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),projectId:p.id,name:'original.pdf',type:'法务资料'}),headers:{cookie:admin,'content-type':'application/octet-stream'},payload:Buffer.from('%PDF-1.7\nisolated evidence')});assert.equal(upload.statusCode,201,upload.body);
 const input={requestId:randomUUID(),meetingType:'立项会',reviewerIds:[b.id],materialIds:[upload.json().material.id],dueDate:'2027-12-01',note:'经办A提交给审核B'};
 const view=(cookie:string)=>req('GET','/api/agent-workspace',undefined,cookie),unread=(s:any)=>s.notifications.filter((n:any)=>!n.read);
 return {server,store,p,req,admin,ca,cb,input,view,unread,uploaded:upload.json()};
}
test('approval submission immediately adds one unread for the assignee, retry deduplicates, return reaches submitter',async t=>{
 const f=await fixture(t),state=await f.view(f.ca);
 await f.req('POST','/api/agent-workspace/actions',{requestId:randomUUID(),expectedRevision:state.revision,action:'save_task',data:{title:'原有一条未读',ownerId:b.id}},f.ca);
 assert.equal(f.unread(await f.view(f.cb)).length,1);
 const posted=await f.req('POST','/api/projects/'+f.p.id+'/approvals',f.input,f.ca),assigned=await f.view(f.cb);
 assert.equal(f.unread(assigned).length,2);assert.ok(f.unread(assigned).some((n:any)=>n.text.includes(a.name)&&n.href.includes('roundId='+posted.round.id)));
 await f.req('POST','/api/projects/'+f.p.id+'/approvals',f.input,f.ca);assert.equal(f.unread(await f.view(f.cb)).length,2);
 await f.req('POST','/api/projects/'+f.p.id+'/approvals/'+posted.round.id+'/decisions',{requestId:randomUUID(),expectedRevision:posted.round.revision,decision:'return',opinion:'补齐原件'},f.cb);
 const sender=f.unread(await f.view(f.ca));assert.equal(sender.length,1);assert.match(sender[0].title,/已退回/);assert.match(sender[0].text,/审核B/);assert.equal(f.unread(await f.view(f.cb)).length,1);
});
test('all three meeting rounds notify designated reviewer and approval results notify submitter without date triggers',async t=>{
 const f=await fixture(t);
 for(const meetingType of ['立项会','总办会','投委会']){
  const posted=await f.req('POST','/api/projects/'+f.p.id+'/approvals',{...f.input,requestId:randomUUID(),meetingType},f.ca);
  const pending=f.unread(await f.view(f.cb));assert.equal(pending.length,1);assert.ok(pending[0].title.includes(meetingType));
  await f.req('POST','/api/projects/'+f.p.id+'/approvals/'+posted.round.id+'/decisions',{requestId:randomUUID(),expectedRevision:posted.round.revision,decision:'approve',opinion:'原件核验通过'},f.cb);
  assert.equal(f.unread(await f.view(f.cb)).length,0);
 }
 assert.equal(f.unread(await f.view(f.ca)).length,3);
});
test('live SSE sends a change to receiving account before polling; read counts synchronize and repeat read is idempotent',async t=>{
 const f=await fixture(t),base=await f.server.listen({host:'127.0.0.1',port:0}),controller=new AbortController();
 t.after(()=>controller.abort());
 const response=await fetch(base+'/api/notifications/stream',{headers:{cookie:f.cb},signal:controller.signal});assert.equal(response.status,200);const reader=response.body!.getReader();let buffer='';
 const event=async(name:string)=>{const until=Date.now()+2500;while(!buffer.includes('event: '+name)){let timer:ReturnType<typeof setTimeout>|undefined;try{const next=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('SSE event did not arrive before poll interval')),Math.max(1,until-Date.now()));})]);assert.equal(next.done,false);buffer+=new TextDecoder().decode(next.value);}finally{if(timer)clearTimeout(timer);}}buffer=buffer.slice(buffer.indexOf('event: '+name)+('event: '+name).length);};
 await event('ready');await f.req('POST','/api/projects/'+f.p.id+'/approvals',f.input,f.ca);await event('changed');
 let v=await f.view(f.cb);assert.equal(f.unread(v).length,1);const id=f.unread(v)[0].id;
 await f.req('POST','/api/agent-workspace/actions',{requestId:randomUUID(),expectedRevision:v.revision,action:'read_notice',data:{id}},f.cb);await event('changed');v=await f.view(f.cb);assert.equal(f.unread(v).length,0);
 await f.req('POST','/api/agent-workspace/actions',{requestId:randomUUID(),expectedRevision:v.revision,action:'read_notice',data:{id}},f.cb);assert.equal(f.unread(await f.view(f.cb)).length,0);controller.abort();
});
test('owner transfer closes obsolete action and produces exactly one new recipient event; pending multi-reviewer votes do not re-notify remaining reviewers',()=>{
 const actor={id:'a',name:'A'},flow={key:'f',title:'审批',state:'pending',token:'v1',owners:['a'],href:'/projects/p',assignees:['b','c']};
 const events=transitionNotices({flows:[flow],assignments:[]},{flows:[{...flow,assignees:['c']}],assignments:[]},actor);assert.deepEqual(events.map(e=>[e.kind,e.recipientId]),[['settled','b']]);
 const t1={key:'task:t',id:'t',title:'任务',ownerId:'b',status:'open',href:'/tasks'},transfer=transitionNotices({flows:[],assignments:[t1]},{flows:[],assignments:[{...t1,ownerId:'c'}]},actor);
 assert.deepEqual(transfer.map(e=>[e.kind,e.recipientId]),[['settled','b'],['assigned','c']]);
});
test('failed business transaction rolls back staged delivery events',async()=>{
 const store=createMemoryLedgerStore(),p=(await store.listProjects())[0];await assert.rejects(store.workflowTransaction(p.id,async s=>{stageNotices(s,[{sourceKey:'f',recipientId:'b',kind:'assigned',title:'待审',text:'x',tone:'red',href:'/tasks',actorId:'a'}]);throw Error('rollback');}));assert.deepEqual(await store.readPendingBusinessNotices(),[]);
});
test('fund and LP submit to a selected reviewer, reject another reviewer, and deliver results',async t=>{
 const f=await fixture(t),base='/api/funds/fundapp-growth-i',proof={materialId:f.uploaded.material.id,versionId:f.uploaded.version.id,name:'隔离依据',sha256:f.uploaded.version.sha256,sizeBytes:f.uploaded.version.sizeBytes};
 await f.store.lifecycleTransaction('fundapp-growth-i',s=>{s.data.cases.push({id:'fixture-case',kind:'disclosure',title:'隔离披露',period:'2026',ownerId:a.id,dueDate:'2027-12-01',status:'draft',round:1,requirements:[{id:'doc',name:'报告',required:true,proof}],report:'隔离报告',feedback:[],submissions:[],changes:[],distributions:[]} as any);});
 let v=await f.req('GET',base+'/lifecycle',undefined,f.ca);
 const body={requestId:randomUUID(),expectedRevision:v.revision,action:'submitReview',caseId:'fixture-case',reviewerId:b.id};
 await f.req('POST',base+'/lifecycle/actions',body,f.ca);assert.ok(f.unread(await f.view(f.cb)).some((n:any)=>n.href.includes('lifecycleId=fixture-case')));
 const denied=await f.server.inject({method:'POST',url:base+'/lifecycle/actions',headers:{cookie:f.ca},payload:{requestId:randomUUID(),expectedRevision:body.expectedRevision+1,action:'review',caseId:'fixture-case',decision:'approve',note:'wrong reviewer'}});assert.equal(denied.statusCode,403,denied.body);
 v=await f.req('GET',base+'/lifecycle',undefined,f.cb);await f.req('POST',base+'/lifecycle/actions',{requestId:randomUUID(),expectedRevision:v.revision,action:'review',caseId:'fixture-case',decision:'return',note:'补充报告'},f.cb);assert.ok(f.unread(await f.view(f.ca)).some((n:any)=>n.title.includes('已退回')));
 const lp=(await f.req('POST',base+'/investors',{requestId:randomUUID(),name:'隔离LP',type:'机构'},f.ca)).investor,member=base+'/investors/'+lp.id;
 let r=await f.req('POST',member+'/fundraising/actions',{requestId:randomUUID(),expectedRevision:1,action:'requirement',name:'隔离材料',required:true,ownerId:a.id,dueDate:'2027-12-01'},f.ca);
 const itemId=r.requirements[0].id,upload=await f.server.inject({method:'POST',url:member+'/materials/upload?'+new URLSearchParams({requestId:randomUUID(),expectedRevision:String(r.revision),name:'proof.txt',type:'LP材料'}),headers:{cookie:f.admin,'content-type':'application/octet-stream'},payload:Buffer.from('isolated LP proof')});assert.equal(upload.statusCode,200,upload.body);
 r=await f.req('POST',member+'/fundraising/actions',{requestId:randomUUID(),expectedRevision:upload.json().investor.revision,action:'submit',itemId,proof:{materialId:upload.json().material.id,versionId:upload.json().version.id},reviewerId:b.id},f.ca);
 assert.ok(f.unread(await f.view(f.cb)).some((n:any)=>n.href.includes('lp='+lp.id)));
 await f.req('POST',member+'/fundraising/actions',{requestId:randomUUID(),expectedRevision:r.revision,action:'review',decision:'approve',note:'核对原件'},f.cb);assert.ok(f.unread(await f.view(f.ca)).some((n:any)=>n.title.includes('LP资料审核')&&n.title.includes('已通过')));
});
test('delivery failure keeps the source queue; retry after restart delivers once; recovery does not duplicate old pending approvals',async()=>{
 const {default:Fastify}=await import('fastify'),{AgentRepository}=await import('../src/agent/repository.ts'),{registerBusinessNotifications}=await import('../src/notifications/service.ts'),{recoverApprovalNotices}=await import('../src/notifications/transitions.ts');
 const store=createMemoryLedgerStore(),repo=new AgentRepository(),p=(await store.listProjects())[0];
 await store.workflowTransaction(p.id,s=>{stageNotices(s,[{sourceKey:'test-approval',token:'one',recipientId:b.id,kind:'assigned',title:'待审批',text:'真实队列测试',tone:'red',href:'/tasks',actorId:a.id}]);});
 const first=Fastify(),broken=Object.create(repo);broken.transaction=async()=>{throw Error('temporary write failure');};const service=registerBusinessNotifications(first,store,broken);await assert.rejects(service.deliver());assert.equal((await store.readPendingBusinessNotices()).length,1);await first.close();
 const second=Fastify(),restored=registerBusinessNotifications(second,store,repo);await restored.deliver();await restored.deliver();assert.equal((await store.readPendingBusinessNotices()).length,0);assert.equal(await repo.transaction(s=>s.notifications.filter(n=>n.ownerId===b.id).length),1);await second.close();
 const state={fund:{id:'f',name:'基金'},data:{cases:[{id:'pending',title:'待审',status:'pending',reviewerId:b.id,reviewSubmissionId:'s1',ownerId:a.id},{id:'done',title:'完成',status:'approved',reviewerId:b.id}],clauses:[]}};
 const recovered=recoverApprovalNotices(state,'fund',new Set());assert.equal(recovered.length,1);assert.equal(recoverApprovalNotices(state,'fund',new Set([[b.id,'fund-case:pending','s1'].join('|')])).length,0);
});
test('recovery covers diligence, terms, agreements, financials, post reports and exit approvals without duplicating their generated tasks',async()=>{
 const {recoverApprovalNotices}=await import('../src/notifications/transitions.ts'),reviewer={id:b.id},owner={id:a.id},state={project:{id:'p',name:'隔离项目'},tasks:[],rounds:[],diligence:{ownerId:a.id,reviewers:[reviewer],items:[{id:'i',title:'材料',taskId:'t',owner,status:'pending',submissions:[{id:'v',submittedBy:owner,decisions:[]}]}],reports:[{id:'r',version:1,status:'pending',savedBy:owner,decisions:[],reviewTaskIds:[]}],supplements:[]},deals:[{id:'d',title:'投资',ownerId:a.id,reviewers:[reviewer],terms:[{id:'terms',version:1,status:'pending',savedBy:owner,decisions:[]}],agreements:[{id:'agreement',title:'协议',version:1,reviewerId:b.id,generatedBy:owner}]}],postInvestment:{financials:[{id:'f',version:1,status:'pending',reviewer,owner}],reports:[{id:'pr',version:1,status:'pending',reviewer,owner}],exitPreparations:[{id:'exit',version:1,status:'pending',reviewer,owner}]}};
 const notices=recoverApprovalNotices(state,'project',new Set());assert.equal(notices.length,8);assert.equal(notices.filter(n=>n.recipientId===b.id).length,7);assert.ok(notices.every(n=>n.href.includes('/projects/p?')));assert.equal(new Set(notices.map(n=>n.sourceKey)).size,7);
});

test('reading unchanged completed tasks never stages another settled event',()=>{
 const t={key:'lp:t',id:'t',title:'已完成资料',ownerId:'b',status:'已完成',href:'/tasks'},view={flows:[],assignments:[t]};
 assert.deepEqual(transitionNotices(view,structuredClone(view),{id:'a',name:'A'}),[]);
});
