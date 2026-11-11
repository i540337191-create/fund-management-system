import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {AgentRepository} from '../src/agent/repository.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {workspaceRuntime} from '../src/agent/runtime.ts';
test('review final: fund-targeted schedule passes selected fund to assistant execution',async()=>{
 const server=Fastify(),store=createMemoryLedgerStore(),repository=new AgentRepository();
 const actor={id:'user-admin',name:'管理员',email:'review@example.invalid',role:'admin' as const};
 let payload:any;
 server.post('/api/ai/conversations',async()=>({id:'synthetic-conversation',revision:1}));
 server.post('/api/ai/conversations/:id/turns',async(req,reply)=>{payload=req.body;reply.type('text/event-stream');return 'event: done\ndata: '+JSON.stringify({conversation:{messages:[{role:'assistant',status:'complete',content:'synthetic result'}]}})+'\n\n';});
 const runtime=workspaceRuntime(server,store,repository,{mode:'local-bypass'});
 try{
 await repository.transaction(s=>s.schedules.push({id:'selected-fund-schedule',ownerId:actor.id,scope:'personal',title:'Selected fund only',skillId:'skill-profile',prompt:'分析当前基金',nextAt:'2026-01-01T00:00:00.000Z',intervalMinutes:0,enabled:true,actor,fundId:'selected-fund'}));
 await runtime.run(actor,'skill-profile','分析当前基金','selected-fund-schedule','synthetic-cookie');
 assert.equal(payload?.fundId,'selected-fund','selected fund disappears before assistant execution');
 }finally{runtime.close();await server.close();}
});
