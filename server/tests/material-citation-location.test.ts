import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {searchUploadedMaterialTextChunks} from '../src/material-preview/extraction.ts';
test('cached Word whole-body index gains logical location without rewriting extraction or originals',async t=>{
 const root=await mkdtemp(resolve(tmpdir(),'citation-location-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const id=randomUUID(),sha256='a'.repeat(64),version={id,blobId:randomUUID(),sha256,name:'original.docx'},raw={versionId:id,sha256,status:'ready',pages:[{page:1,text:'机构投资者五项材料正文',method:'word_text'}],updatedAt:'2026-11-10T00:00:00Z'};
 await mkdir(resolve(root,'extracted-text'));const path=resolve(root,'extracted-text',`${id}-${sha256}.json`);await writeFile(path,JSON.stringify(raw));
 const store=createMemoryLedgerStore();store.listMaterials=()=>[{id:'doc',name:'renamed-without-extension',currentVersionId:id,dataOrigin:'user_input'}] as any;store.listMaterialVersions=()=>[version] as any;
 const [chunk]=await searchUploadedMaterialTextChunks(store,root,{query:'机构投资者',allowedMaterialIds:['doc']});
 assert.equal(chunk.page,1);assert.equal(chunk.location,'正文片段 1');assert.equal(chunk.text,raw.pages[0].text);assert.ok(chunk.originalDocumentHref.includes(id));
 assert.deepEqual(JSON.parse(await readFile(path,'utf8')),raw);
});
