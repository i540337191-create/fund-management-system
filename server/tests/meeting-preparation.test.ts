import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const draft={title:'样例会议',date:'',attendees:'样例参会人',summary:'讨论材料补齐，结论待核对。',conclusions:['补齐材料'],todoItems:['整理资料'],riskItems:[],taskDueDate:''};
const ai={env:{QWEN_API_KEY:'fixture-only',QWEN_BASE_URL:'https://example.invalid/v1',QWEN_MODEL:'fixture'},fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(draft)}}]})})};
test('preparation returns editable fields without saving; only an explicit save creates one pending meeting',async()=>{
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,ai}),projectId=(await store.listProjects())[0].id,before=(await store.listMeetings()).length;
 try{
  const r=await server.inject({method:'POST',url:'/api/meetings/prepare',payload:{projectId,text:'独立测试原文：样例参会人讨论材料补齐。'}});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().draft,draft);assert.equal((await store.listMeetings()).length,before);
  const body={...r.json().draft,requestId:randomUUID(),projectId,title:'人工修订主题',date:'2026-11-04',taskDueDate:'2026-11-09'};
  const saved=await server.inject({method:'POST',url:'/api/meetings',payload:body});assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().meeting.title,'人工修订主题');assert.equal(saved.json().meeting.status,'待确认');assert.equal((await store.listMeetings()).length,before+1);
  const replay=await server.inject({method:'POST',url:'/api/meetings',payload:body});assert.equal(replay.json().meeting.id,saved.json().meeting.id);
  for(const payload of [{projectId,text:''},{projectId,text:'a',materialId:'b'},{projectId:'missing',text:'原文'}]){const bad=await server.inject({method:'POST',url:'/api/meetings/prepare',payload});assert.ok(bad.statusCode>=400,bad.body);}
 }finally{await server.close();}
});
test('selected original is read through the existing extraction path; wrong project cannot reuse the file',async()=>{
 const root=await mkdtemp(join(tmpdir(),'meeting-source-')),state=createSeedLedgerState();state.projects.push({...state.projects[0],id:'other-project',name:'另一个样例项目'});const store=createMemoryLedgerStore(state);let source='';const server=createTestServer({ledgerStore:store,materialStorageRoot:root,ai:{...ai,fetchImpl:async(_u,init)=>{source=init!.body!;return ai.fetchImpl();}}});
 try{const projects=await store.listProjects(),projectId=projects[0].id;const u=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),projectId,type:'会议录音',name:'会议转写样例.txt'}),headers:{'content-type':'application/octet-stream'},payload:Buffer.from('测试转写内容：下周补齐样例材料。')});assert.equal(u.statusCode,201,u.body);
  const materialId=u.json().material.id,r=await server.inject({method:'POST',url:'/api/meetings/prepare',payload:{projectId,materialId}});assert.equal(r.statusCode,200,r.body);assert.match(source,/测试转写内容/);assert.match(r.json().sourceText,/测试转写内容/);
  source='';const original=await server.inject({method:'POST',url:'/api/meetings/source',payload:{projectId,materialId}});assert.equal(original.statusCode,200,original.body);assert.match(original.json().sourceText,/测试转写内容/);assert.equal(source,'','Reading transcript must not call external AI');
  const denied=await server.inject({method:'POST',url:'/api/meetings/prepare',payload:{projectId:projects[1].id,materialId}});assert.equal(denied.statusCode,404);
  const sourceDenied=await server.inject({method:'POST',url:'/api/meetings/source',payload:{projectId:projects[1].id,materialId}});assert.equal(sourceDenied.statusCode,404);
 }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
test('provider failure and invalid structured output leave all meetings unchanged; viewer cannot call AI',async()=>{
 const store=createMemoryLedgerStore(),projectId=(await store.listProjects())[0].id,before=(await store.listMeetings()).length;let calls=0;
 const server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:'meeting-preparation-fixture'},ai:{...ai,fetchImpl:async()=>{calls++;return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'不是JSON'}}]})};}}});
 try{
  const viewer=await registeredCookie(server,{id:'meeting-preparation-viewer',name:'测试只读',email:'meeting-prepare@example.test',role:'viewer'},'meeting-preparation-fixture');
  const denied=await server.inject({method:'POST',url:'/api/meetings/prepare',headers:{cookie:viewer},payload:{projectId,text:'原文'}});assert.equal(denied.statusCode,403);assert.equal(calls,0);
  const admin=await registeredCookie(server,{id:'user-admin',name:'管理员',email:'admin',role:'admin'},'meeting-preparation-fixture');
  const bad=await server.inject({method:'POST',url:'/api/meetings/prepare',headers:{cookie:admin},payload:{projectId,text:'测试原文'}});assert.equal(bad.statusCode,502);assert.equal((await store.listMeetings()).length,before);
 }finally{await server.close();}
});

test('empty AI summary is an actionable insufficient-content response rather than a successful blank draft or generic 502',async()=>{
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,ai:{...ai,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({...draft,summary:''})}}]})})}});
 try{const before=(await store.listMeetings()).length,r=await server.inject({method:'POST',url:'/api/meetings/prepare',payload:{projectId:(await store.listProjects())[0].id,text:'重复但不完整的识别内容'}});assert.equal(r.statusCode,422,r.body);assert.equal(r.json().error,'meeting_content_insufficient');assert.equal((await store.listMeetings()).length,before);}finally{await server.close();}
});
