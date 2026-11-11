import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Fastify from 'fastify';
import {AgentRepository} from '../src/agent/repository.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {registerAgentWorkspaceRoutes} from '../src/http/agent-workspace.ts';

test('configuration form contract accepts local paths and round-trips custom minute schedules',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fundapp-agent-config-')),previous=process.env.AGENT_LIBRARY_ROOT;
 process.env.AGENT_LIBRARY_ROOT=root;
 const app=Fastify();registerAgentWorkspaceRoutes(app,createMemoryLedgerStore(),{repository:new AgentRepository(),auth:{mode:'local-bypass'},startScheduler:false});
 const act=async(action:string,data:Record<string,unknown>)=>{const view=(await app.inject('/api/agent-workspace')).json();return app.inject({method:'POST',url:'/api/agent-workspace/actions',payload:{requestId:randomUUID(),expectedRevision:view.revision,action,data}});};
 try{
  await writeFile(join(root,'reference.txt'),'QA local reference, not a business fact.');
  let result=await act('save_plugin',{id:'qa-local-path',title:'QA local path',description:'QA only',kind:'local-library',endpoint:root,enabled:false});
  assert.equal(result.statusCode,200,result.body);assert.equal(result.json().plugins.find((p:any)=>p.id==='qa-local-path').endpoint,root);
  result=await act('test_plugin',{id:'qa-local-path'});assert.equal(result.statusCode,200,result.body);assert.equal(result.json().plugins.find((p:any)=>p.id==='qa-local-path').connected,true);
  const schedule={id:'qa-minute-schedule',title:'QA minutes',skillId:'skill-knowledge',prompt:'Only describe a document review process; do not prepare or execute writes.',nextAt:'2027-01-10T10:00:00.000Z',intervalMinutes:60,enabled:false};
  result=await act('save_schedule',{...schedule,recurrence:'custom'});assert.equal(result.statusCode,400);assert.equal(result.json().error,'invalid_recurrence');
  result=await act('save_schedule',{...schedule,recurrence:'interval'});assert.equal(result.statusCode,200,result.body);
  let saved=result.json().schedules.find((s:any)=>s.id===schedule.id);assert.equal(saved.recurrence,'interval');assert.equal(saved.intervalMinutes,60);assert.equal(saved.enabled,false);
  result=await act('save_schedule',{...schedule,version:saved.version,recurrence:saved.recurrence,intervalMinutes:90});assert.equal(result.statusCode,200,result.body);
  saved=result.json().schedules.find((s:any)=>s.id===schedule.id);assert.equal(saved.recurrence,'interval');assert.equal(saved.intervalMinutes,90);
 }finally{await app.close();if(previous===undefined)delete process.env.AGENT_LIBRARY_ROOT;else process.env.AGENT_LIBRARY_ROOT=previous;await rm(root,{recursive:true,force:true});}
});
