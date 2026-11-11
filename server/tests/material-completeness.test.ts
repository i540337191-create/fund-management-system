import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseMaterialFindings} from '../src/http/material-completeness.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const source={materialId:'m',versionId:'v',name:'资料.txt',pages:[{page:1,text:'协议附件：财务报告，待补充。'}]};
test('AI findings require current document identity, valid page and verbatim evidence',()=>{
 const valid={materialId:'m',message:'请核对是否需补充附件财务报告。',page:1,quote:'财务报告，待补充'};
 assert.equal(parseMaterialFindings({findings:[valid]},[source])[0].versionId,'v');
 for(const patch of [{materialId:'foreign'},{page:2},{quote:'伪造引用'},{quote:''},{message:''}])assert.throws(()=>parseMaterialFindings({findings:[{...valid,...patch}]},[source]));
 assert.deepEqual(parseMaterialFindings({findings:[]},[source]),[]);
});
test('real uploaded text reaches model; cache/no-write; failures, source change and inaccessible ids stay distinct',async()=>{
 const root=await mkdtemp(join(tmpdir(),'material-check-')),store=createMemoryLedgerStore();let calls=0,id='',mode='ok',seen='';
 const server=createTestServer({ledgerStore:store,materialStorageRoot:root,ai:{env:{QWEN_API_KEY:'fixture-only'},fetchImpl:async(_url,init)=>{
  calls++;seen=init!.body!;const body=JSON.parse(JSON.parse(init!.body!).messages[1].content),doc=body.documents[0];
  if(mode==='stale'){const u=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),projectId:(await store.listProjects())[0].id,type:'协议',name:'资料.txt',materialId:id,expectedVersion:'1'}),headers:{'content-type':'application/octet-stream'},payload:Buffer.from('替换后的正文。')});assert.equal(u.statusCode,201,u.body);}
  return {ok:mode!=='fail',status:mode==='fail'?500:200,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({findings:mode==='empty'?[]:[{materialId:doc.materialId,message:'请核对是否需补充附件财务报告。',page:1,quote:mode==='invalid'?'不存在的引用':'财务报告，待补充'}]})}}]})};
 }}});
 try{
 const upload=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),projectId:(await store.listProjects())[0].id,type:'协议',name:'资料.txt'}),headers:{'content-type':'application/octet-stream'},payload:Buffer.from(source.pages[0].text)});assert.equal(upload.statusCode,201,upload.body);id=upload.json().material.id;
 const before=JSON.stringify(await store.listMaterials()),request=(refresh=false)=>server.inject({method:'POST',url:'/api/ai/material-completeness',payload:{materialIds:[id],refresh}});
 const r=await request();assert.equal(r.statusCode,200,r.body);assert.equal(r.json().checked.length,1);assert.equal(r.json().findings[0].materialId,id);assert.match(seen,/财务报告/);assert.equal(JSON.stringify(await store.listMaterials()),before);
 const restarted=createTestServer({ledgerStore:store,materialStorageRoot:root});try{const durable=await restarted.inject({url:'/api/ai/material-completeness/findings'});assert.equal(durable.statusCode,200,durable.body);assert.equal(durable.json().findings[0].materialId,id,'findings survive a new server instance');}finally{await restarted.close();}
 const cached=await server.inject({url:'/api/ai/material-completeness/findings'});assert.equal(cached.statusCode,200,cached.body);assert.equal(cached.json().findings[0].materialId,id);assert.equal(calls,1,'reading attention does not invoke AI');
 await request();assert.equal(calls,1);
 mode='empty';assert.equal((await request(true)).statusCode,200);assert.equal((await server.inject({url:'/api/ai/material-completeness/findings'})).json().findings.length,0,'clean recheck removes the old concern');mode='ok';await request(true);
 mode='invalid';assert.equal((await request(true)).statusCode,502);mode='fail';assert.equal((await request(true)).statusCode,502);
 const bad=await server.inject({method:'POST',url:'/api/ai/material-completeness',payload:{materialIds:['unknown']}});assert.equal(bad.statusCode,403);
 mode='stale';const stale=await request(true);assert.equal(stale.statusCode,409,stale.body);assert.equal((await server.inject({url:'/api/ai/material-completeness/findings'})).json().findings.length,0,'old version findings must disappear');
 }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
test('unread legacy records are not passed off as AI checked',async()=>{
 const root=await mkdtemp(join(tmpdir(),'material-unread-')),store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,materialStorageRoot:root});
 try{const archive=await store.archiveMaterial({name:'原件待补.txt',type:'协议',uploader:'test',time:'2026-11-08',source:'用户上传',status:'待确认',quotes:'0',project:(await store.listProjects())[0].name,dataOrigin:'user_input'});const id=archive.material.id,r=await server.inject({method:'POST',url:'/api/ai/material-completeness',payload:{materialIds:[id]}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().checked.length,0);assert.equal(r.json().unread.length,1);}finally{await server.close();await rm(root,{recursive:true,force:true});}
});

test('unauthenticated requests cannot trigger document AI',async()=>{
 let calls=0;const secret='material-check-fixture',server=createTestServer({auth:{mode:'password',sessionSecret:secret},ai:{fetchImpl:async()=>{calls++;throw Error('must not run');}}});
 try{const r=await server.inject({method:'POST',url:'/api/ai/material-completeness',payload:{materialIds:['unknown']}});assert.equal(r.statusCode,401);assert.equal((await server.inject({url:'/api/ai/material-completeness/findings'})).statusCode,401);assert.equal(calls,0);}finally{await server.close();}
});

test('attention findings are isolated per account even when both accounts can access the document',async()=>{
 const root=await mkdtemp(join(tmpdir(),'material-attention-')),secret='attention-cache-fixture',store=createMemoryLedgerStore();
 const server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret},materialStorageRoot:root,ai:{env:{QWEN_API_KEY:'fixture-only'},fetchImpl:async(_url,init)=>{const source=JSON.parse(JSON.parse(init!.body!).messages[1].content).documents[0];return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({findings:[{materialId:source.materialId,message:'附件待核对',page:1,quote:'财务报告，待补充'}]})}}]})};}}});
 try{
 const cookie=await registeredCookie(server,{id:'user-admin',name:'管理员',email:'admin@example.invalid',role:'admin'},secret),other=await registeredCookie(server,{id:'other-admin',name:'其他账号',email:'other@example.invalid',role:'admin'},secret);
 const uploaded=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),projectId:(await store.listProjects())[0].id,type:'协议',name:'资料.txt'}),headers:{cookie,'content-type':'application/octet-stream'},payload:Buffer.from(source.pages[0].text)});assert.equal(uploaded.statusCode,201,uploaded.body);
 const r=await server.inject({method:'POST',url:'/api/ai/material-completeness',headers:{cookie},payload:{materialIds:[uploaded.json().material.id]}});assert.equal(r.statusCode,200,r.body);
 assert.equal((await server.inject({url:'/api/ai/material-completeness/findings',headers:{cookie}})).json().findings.length,1);
 assert.equal((await server.inject({url:'/api/ai/material-completeness/findings',headers:{cookie:other}})).json().findings.length,0);
 }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
