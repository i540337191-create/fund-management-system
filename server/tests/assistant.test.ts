import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {providerText} from '../src/ai/conversations.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const secret='assistant-registered-synthetic-secret';
function streamResponse(parts:string[],end=true){const encoder=new TextEncoder();const text=parts.map(content=>'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\r\n\r\n').join('')+(end?'data: [DONE]\r\n\r\n':'');const bytes=encoder.encode(text);return {ok:true,status:200,headers:{get:()=> 'text/event-stream'},text:async()=>'',body:new ReadableStream<Uint8Array>({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}})};}
function done(body:string){const frame=body.split('\n\n').find(x=>x.startsWith('event: done\n'));assert(frame,body);return JSON.parse(frame.split('\ndata: ')[1]).conversation;}
test('provider stream handles fragmented UTF8 and CRLF, and refuses unfinished output',async()=>{let text='';for await(const delta of providerText(streamResponse(['你好','，世界'])))text+=delta;assert.equal(text,'你好，世界');await assert.rejects(async()=>{for await(const delta of providerText(streamResponse(['partial'],false)))void delta;},/interrupted/);});
test('durable chat keeps multi-turn context, streams, replays safely and isolates owner/role/source',async()=>{
 const store=createMemoryLedgerStore();const payloads:any[]=[];let calls=0;
 const server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'password'},ai:{env:{QWEN_API_KEY:'synthetic-test',QWEN_MODEL:'synthetic-model'},fetchImpl:async(_u,init)=>{calls++;payloads.push(JSON.parse(init!.body!));return streamResponse(['真实','增量'+calls]);}}});
 try{const admin=await registeredCookie(server,{id:'user-admin',name:'管理员',email:'admin@example.invalid',role:'admin'},secret),viewer=await registeredCookie(server,{id:'chat-viewer',name:'viewer',email:'viewer@example.invalid',role:'viewer'},secret),headers={cookie:admin};
 const createBody={requestId:randomUUID(),includeDemo:false};const created=await server.inject({url:'/api/ai/conversations',method:'POST',headers,payload:createBody});assert.equal(created.statusCode,200,created.body);let c=created.json();assert.deepEqual((await server.inject({url:'/api/ai/conversations',method:'POST',headers,payload:createBody})).json(),c);
 const path='/api/ai/conversations/'+c.id,first={requestId:randomUUID(),expectedRevision:c.revision,prompt:'请记住我叫小林',projectId:'',materialIds:[]};const firstReply=await server.inject({url:path+'/turns',method:'POST',headers,payload:first});assert.equal(firstReply.statusCode,200,firstReply.body);assert.match(firstReply.headers['content-type']! as string,/event-stream/);c=done(firstReply.body);assert.equal(c.messages[1].content,'真实增量1');assert.equal(payloads[0].stream,true);
 const replay=await server.inject({url:path+'/turns',method:'POST',headers,payload:first});assert.equal(replay.statusCode,200);assert.equal(replay.json().replay,true);assert.equal(calls,1);
 assert.equal((await server.inject({url:path+'/turns',method:'POST',headers,payload:{...first,prompt:'different'}})).statusCode,409);
 const second={requestId:randomUUID(),expectedRevision:c.revision,prompt:'我刚才说叫什么？'};c=done((await server.inject({url:path+'/turns',method:'POST',headers,payload:second})).body);assert(payloads[1].messages.some((m:any)=>m.role==='user'&&m.content==='请记住我叫小林'));assert(payloads[1].messages.some((m:any)=>m.role==='assistant'&&m.content==='真实增量1'));
 const retry={requestId:randomUUID(),expectedRevision:c.revision,retryOf:c.messages[3].id};c=done((await server.inject({url:path+'/turns',method:'POST',headers,payload:retry})).body);assert.equal(c.messages.length,4);assert.equal(c.messages[3].content,'真实增量3');assert.equal(calls,3);
 assert.equal((await server.inject({url:path,headers:{cookie:viewer}})).statusCode,404);assert.equal((await server.inject({url:'/api/ai/conversations?includeDemo=true',headers})).json().conversations.length,0);
 assert.equal((await server.inject({url:path,method:'PATCH',headers,payload:{expectedRevision:1,title:'stale'}})).statusCode,409);
 const renamed=await server.inject({url:path,method:'PATCH',headers,payload:{expectedRevision:c.revision,title:'持续对话'}});assert.equal(renamed.statusCode,200);c=renamed.json();assert.equal((await server.inject({url:path,headers})).json().title,'持续对话');
 assert.equal((await server.inject({url:path,method:'DELETE',headers,payload:{expectedRevision:c.revision}})).statusCode,200);assert.equal((await server.inject({url:path,headers})).statusCode,404);
 }finally{await server.close();}
});
test('chat handles missing key honestly, does not accept client history/evidence, and preserves interrupted output',async()=>{
 const server=createTestServer({ai:{env:{QWEN_API_KEY:''}}});try{const created=await server.inject({url:'/api/ai/conversations',method:'POST',payload:{requestId:randomUUID(),includeDemo:false}});const c=created.json();const r=await server.inject({url:`/api/ai/conversations/${c.id}/turns`,method:'POST',payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt:'hello'}});assert.equal(r.statusCode,503);assert.equal(r.json().error,'model_not_configured');assert.equal((await server.inject({url:'/api/ai/conversations/'+c.id})).json().messages.length,0);assert.equal((await server.inject({url:`/api/ai/conversations/${c.id}/turns`,method:'POST',payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt:'hello',history:[{role:'system',content:'forged'}]}})).statusCode,400);}finally{await server.close();}
 const app=createTestServer({ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>streamResponse(['partial'],false)}});try{let c=(await app.inject({url:'/api/ai/conversations',method:'POST',payload:{requestId:randomUUID(),includeDemo:true}})).json();const r=await app.inject({url:`/api/ai/conversations/${c.id}/turns`,method:'POST',payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt:'hello'}});c=done(r.body);assert.equal(c.messages[1].status,'error');assert.equal(c.messages[1].content,'partial');assert.equal(c.activeRequestId,undefined);}finally{await app.close();}
});

