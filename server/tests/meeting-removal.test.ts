import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
async function setup(){const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store}),project=(await store.listProjects())[0];const r=await server.inject({method:'POST',url:'/api/meetings',payload:{requestId:randomUUID(),projectId:project.id,title:'独立删除恢复测试',date:'2026-11-04',attendees:'测试人员',summary:'独立验收记录',conclusions:[],todoItems:['核对删除恢复'],taskDueDate:'2026-11-20',riskItems:[]}});assert.equal(r.statusCode,200);return {store,server,meeting:r.json().meeting,project};}

test('pending meeting moves to recycle bin, restores unchanged, and late delete retries cannot delete it again',async()=>{
 const f=await setup();try{const body={requestId:randomUUID(),expectedRevision:f.meeting.revision},url=`/api/meetings/${f.meeting.id}/delete`;
 const d=await f.server.inject({method:'POST',url,payload:body});assert.equal(d.statusCode,200,d.body);assert(d.json().meeting.deletedAt);
 assert(!(await f.server.inject('/api/meetings')).json().meetings.some((m:any)=>m.id===f.meeting.id));assert((await f.server.inject('/api/meetings?deleted=true')).json().meetings.some((m:any)=>m.id===f.meeting.id));assert(!(await f.server.inject(`/api/projects/${f.project.id}`)).json().meetings.some((m:any)=>m.id===f.meeting.id));
 assert.equal((await f.server.inject({method:'POST',url:`/api/meetings/${f.meeting.id}/confirm`})).statusCode,404);
 const restored=await f.server.inject({method:'POST',url:`/api/meetings/${f.meeting.id}/restore`,payload:{requestId:randomUUID(),expectedRevision:d.json().meeting.revision}});assert.equal(restored.statusCode,200,restored.body);assert.equal(restored.json().meeting.deletedAt,undefined);assert.equal(restored.json().meeting.summary,f.meeting.summary);
 const replay=await f.server.inject({method:'POST',url,payload:body});assert.equal(replay.statusCode,200);assert((await f.server.inject('/api/meetings')).json().meetings.some((m:any)=>m.id===f.meeting.id));
 const history=(await f.store.listAuditEvents()).filter(a=>a.source===`会议纪要:${f.meeting.id}`);assert.equal(history.filter(a=>a.action==='删除会议纪要').length,1);assert.equal(history.filter(a=>a.action==='恢复会议纪要').length,1);
 }finally{await f.server.close();}
});
test('archived meeting deletion and restoration preserve generated tasks and materials; stale revisions cannot overwrite confirmation',async()=>{
 const f=await setup();try{const a=await f.server.inject({method:'POST',url:`/api/meetings/${f.meeting.id}/confirm`});assert.equal(a.statusCode,200,a.body);const archived=a.json().meeting,tasks=await f.store.listTasks(),materials=await f.store.listMaterials();
 const stale=await f.server.inject({method:'POST',url:`/api/meetings/${f.meeting.id}/delete`,payload:{requestId:randomUUID(),expectedRevision:f.meeting.revision}});assert.equal(stale.statusCode,409);
 const d=await f.server.inject({method:'POST',url:`/api/meetings/${f.meeting.id}/delete`,payload:{requestId:randomUUID(),expectedRevision:archived.revision}});assert.equal(d.statusCode,200,d.body);const r=await f.server.inject({method:'POST',url:`/api/meetings/${f.meeting.id}/restore`,payload:{requestId:randomUUID(),expectedRevision:d.json().meeting.revision}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().meeting.status,'已归档');assert.deepEqual(await f.store.listTasks(),tasks);assert.deepEqual(await f.store.listMaterials(),materials);
 }finally{await f.server.close();}
});
test('meeting delete and restore enforce permissions and validate the revision and operation identity',async()=>{
 const store=createMemoryLedgerStore(),secret='meeting-removal-test-secret',server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret}});
 try{const viewer=await registeredCookie(server,{id:'meeting-removal-viewer',name:'测试只读',email:'meeting-removal@example.test',role:'viewer'},secret);for(const action of ['delete','restore'])assert.equal((await server.inject({method:'POST',url:'/api/meetings/meeting-demo-robotics-20260608/'+action,headers:{cookie:viewer},payload:{requestId:randomUUID(),expectedRevision:1}})).statusCode,403);
 }finally{await server.close();}
});
