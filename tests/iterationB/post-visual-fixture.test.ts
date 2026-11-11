import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryLedgerStore} from '../../server/src/ledger/store.ts';
import {createTestServer,registeredCookie} from '../../server/tests/auth-fixture.ts';
import {preparePostVisualFixture} from './post-visual-fixture.ts';
test('isolated visual fixture has archives, immutable versions, warning tasks and byte-exact source',async()=>{
 const root=await mkdtemp(join(tmpdir(),'b-post-visual-')),store=createMemoryLedgerStore(),secret='isolated-visual-fixture';
 const server=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'password',sessionSecret:secret}});
 try{
  const cookie=await registeredCookie(server,{id:'user-admin',name:'管理员',email:'admin@example.local',role:'admin'},secret);
  const result=await preparePostVisualFixture(store,server,{cookie,isolatedInMemory:true});
  assert.ok((await store.listTasks()).some(t=>t.id===result.taskId));
  await assert.rejects(()=>preparePostVisualFixture(store,server,{cookie,isolatedInMemory:true}),/never overwrite workflow/);
 }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
