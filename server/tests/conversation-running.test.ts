import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTestServer} from './auth-fixture.ts';
test('history includes business preparation in progress and clears it after stop',async()=>{
 let ready!:()=>void;const started=new Promise<void>(resolve=>{ready=resolve;});
 const app=createTestServer({ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async(_url,init)=>{ready();return await new Promise((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(Error('stopped')),{once:true});});}}});
 let id='';
 try{const c=(await app.inject({method:'POST',url:'/api/ai/conversations',payload:{requestId:randomUUID(),includeDemo:true}})).json();id=c.id;
 const pending=app.inject({method:'POST',url:`/api/ai/conversations/${id}/actions`,payload:{requestId:randomUUID(),expectedRevision:c.revision,instruction:'整理待确认事项'}});void pending.then(()=>{});
 await started;const during=(await app.inject('/api/ai/conversations?includeDemo=true')).json().conversations.find((x:any)=>x.id===id);assert.equal(during.running,true);
 await app.inject({method:'POST',url:`/api/ai/conversations/${id}/stop`,payload:{}});await pending;
 const after=(await app.inject('/api/ai/conversations?includeDemo=true')).json().conversations.find((x:any)=>x.id===id);assert.equal(after.running,false);
 }finally{if(id)await app.inject({method:'POST',url:`/api/ai/conversations/${id}/stop`,payload:{}});await app.close();}
});