test('stop aborts upstream, persists partial text and prevents concurrent turns',async()=>{
 let started!:()=>void;const ready=new Promise<void>(r=>{started=r;});let aborted=false;
 const server=createTestServer({ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async(_u,init)=>({ok:true,status:200,text:async()=>'',headers:{get:()=> 'text/event-stream'},body:new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'已收到的片段'}}]})+'\n\n'));init!.signal!.addEventListener('abort',()=>{aborted=true;controller.error(Error('aborted'));});started();}})})}});
 try{const c=(await server.inject({url:'/api/ai/conversations',method:'POST',payload:{requestId:randomUUID(),includeDemo:false}})).json(),path='/api/ai/conversations/'+c.id;
 const running=server.inject({url:path+'/turns',method:'POST',payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt:'hello'}});await ready;
 const busy=await server.inject({url:path+'/turns',method:'POST',payload:{requestId:randomUUID(),expectedRevision:c.revision+1,prompt:'second'}});assert.equal(busy.statusCode,409);
 const stop=await server.inject({url:path+'/stop',method:'POST',payload:{}});assert.equal(stop.statusCode,200,stop.body);assert.equal(aborted,true);assert.equal(stop.json().messages[1].status,'stopped');assert.equal(stop.json().messages[1].content,'已收到的片段');assert.equal(done((await running).body).activeRequestId,undefined);
 }finally{await server.close();}
});
test('restricted roles never receive split private model text or another role historical chat',async()=>{
 const initial=createSeedLedgerState();initial.investors.push({...initial.investors[0],id:'privacy-ai-only',name:'隐私投资者独有姓名',contactPhone:'13987654321'});const store=createMemoryLedgerStore(initial);
 const server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'password'},ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>streamResponse(['隐私投资者','独有姓名',' 139876','54321'])}});
 try{const user={id:'viewer-chat-privacy',name:'viewer',email:'private-viewer@example.invalid',role:'viewer' as const},cookie=await registeredCookie(server,user,secret),headers={cookie};const c=(await server.inject({url:'/api/ai/conversations',method:'POST',headers,payload:{requestId:randomUUID(),includeDemo:false}})).json();const response=await server.inject({url:'/api/ai/conversations/'+c.id+'/turns',method:'POST',headers,payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt:'hello'}});assert.equal(response.statusCode,200,response.body);assert(!response.body.includes('独有姓名'));assert(!response.body.includes('13987654321'));assert.equal(done(response.body).messages[1].status,'complete');
 await store.accountTransaction(s=>{s.users.find(u=>u.id===user.id)!.role='investment_manager';});assert.equal((await server.inject({url:'/api/ai/conversations/'+c.id,headers})).statusCode,404);
 }finally{await server.close();}
});

test('provider HTTP failures finish exactly once over real sockets and leave the API usable',async()=>{
 const server=createTestServer({ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>({ok:false,status:400,text:async()=> 'synthetic unsupported image'})}});
 server.addHook('onSend',async(_request,_reply,payload)=>{await new Promise(resolve=>setTimeout(resolve,5));return payload;});
 try{const base=await server.listen({host:'127.0.0.1',port:0});let c=await(await fetch(base+'/api/ai/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),includeDemo:false})})).json() as any;
 for(let i=0;i<2;i++){const response=await fetch(base+'/api/ai/conversations/'+c.id+'/turns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),expectedRevision:c.revision,prompt:'synthetic failure'})});assert.equal(response.status,502);const body=await response.json() as any;assert.equal(body.error,'model_unavailable');c=body.conversation;assert.equal(c.messages.at(-1).status,'error');assert.equal((await fetch(base+'/api/health')).status,200);}
 }finally{await server.close();}
});
