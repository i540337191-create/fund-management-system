import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {reconcileSharedApprovals} from '../src/notifications/shared-approvals.ts';
import {AgentRepository} from '../src/agent/repository.ts';
import {resolveAuthConfig} from '../src/auth/session.ts';
import {recoverApprovalNotices} from '../src/notifications/transitions.ts';
async function fixture(t:import('node:test').TestContext){
 const root=await mkdtemp(join(tmpdir(),'all-approvals-')),store=createMemoryLedgerStore(),secret='all-approval-test-secret',server=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'password',sessionSecret:secret}});
 t.after(async()=>{await server.close();await rm(root,{recursive:true,force:true});});
 const users=[{id:'user-admin',name:'隔离管理员',email:'admin@example.invalid',role:'admin'},{id:'submitter',name:'经办人',email:'a@example.invalid',role:'investment_manager'},{id:'reviewer',name:'审核人',email:'b@example.invalid',role:'investment_manager'},{id:'post',name:'投后经办',email:'post@example.invalid',role:'post_investment'},{id:'finance',name:'财务',email:'finance@example.invalid',role:'finance'},{id:'viewer',name:'只读人',email:'viewer@example.invalid',role:'viewer'}] as const;
 const cookies=Object.fromEntries(await Promise.all(users.map(async u=>[u.id,await registeredCookie(server,u,secret)])));
 const req=async(user:string,method:any,url:string,payload?:any)=>{const r=await server.inject({method,url,payload,headers:{cookie:cookies[user]}});assert.ok(r.statusCode<300,r.body);return r.json();};
 const project=(await store.listProjects())[0],fund=(await store.listFunds())[0];await store.accessTransaction(s=>{s.data.funds[fund.id]={visibility:'members',memberIds:users.map(u=>u.id),revision:1};});await store.workflowTransaction(project.id,s=>{s.project.ownerId='submitter';});
 const view=(user:string)=>req(user,'GET','/api/agent-workspace'),notices=async(user:string,key:string)=>(await view(user)).notifications.filter((n:any)=>n.businessKey===key);
 const act=async(user:string,action:string,data:any)=>req(user,'POST','/api/agent-workspace/actions',{requestId:randomUUID(),expectedRevision:(await view(user)).revision,action,data});
 return {store,server,req,view,notices,act,project,fund};
}
test('report review reaches the permitted queue, approval reaches its creator, and viewer receives neither',async t=>{
 const f=await fixture(t),report=(await f.req('submitter','POST','/api/reports',{id:'isolated-report',name:'隔离报告',target:f.project.name,projectId:f.project.id,type:'投后报告',status:'草稿',owner:'forged',updatedAt:new Date().toISOString(),sections:[{title:'进展',text:'仅隔离测试'}]})).report,key='report-center:'+report.id;
 assert.equal(report.createdById,'submitter');let pending=await f.notices('reviewer',key);assert.equal(pending.filter((n:any)=>!n.read).length,1);assert.match(pending[0].text,/经办人/);assert.ok(pending[0].href.includes('reportId='+report.id));assert.equal((await f.notices('viewer',key)).length,0);
 await f.req('reviewer','POST','/api/reports/'+report.id+'/approve',{expectedUpdatedAt:report.updatedAt});pending=await f.notices('reviewer',key);assert.ok(pending.every((n:any)=>n.read));const result=(await f.notices('submitter',key)).filter((n:any)=>n.businessKind==='result');assert.equal(result.length,1);assert.match(result[0].text,/审核人/);
});
test('meeting and actual receipt confirmations use their own permitted queues and notify the original creator',async t=>{
 const f=await fixture(t),meeting=(await f.req('post','POST','/api/meetings',{requestId:randomUUID(),projectId:f.project.id,title:'隔离纪要',date:'2026-11-01',attendees:'经办人',summary:'测试纪要',conclusions:['核对原件'],todoItems:[],riskItems:[]})).meeting,key='meeting-confirm:'+meeting.id;
 assert.equal(meeting.createdById,'post');assert.equal((await f.notices('post',key)).filter((n:any)=>!n.read).length,1);assert.equal((await f.notices('reviewer',key)).length,0);
 await f.req('user-admin','POST','/api/meetings/'+meeting.id+'/confirm',{expectedRevision:meeting.revision});assert.equal((await f.notices('post',key)).filter((n:any)=>n.businessKind==='result').length,1);
 const record=(await f.req('finance','POST','/api/capital-records',{id:'isolated-receipt',fundId:f.fund.id,projectId:f.project.id,company:f.project.name,fund:f.fund.name,received:'10.00',date:'2026-11-01',rule:'隔离依据',receivable:'20.00',dueDate:'2026-12-01',status:'部分收'})).capitalRecord,ck='capital-confirm:'+record.id;
 assert.equal(record.createdById,'finance');assert.equal((await f.notices('finance',ck)).filter((n:any)=>!n.read).length,1);assert.equal((await f.notices('reviewer',ck)).length,0);
 await f.req('user-admin','POST','/api/capital-records/'+record.id+'/confirm',{});assert.equal((await f.notices('finance',ck)).filter((n:any)=>n.businessKind==='result').length,1);
});
test('skill and memory sharing notify administrators, resolve old actions, and return publication or rejection to the author',async t=>{
 const f=await fixture(t),saved=await f.act('submitter','save_skill',{title:'隔离共享能力',description:'合成通用方法',instructions:'只核对明确授权的记录',tools:['knowledge'],pluginIds:[],enabled:false}),row=saved.skills.find((r:any)=>r.id===saved.result.id);
 const submitted=await f.act('submitter','submit_skill',{id:row.id,version:row.version,reviewedForSharing:true}),shared=submitted.skills.find((r:any)=>r.submittedFrom===row.id),key='skills:'+shared.id;
 assert.equal((await f.notices('user-admin',key)).filter((n:any)=>!n.read).length,1);assert.equal((await f.notices('reviewer',key)).length,0);
 await f.act('user-admin','reject_skill_submission',{id:shared.id,version:shared.version,note:'补充适用范围'});assert.ok((await f.notices('user-admin',key)).every((n:any)=>n.read));assert.equal((await f.notices('submitter',key)).filter((n:any)=>n.businessKind==='result').length,1);
 const memory=await f.act('submitter','save_memory',{title:'隔离共享记忆',text:'明确的业务习惯',scope:'personal',enabled:false}),id=memory.result.id;await f.act('submitter','submit_memory',{id});assert.equal((await f.notices('user-admin','memory:'+id)).filter((n:any)=>!n.read).length,1);await f.act('user-admin','publish_memory',{id});assert.equal((await f.notices('submitter','memory:'+id)).filter((n:any)=>n.businessKind==='result').length,1);
});
test('return basis, independent samples and input completeness each recover a precise review route',()=>{
 const records=['returnBases','returnSamples','cashflowReviews'],state:any={project:{id:'p',name:'项目'},postInvestment:Object.fromEntries(records.map((key,i)=>[key,[{id:'record-'+i,version:2,status:'pending',reviewer:{id:'finance'},author:{id:'a'},scope:{dealId:'d',fundId:'f'},contentHash:'a'.repeat(64),taskIds:[]}]]))};
 const events=recoverApprovalNotices(state,'project',new Set());assert.equal(events.length,3);for(const event of events){assert.equal(event.recipientId,'finance');const url=new URL(event.href,'http://localhost');assert.equal(url.hash,'#returns');assert.equal(url.searchParams.get('returnFundId'),'f');assert.equal(url.searchParams.get('returnHash'),'a'.repeat(64));assert.equal(url.searchParams.get('returnVersion'),'2');}
});
test('shared draft versions cannot repeatedly notify; lost delivery retries from persisted source without duplicates',async()=>{
 const store=createMemoryLedgerStore(),repo=new AgentRepository(),auth=resolveAuthConfig({mode:'local-bypass'});
 await repo.transaction(s=>{for(const [id,baseId,status,version]of [['x',undefined,'published',1],['x:draft','x','submitted',2]] as const)s.skills.push({id,baseId,title:'隔离共享',description:'合成',instructions:'合成',category:'自定义',tools:['knowledge'],pluginIds:[],enabled:false,scope:'organization',status,ownerId:'author',version});});
 const run=()=>reconcileSharedApprovals(store,repo,auth);await run();const count=()=>repo.transaction(s=>s.notifications.filter(n=>n.businessKey==='skills:x').length);assert.equal(await count(),1);await run();assert.equal(await count(),1);
 await repo.transaction(s=>{s.skills.find(r=>r.id==='x:draft')!.status='published';});await run();assert.equal(await repo.transaction(s=>s.notifications.filter(n=>n.ownerId==='author'&&n.businessKey==='skills:x').length),1);
});
test('shared approval queue excludes accounts outside the object scope and retries a failed source read without duplicating notifications',async t=>{
 const f=await fixture(t);await f.store.accessTransaction(s=>{s.data.funds[f.fund.id].memberIds=['submitter'];});
 const report=(await f.req('submitter','POST','/api/reports',{id:'private-report',name:'隔离受限报告',target:f.project.name,projectId:f.project.id,type:'投后报告',status:'草稿',owner:'经办人',updatedAt:new Date().toISOString(),sections:[{title:'来源',text:'隔离'}]})).report;
 assert.equal((await f.notices('reviewer','report-center:'+report.id)).length,0);assert.equal((await f.notices('submitter','report-center:'+report.id)).filter((n:any)=>!n.read).length,1);
 const repo=new AgentRepository(),auth=resolveAuthConfig({mode:'local-bypass'});let fail=true;const broken=new Proxy(f.store,{get(target,key){if(key==='listReports')return()=>{if(fail){fail=false;throw Error('temporary read failure');}return target.listReports();};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 await assert.rejects(reconcileSharedApprovals(broken,repo,auth));assert.equal(await repo.transaction(s=>s.approvalSnapshots),undefined);await reconcileSharedApprovals(broken,repo,auth);const count=await repo.transaction(s=>s.notifications.length);await reconcileSharedApprovals(broken,repo,auth);assert.equal(await repo.transaction(s=>s.notifications.length),count);
});
test('deleted reports leave the actionable queue without deleting history or emitting another pending notice',async()=>{
 const store=createMemoryLedgerStore(),repo=new AgentRepository(),auth=resolveAuthConfig({mode:'local-bypass'}),project=(await store.listProjects())[0];
 await store.createReport({id:'deleted-report',name:'可恢复报告',target:project.name,projectId:project.id,fundId:project.fundId,type:'投后报告',status:'草稿',owner:'管理员',createdById:'user-admin',updatedAt:new Date().toISOString(),sections:[{title:'依据',text:'隔离'}]});
 const run=()=>reconcileSharedApprovals(store,repo,auth);await run();assert.equal(await repo.transaction(s=>s.notifications.filter(n=>n.businessKey==='report-center:deleted-report'&&!n.read).length),1);
 await store.recordManagementTransaction(s=>{s.data.entries.push({id:'deleted-report',kind:'report',title:'可恢复报告',deletedAt:new Date().toISOString(),deletedBy:'user-admin',revision:1});});await run();await run();assert.equal(await repo.transaction(s=>s.notifications.filter(n=>n.businessKey==='report-center:deleted-report'&&!n.read).length),0);assert.ok((await store.listReports()).some(r=>r.id==='deleted-report'));
});
test('historical recovery cannot hold the HTTP listener closed while source reads are slow',async()=>{
 const {default:Fastify}=await import('fastify'),{registerBusinessNotifications}=await import('../src/notifications/service.ts'),store=createMemoryLedgerStore(),repo=new AgentRepository(),server=Fastify();let release!:()=>void;const slow=new Promise<void>(resolve=>{release=resolve;}),wrapped=new Proxy(store,{get(target,key){if(key==='listProjects')return async()=>{await slow;return target.listProjects();};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 registerBusinessNotifications(server,wrapped,repo);server.get('/health',async()=>({ok:true}));let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([server.ready(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('HTTP startup blocked on approval recovery')),1000);})]);assert.equal((await server.inject('/health')).statusCode,200);}finally{if(timer)clearTimeout(timer);release();await server.close();}
});
