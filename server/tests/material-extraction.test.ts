import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createTestServer} from './auth-fixture.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {searchCurrentMaterialTextChunks} from '../src/material-preview/extraction.ts';
const fixtures=resolve(import.meta.dirname,'fixtures/extraction');
const url=(query:Record<string,string>)=>'/api/materials/upload?'+new URLSearchParams(query);
test('new PDF, scanned PDF/image and Word bodies are indexed from immutable originals',async t=>{
 const root=await mkdtemp(resolve(tmpdir(),'batch25-extraction-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const requests:string[]=[];
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'local-bypass'},ai:{env:{QWEN_API_KEY:'synthetic-fixture'},fetchImpl:async(_url,init)=>{requests.push(init!.body!);return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'资料已核验 [1]'}}]}),headers:{get:()=> 'text/event-stream'},body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'资料已核验 [1]'}}]})+'\n\ndata: [DONE]\n\n'));c.close();}})};}}});t.after(()=>server.close());
 for(const [file,needle] of [['text.pdf','123456789'],['scan.pdf','987654321'],['scan.png','987654321'],['word.docx','555666777'],['word.doc','555666777']]){
  const bytes=await readFile(resolve(fixtures,file));const query={requestId:randomUUID(),name:file,type:'验收资料',projectId:store.listProjects()[0].id};
  const response=await server.inject({method:'POST',url:url(query),headers:{'content-type':'application/octet-stream'},payload:bytes});
  assert.equal(response.statusCode,201,response.body);const body=response.json();assert.equal(body.extraction.status,'ready',response.body);
  const search=await server.inject('/api/materials/text-search?q='+needle);assert.equal(search.statusCode,200,search.body);
  const chunk=search.json().chunks.find((c:any)=>c.materialId===body.material.id);assert.ok(chunk?.text.includes(needle),search.body);
  assert.ok(chunk.originalDocumentHref.includes(body.version.id));assert.deepEqual((await server.inject(body.version.downloadHref)).rawPayload,bytes);
  const status=await server.inject('/api/materials/'+body.material.id+'/extraction');assert.equal(status.json().status,'ready');assert.ok(status.json().characters>20);
  assert.deepEqual(await searchCurrentMaterialTextChunks(store,root,{query:needle,allowedMaterialIds:[]}),[]);
  const conversation=(await server.inject({method:'POST',url:'/api/ai/conversations',payload:{requestId:randomUUID(),includeDemo:false}})).json();
  const turn=await server.inject({method:'POST',url:`/api/ai/conversations/${conversation.id}/turns`,payload:{requestId:randomUUID(),expectedRevision:conversation.revision,prompt:'请查资料金额 '+needle,materialIds:[body.material.id]}});
  assert.equal(turn.statusCode,200,turn.body);assert.ok(requests.at(-1)?.includes(needle));assert.ok(turn.body.includes(body.version.id));
  const chat=await server.inject({method:'POST',url:'/api/ai/chat',payload:{prompt:'资料金额 '+needle,includeDemo:false}});assert.equal(chat.statusCode,200,chat.body);assert.ok(requests.at(-1)?.includes(needle));
  const forbidden=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'password',sessionSecret:'batch25-test-secret'}});t.after(()=>forbidden.close());
  assert.equal((await forbidden.inject('/api/materials/'+body.material.id+'/extraction')).statusCode,401);
 }
 const fund=(await store.listFunds())[0];const investor=await server.inject({method:'POST',url:`/api/funds/${fund.id}/investors`,payload:{requestId:randomUUID(),name:'Extraction Synthetic LP',type:'机构'}});assert.equal(investor.statusCode,200,investor.body);
 const lpUpload=await server.inject({method:'POST',url:`/api/funds/${fund.id}/investors/${investor.json().investor.id}/materials/upload?`+new URLSearchParams({requestId:randomUUID(),expectedRevision:'1',name:'lp-word.docx',type:'LP凭证'}),headers:{'content-type':'application/octet-stream'},payload:await readFile(resolve(fixtures,'word.docx'))});assert.equal(lpUpload.statusCode,200,lpUpload.body);assert.equal(lpUpload.json().extraction.status,'ready');
 assert.ok((await server.inject('/api/materials/text-search?q=555666777')).json().chunks.some((c:any)=>c.materialId===lpUpload.json().material.id));
});
test('version switch hides old body even when new extraction fails; retry and restart recover',async t=>{
 const root=await mkdtemp(resolve(tmpdir(),'batch25-versions-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'local-bypass'}});t.after(()=>server.close());
 const query={requestId:randomUUID(),name:'versions.txt',type:'验收资料',projectId:store.listProjects()[0].id};
 const upload=(q:Record<string,string>,bytes:Buffer)=>server.inject({method:'POST',url:url(q),headers:{'content-type':'application/octet-stream'},payload:bytes});
 const v1=(await upload(query,Buffer.from('ORIGINAL_VERSION_111111 old body'))).json();
 // A supported upload type that is deliberately invalid as a PDF preserves upload success but records parse failure.
 const pdfQuery={requestId:randomUUID(),name:'broken.pdf',type:'验收资料',projectId:query.projectId};
 const bad=(await upload(pdfQuery,Buffer.from('%PDF-1.7 broken'))).json();assert.equal(bad.extraction.status,'failed');
 const pdf1=(await upload({...pdfQuery,name:'switch.pdf',requestId:randomUUID()},await readFile(resolve(fixtures,'text.pdf')))).json();
 const pdf2=(await upload({...pdfQuery,name:'switch.pdf',requestId:randomUUID(),materialId:pdf1.material.id,expectedVersion:'1'},Buffer.from('%PDF-1.7 broken'))).json();assert.equal(pdf2.extraction.status,'failed');
 assert.ok(!(await server.inject('/api/materials/text-search?q=123456789')).json().chunks.some((c:any)=>c.materialId===pdf1.material.id));
 assert.deepEqual((await server.inject(pdf1.version.downloadHref)).rawPayload,await readFile(resolve(fixtures,'text.pdf')));
 const v2=(await upload({...query,requestId:randomUUID(),materialId:v1.material.id,expectedVersion:'1'},Buffer.from('CURRENT_VERSION_222222 new body'))).json();
 assert.equal(v2.extraction.status,'ready');assert.equal((await server.inject('/api/materials/text-search?q=111111')).json().chunks.length,0);
 assert.ok((await server.inject('/api/materials/text-search?q=222222')).json().chunks.some((c:any)=>c.materialId===v1.material.id));
 assert.equal((await server.inject(v1.version.downloadHref)).body,'ORIGINAL_VERSION_111111 old body');
 // Remove only derived cache, then fail/recover against real on-disk integrity checks.
 const cache=resolve(root,'extracted-text',`${v2.version.id}-${v2.version.sha256}.json`);await rm(cache);
 const original=await readFile(resolve(root,v2.version.id));await writeFile(resolve(root,v2.version.id),'tampered');
 const failed=await server.inject({method:'POST',url:'/api/materials/'+v1.material.id+'/extraction'});assert.equal(failed.json().status,'failed');
 assert.equal((await server.inject('/api/materials/text-search?q=222222')).json().chunks.length,0);
 assert.equal((await server.inject('/api/materials/text-search?q=111111')).json().chunks.length,0);
 await writeFile(resolve(root,v2.version.id),original);
 const recovered=await server.inject({method:'POST',url:'/api/materials/'+v1.material.id+'/extraction'});assert.equal(recovered.json().status,'ready',recovered.body);
 const restarted=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'local-bypass'}});t.after(()=>restarted.close());
 assert.ok((await restarted.inject('/api/materials/text-search?q=222222')).json().chunks.some((c:any)=>c.materialId===v1.material.id));
});
