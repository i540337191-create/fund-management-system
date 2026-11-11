import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createTestServer} from './auth-fixture.ts';
test('deleted LP source invalidates approval/tasks while originals and assessment survive restoration',async t=>{
 const root=await mkdtemp(join(tmpdir(),'lp-source-')),store=createMemoryLedgerStore(),app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'},materialStorageRoot:root});t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
 const base='/api/funds/'+store.listFunds()[0].id+'/investors',created=await app.inject({method:'POST',url:base,payload:{requestId:randomUUID(),name:'QA source lifecycle LP',type:'机构'}});assert.equal(created.statusCode,200,created.body);const member=base+'/'+created.json().investor.id;let revision=created.json().investor.revision;
 const act=async(action:string,data:Record<string,unknown>)=>{const r=await app.inject({method:'POST',url:member+'/fundraising/actions',payload:{requestId:randomUUID(),expectedRevision:revision,action,...data}});if(r.statusCode===200)revision=r.json().revision;return r;};
 const required=await act('requirement',{name:'QA source requirement',required:true,ownerId:'user-admin',dueDate:'2027-01-01'});assert.equal(required.statusCode,200,required.body);const itemId=required.json().requirements[0].id;
 const upload=await app.inject({method:'POST',url:member+'/materials/upload?'+new URLSearchParams({requestId:randomUUID(),expectedRevision:String(revision),name:'qa-source.txt',type:'LP材料'}),headers:{'content-type':'application/octet-stream'},payload:Buffer.from('QA source lifecycle bytes')});assert.equal(upload.statusCode,200,upload.body);revision=upload.json().investor.revision;const proof={materialId:upload.json().material.id,versionId:upload.json().version.id};assert.equal((await act('submit',{reviewerId:'user-admin',itemId,proof})).statusCode,200);assert.equal((await act('review',{decision:'approve',note:'QA assessment retained'})).json().approved,true);
 const before=(await app.inject(member+'/fundraising')).json();const manage=async(action:'delete'|'restore')=>{const meta=(await app.inject('/api/record-management/material')).json();const r=await app.inject({method:'POST',url:'/api/record-management/material/'+proof.materialId+'/'+action,payload:{requestId:randomUUID(),expectedVersion:meta.versions[proof.materialId]}});assert.equal(r.statusCode,200,r.body);};await manage('delete');
 const deleted=(await app.inject(member+'/fundraising')).json();assert.equal(deleted.requirements[0].available,false);assert.equal(deleted.approved,false);assert.notEqual(deleted.tasks[0].status,'已完成');assert.deepEqual(deleted.assessment,before.assessment);assert.equal(deleted.history.length,before.history.length);assert(!(await app.inject(member)).json().materials.some((m:{id:string})=>m.id===proof.materialId));assert.equal((await store.lpTransaction(s=>s.materials.some(m=>m.id===proof.materialId))),true);
 assert.equal((await act('review',{decision:'approve',note:'must reject deleted source'})).statusCode,409);assert.equal((await act('submit',{reviewerId:'user-admin',itemId,proof})).statusCode,409);
 await manage('restore');const restored=(await app.inject(member+'/fundraising')).json();assert.equal(restored.approved,true);assert.equal(restored.requirements[0].available,true);assert.deepEqual(restored.assessment,before.assessment);assert.deepEqual(restored.requirements[0].proof,before.requirements[0].proof);assert.equal(restored.history.length,before.history.length);
});
