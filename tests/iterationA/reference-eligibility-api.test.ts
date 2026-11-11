import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {createTestServer,registeredCookie} from '../../server/tests/auth-fixture.ts';
import {createReferenceVisualStore} from './reference-eligibility-fixture.ts';
test('engineering originals stay in the authorized catalogue and downloadable, but AI rejects reference before any model call',async t=>{
 const root=await mkdtemp(join(tmpdir(),'fundapp-reference-')),f=await createReferenceVisualStore(root);let calls=0;
 const secret='isolated-reference-test',server=createTestServer({ledgerStore:f.store,materialStorageRoot:root,auth:{mode:'password',sessionSecret:secret},ai:{env:{QWEN_API_KEY:'synthetic-test'},fetchImpl:async()=>{calls++;throw Error('model must not be called');}}});
 t.after(async()=>{await server.close();await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});});
 const cookie=await registeredCookie(server,{id:'user-admin',name:'管理员',email:'admin',role:'admin'},secret),headers={cookie};
 const catalogue=await server.inject({url:'/api/materials',headers});assert.equal(catalogue.statusCode,200);assert.equal(catalogue.json().materials.find((m:{id:string})=>m.id===f.reference.id)?.dataPurpose,'engineering_fixture');
 const allowed=await server.inject({url:'/api/ai/materials?includeDemo=true',headers});assert.equal(allowed.statusCode,200);assert.equal(allowed.json().materials.some((m:{id:string})=>m.id===f.reference.id),false);
 const original=await server.inject({url:`/api/materials/${f.reference.id}/versions/${f.reference.versionId}/file`,headers});assert.equal(original.statusCode,200);assert.deepEqual(original.rawPayload,f.reference.bytes);
 const conversation=(await server.inject({method:'POST',url:'/api/ai/conversations',headers,payload:{requestId:randomUUID(),includeDemo:true}})).json();
 const turn=await server.inject({method:'POST',url:`/api/ai/conversations/${conversation.id}/turns`,headers,payload:{requestId:randomUUID(),expectedRevision:conversation.revision,prompt:'隔离引用拒绝核验',materialIds:[f.reference.id]}});assert.equal(turn.statusCode,403);assert.equal(turn.json().error,'material_unavailable');assert.equal(calls,0);
 const viewer=await registeredCookie(server,{id:'reference-viewer',name:'只读核验',email:'viewer@fixture.invalid',role:'viewer'},secret),project=f.store.listProjects()[0];
 await f.store.accessTransaction(s=>{s.data.projects[project.id]={visibility:'members',memberIds:['user-admin'],revision:1};});
 const hidden=await server.inject({url:'/api/materials',headers:{cookie:viewer}});assert.equal(hidden.statusCode,200);assert.equal(hidden.json().materials.some((m:{id:string})=>m.id===f.reference.id),false);
 const deniedOriginal=await server.inject({url:`/api/materials/${f.reference.id}/versions/${f.reference.versionId}/file`,headers:{cookie:viewer}});assert.ok([403,404].includes(deniedOriginal.statusCode));
});
