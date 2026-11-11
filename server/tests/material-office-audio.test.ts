import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createTestServer} from './auth-fixture.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {checkBytes} from '../src/http/material-upload.ts';
const fixtures=resolve(import.meta.dirname,'fixtures/extraction');
const audioEnabled=process.platform==='linux'||Boolean(process.env.ASR_WHISPER_BIN);
test('Office uploads index sheets, slides and notes with exact immutable version citations',async t=>{
 const root=await mkdtemp(resolve(tmpdir(),'office39-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=createMemoryLedgerStore();const requests:string[]=[];
 const server=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'local-bypass'},ai:{env:{QWEN_API_KEY:'synthetic-fixture'},fetchImpl:async(_url,init)=>{requests.push(String(init?.body));return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'已核对所选资料 [1]'}}]}),headers:{get:()=> 'text/event-stream'},body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'已核对所选资料 [1]'}}]})+'\n\ndata: [DONE]\n\n'));c.close();}})};}}});t.after(()=>server.close());
 for(const [name,needle,page] of [['budget.xlsx','OFFICE39SECOND',2],['brief.pptx','NOTE39REQUIRED',1],...(process.platform==='linux'?[['budget.xls','246813579',1],['brief.ppt','PRESENT39SECOND',2]]:[])] as [string,string,number][]){
  const bytes=await readFile(resolve(fixtures,name));const query=new URLSearchParams({requestId:randomUUID(),name,type:'验收资料',projectId:store.listProjects()[0].id});
  const response=await server.inject({method:'POST',url:'/api/materials/upload?'+query,headers:{'content-type':'application/octet-stream'},payload:bytes});assert.equal(response.statusCode,201,response.body);const b=response.json();assert.equal(b.extraction.status,'ready',response.body);
  const chunks=(await server.inject('/api/materials/text-search?q='+needle)).json().chunks;const chunk=chunks.find((x:any)=>x.materialId===b.material.id);assert.equal(chunk.page,page);assert.ok(chunk.text.includes(needle));assert.ok(chunk.originalDocumentHref.includes(b.version.id));assert.deepEqual((await server.inject(b.version.downloadHref)).rawPayload,bytes);
  const conversation=(await server.inject({method:'POST',url:'/api/ai/conversations',payload:{requestId:randomUUID(),includeDemo:false}})).json();
  const turn=await server.inject({method:'POST',url:`/api/ai/conversations/${conversation.id}/turns`,payload:{requestId:randomUUID(),expectedRevision:conversation.revision,prompt:'请核对资料 '+needle,materialIds:[b.material.id]}});assert.equal(turn.statusCode,200,turn.body);assert.ok(requests.at(-1)?.includes(needle));assert.ok(turn.body.includes(b.version.id));
  const broken=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name,type:'验收资料',projectId:store.listProjects()[0].id,materialId:b.material.id,expectedVersion:'1'}),headers:{'content-type':'application/octet-stream'},payload:Buffer.from(name.endsWith('xlsx')||name.endsWith('pptx')?'PK\x03\x04broken':'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1','binary')});assert.equal(broken.statusCode,201,broken.body);assert.equal(broken.json().extraction.status,'failed');assert.ok(!(await server.inject('/api/materials/text-search?q='+needle)).json().chunks.some((x:any)=>x.materialId===b.material.id));assert.deepEqual((await server.inject(b.version.downloadHref)).rawPayload,bytes);
 }
});
test('audio upload signatures reject disguised text and accept genuine media',async()=>{
 for(const name of ['chinese.wav','english.mp3','english.m4a','english.ogg','english.webm','english-live.webm','english.flac'])checkBytes(await readFile(resolve(fixtures,name)),name.split('.').at(-1)!);
 for(const ext of ['constructor','__proto__','toString'])assert.throws(()=>checkBytes(Buffer.from('disguised text'),ext),/unsupported_material_type/);
 for(const ext of ['wav','mp3','m4a','ogg','webm','flac'])assert.throws(()=>checkBytes(Buffer.from('not an audio file'),ext),/material_signature_mismatch/);
});
test('local ASR indexes actual speech and refuses silent audio', {skip:!audioEnabled,timeout:300000},async t=>{
 const {ensureMaterialExtraction}=await import('../src/material-preview/extraction.ts');const {createHash}=await import('node:crypto');
 const root=await mkdtemp(resolve(tmpdir(),'asr39-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const [name,needle] of [['chinese.wav','项目验收'],['english.mp3','amber'],['english.m4a','amber'],['english.ogg','amber'],['english.webm','amber'],['english-live.webm','amber'],['english.flac','amber'],['silence.wav','']]){
  const bytes=await readFile(resolve(fixtures,name));const id=randomUUID();await writeFile(resolve(root,id),bytes);
  const v={id,blobId:id,name,sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length} as any;
  const result=await ensureMaterialExtraction(root,v);assert.equal(result.status,needle?'ready':'failed',JSON.stringify(result));if(needle){assert.ok(result.pages.some(p=>p.text.toLowerCase().includes(needle)),JSON.stringify(result));assert.match(result.pages[0].text,/录音 \d\d:\d\d/);if(name==='chinese.wav'){const speech=result.pages.map(p=>p.text).join(' ');assert.match(speech,/11月5日/);assert.match(speech,/整理验收任务/);}}
 }
});
test('AI responds promptly while recording is pending and does not invent a citation',async t=>{
 const {requestMaterialExtraction,ensureMaterialExtraction}=await import('../src/material-preview/extraction.ts');const {createHash}=await import('node:crypto');
 const root=await mkdtemp(resolve(tmpdir(),'pending39-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const fake=resolve(root,'slow-python');await writeFile(fake,'#!/bin/sh\nsleep 4\nexit 1\n',{mode:0o700});const prior=process.env.DOCUMENT_PYTHON;process.env.DOCUMENT_PYTHON=fake;t.after(()=>{if(prior===undefined)delete process.env.DOCUMENT_PYTHON;else process.env.DOCUMENT_PYTHON=prior;});
 const store=createMemoryLedgerStore();let calls=0;const server=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'local-bypass'},ai:{env:{QWEN_API_KEY:'synthetic-fixture'},fetchImpl:async()=>{calls++;throw Error('pending audio must not reach model');}}});t.after(()=>server.close());
 const bytes=await readFile(resolve(fixtures,'chinese.wav'));const query=new URLSearchParams({requestId:randomUUID(),name:'pending.wav',type:'录音',projectId:store.listProjects()[0].id});
 const upload=await server.inject({method:'POST',url:'/api/materials/upload?'+query,headers:{'content-type':'application/octet-stream'},payload:bytes});assert.equal(upload.statusCode,201,upload.body);const body=upload.json();assert.equal(body.extraction.status,'pending');
 const officeStart=Date.now();const queuedOffice=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name:'queued.xlsx',type:'验收资料',projectId:store.listProjects()[0].id}),headers:{'content-type':'application/octet-stream'},payload:await readFile(resolve(fixtures,'budget.xlsx'))});assert.equal(queuedOffice.statusCode,201,queuedOffice.body);assert.ok(Date.now()-officeStart<2000);assert.equal(queuedOffice.json().extraction.status,'pending');
 const conversation=(await server.inject({method:'POST',url:'/api/ai/conversations',payload:{requestId:randomUUID(),includeDemo:false}})).json();const started=Date.now();
 const turn=await server.inject({method:'POST',url:`/api/ai/conversations/${conversation.id}/turns`,payload:{requestId:randomUUID(),expectedRevision:conversation.revision,prompt:'读取录音及工作簿并引用',materialIds:[body.material.id,queuedOffice.json().material.id]}});
 assert.equal(turn.statusCode,200,turn.body);assert.ok(Date.now()-started<2000);assert.match(turn.body,/后台解析|录音转写/);assert.equal(calls,0);
 const saved=(await server.inject(`/api/ai/conversations/${conversation.id}`)).json();assert.equal(saved.messages.at(-1).status,'complete');assert.deepEqual(saved.messages.at(-1).citations,[]);
 assert.equal((await ensureMaterialExtraction(root,(await store.listMaterialVersions(body.material.id))[0])).status,'failed');
 assert.equal((await ensureMaterialExtraction(root,(await store.listMaterialVersions(queuedOffice.json().material.id))[0])).status,'failed');
});
test('restart recovery parses an Office version committed before extraction cache was written',async t=>{
 const {unlink}=await import('node:fs/promises');const {readMaterialExtraction}=await import('../src/material-preview/extraction.ts');
 const root=await mkdtemp(resolve(tmpdir(),'resume-office39-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=createMemoryLedgerStore();
 const first=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'local-bypass'}});
 const response=await first.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name:'recovery.xlsx',type:'验收',projectId:store.listProjects()[0].id}),headers:{'content-type':'application/octet-stream'},payload:await readFile(resolve(fixtures,'budget.xlsx'))});assert.equal(response.statusCode,201,response.body);assert.equal(response.json().extraction.status,'ready');
 const version=(await store.listMaterialVersions(response.json().material.id))[0];await first.close();await unlink(resolve(root,'extracted-text',version.id+'-'+version.sha256+'.json'));
 const restarted=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'local-bypass'}});t.after(()=>restarted.close());await restarted.ready();
 let ready=false;for(let i=0;i<100;i++){const value=await readMaterialExtraction(root,version);if(value?.status==='ready'){ready=true;break;}await new Promise(r=>setTimeout(r,50));}assert.equal(ready,true);assert.ok((await restarted.inject('/api/materials/text-search?q=246813579')).json().chunks.some((x:any)=>x.materialId===response.json().material.id));
});
