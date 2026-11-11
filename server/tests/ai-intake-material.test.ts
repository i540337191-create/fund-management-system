import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {intakeDraft} from '../src/http/ai-intake-material.ts';
test('real original -> extraction -> AI -> pending -> replay -> archive retains original without invented tasks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'intake-original-')),store=createMemoryLedgerStore();let calls=0,fail=false,seen='';
 const server=createTestServer({ledgerStore:store,materialStorageRoot:root,ai:{env:{QWEN_API_KEY:'fixture',QWEN_BASE_URL:'https://example.invalid/v1'},fetchImpl:async(_u,init)=>{calls++;seen=init!.body!;return {ok:!fail,status:fail?500:200,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'讨论补齐资料',extracted:['需补齐材料'],generatedTasks:['补齐材料']})}}]})};}}});
 try{
  const projectId=(await store.listProjects())[0].id;
  const upload=async()=>{const r=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),projectId,type:'会议纪要',name:randomUUID()+'.txt'}),headers:{'content-type':'application/octet-stream'},payload:Buffer.from('原件内容：会议讨论需补齐材料。')});assert.equal(r.statusCode,201,r.body);return r.json().material;};
  const material=await upload(),payload={materialId:material.id,inputType:'会议纪要'},before=(await store.listTasks()).length;
  const results=await Promise.all([1,2].map(()=>server.inject({method:'POST',url:'/api/ai-intake-items/from-material',payload})));
  for(const r of results)assert.equal(r.statusCode,201,r.body);assert.equal(calls,1);assert.match(seen,/原件内容/);
  const item=results[0].json().item;assert.equal(item.sourceVersionId,material.currentVersionId);assert.equal(item.status,'待确认');assert.equal((await store.listTasks()).length,before);
  const count=(await store.listMaterials()).length;
  const archive=await server.inject({method:'POST',url:`/api/ai-intake-items/${item.id}/archive`});assert.equal(archive.statusCode,201,archive.body);assert.equal(archive.json().material.id,material.id);assert.equal(archive.json().material.currentVersionId,material.currentVersionId);assert.equal((await store.listMaterials()).length,count);assert.equal((await store.listTasks()).length,before);
  const download=await server.inject({url:`/api/materials/${material.id}/versions/${material.currentVersionId}/file`});assert.equal(download.statusCode,200,download.body);assert.match(download.body,/原件内容/);
  const replay=await server.inject({method:'POST',url:'/api/ai-intake-items/from-material',payload});assert.equal(replay.json().item.status,'已归档');assert.equal(calls,1);
  const second=await upload();fail=true;const n=(await store.listAiIntakeItems()).length;const bad=await server.inject({method:'POST',url:'/api/ai-intake-items/from-material',payload:{...payload,materialId:second.id}});assert.equal(bad.statusCode,502,bad.body);assert.equal((await store.listAiIntakeItems()).length,n);
  const missing=await server.inject({method:'POST',url:'/api/ai-intake-items/from-material',payload:{...payload,materialId:'missing'}});assert.equal(missing.statusCode,404);
  const legacy=await server.inject({method:'POST',url:'/api/ai-intake-items',payload:{}});assert.equal(legacy.statusCode,410);
 }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
test('structured response rejects empty or oversized content',()=>{assert.throws(()=>intakeDraft({summary:'',extracted:[],generatedTasks:[]}));assert.throws(()=>intakeDraft({summary:'摘要',extracted:[3],generatedTasks:[]}));});

test('version change during provider call discards stale output; viewer cannot invoke provider',async()=>{
 const root=await mkdtemp(join(tmpdir(),'intake-stale-')),store=createMemoryLedgerStore();let materialId='',calls=0;
 const secret='intake-isolated-fixture';
 const server=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'password',sessionSecret:secret},ai:{env:{QWEN_API_KEY:'fixture'},fetchImpl:async()=>{calls++;const changed=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),projectId:(await store.listProjects())[0].id,type:'会议纪要',name:'旧版.txt',materialId,expectedVersion:'1'}),headers:{cookie:admin,'content-type':'application/octet-stream'},payload:Buffer.from('新版本内容。')});assert.equal(changed.statusCode,201,changed.body);return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'旧版摘要',extracted:[],generatedTasks:[]})}}]})};}}});
 let admin='';try{
  admin=await registeredCookie(server,{id:'user-admin',name:'管理员',email:'admin',role:'admin'},secret);
  const viewer=await registeredCookie(server,{id:'intake-viewer',name:'只读',email:'intake-viewer@example.test',role:'viewer'},secret);
  const u=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),projectId:(await store.listProjects())[0].id,type:'会议纪要',name:'旧版.txt'}),headers:{cookie:admin,'content-type':'application/octet-stream'},payload:Buffer.from('旧版本讨论。')});assert.equal(u.statusCode,201,u.body);materialId=u.json().material.id;
  const payload={materialId,inputType:'会议纪要'},before=(await store.listAiIntakeItems()).length;
  const denied=await server.inject({method:'POST',url:'/api/ai-intake-items/from-material',headers:{cookie:viewer},payload});assert.equal(denied.statusCode,403);assert.equal(calls,0);
  const stale=await server.inject({method:'POST',url:'/api/ai-intake-items/from-material',headers:{cookie:admin},payload});assert.equal(stale.statusCode,409,stale.body);assert.equal(stale.json().error,'ai_intake_source_changed');assert.equal((await store.listAiIntakeItems()).length,before);
 }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
test('legacy intake archive preserves existing tasks but never assigns unconfirmed owners or dates',async()=>{
 const store=createMemoryLedgerStore(),item=(await store.listAiIntakeItems()).find(x=>x.status==='待确认')!;assert(item&&!item.sourceMaterialId);const before=await store.listTasks();const result=await store.archiveAiIntakeItem(item.id);assert(result);assert.deepEqual(await store.listTasks(),before);assert.equal(result.tasks.length,0);
});
