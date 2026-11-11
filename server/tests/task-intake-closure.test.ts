import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {AgentRepository} from '../src/agent/repository.ts';
import {registerAgentWorkspaceRoutes} from '../src/http/agent-workspace.ts';
import {registerBusinessIntakeRoutes} from '../src/http/business-intake.ts';

test('material task opens its own draft, saves via source validation, and refreshes without creating a business object',async()=>{
 const app=Fastify(),store=createMemoryLedgerStore(),repository=new AgentRepository(),auth={mode:'local-bypass' as const};
 registerAgentWorkspaceRoutes(app,store,{repository,auth,startScheduler:false});
 registerBusinessIntakeRoutes(app,store,{repository,auth,projectRoot:'/unused',storageRoot:'/unused'});
 try{
  const before=(await store.listProjects()).length;
  const created=await app.inject({method:'POST',url:'/api/business-intake/drafts',payload:{requestId:randomUUID(),objectType:'project'}});assert.equal(created.statusCode,200,created.body);const d=created.json().draft;
  const view=(await app.inject('/api/agent-workspace')).json();const task=view.tasks.find((x:any)=>x.id===`draft:${d.id}:field:name`);assert.ok(task);assert.equal(task.status,'open');const href=new URL(task.href,'http://local');assert.equal(href.searchParams.get('intakeDraft'),d.id);assert.equal(href.searchParams.get('field'),'name');
  const url='/api/business-intake/drafts/'+d.id,checked=await app.inject({method:'POST',url:url+'/check-sources',payload:{}});assert.equal(checked.statusCode,200,checked.body);
  const body={requestId:randomUUID(),expectedVersion:checked.json().draft.version,fields:{...d.fields,name:'自动验收专用草稿'}};
  const saved=await app.inject({method:'PATCH',url,payload:body});assert.equal(saved.statusCode,200,saved.body);
  const replay=await app.inject({method:'PATCH',url,payload:body});assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().draft.version,saved.json().draft.version);
  const next=(await app.inject('/api/agent-workspace')).json();assert.equal(next.tasks.filter((x:any)=>x.id===task.id).length,1);assert.equal(next.tasks.find((x:any)=>x.id===task.id).status,'complete');assert.equal((await store.listProjects()).length,before);
 }finally{await app.close();}
});
