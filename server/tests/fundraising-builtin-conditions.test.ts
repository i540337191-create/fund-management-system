import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createTestServer} from './auth-fixture.ts';
import {fundraisingTemplates} from '../src/ledger/fundraising-templates.ts';
async function fixture(t:any,type='机构'){
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});
 t.after(()=>server.close());
 const fund=(await store.listFunds())[0],base=`/api/funds/${fund.id}/investors`;
 const created=await server.inject({method:'POST',url:base,payload:{requestId:randomUUID(),name:'QA隔离内置条件核验',type}});assert.equal(created.statusCode,200,created.body);
 const id=created.json().investor.id,url=base+'/'+id+'/fundraising';let revision=created.json().investor.revision;
 const act=async(extra:any)=>{const r=await server.inject({method:'POST',url:url+'/actions',payload:{requestId:randomUUID(),expectedRevision:revision,action:'import',templateId:'custodied',ownerId:'user-admin',dueDate:'2027-01-01',...extra}});if(r.statusCode===200)revision=r.json().revision;return r;};
 return {store,server,fund,id,url,act};
}
test('builtin conditional requirements cannot be imported as optional without applicability confirmation',async t=>{
 const f=await fixture(t),before=(await f.server.inject(f.url)).json();
 const r=await f.act({});assert.equal(r.statusCode,400,r.body);assert.equal(r.json().error,'template_applicability_confirmation_required');
 const after=(await f.server.inject(f.url)).json();assert.equal(after.revision,before.revision);assert.deepEqual(after.requirements,before.requirements);assert.deepEqual(after.history,before.history);
});
test('explicit builtin opt-in is mandatory; opt-out stays absent; malformed selections cannot bypass scope',async t=>{
 const f=await fixture(t);
 for(const extra of [{materialIds:['授权委托书'],excludedMaterialIds:['授权委托书']},{materialIds:['合伙协议']},{excludedMaterialIds:['自然人录音或录像']},{materialIds:['不存在的附件']},{materialIds:['授权委托书','授权委托书']}]){
  const r=await f.act(extra);assert.equal(r.statusCode,400,r.body);
 }
 const r=await f.act({materialIds:['授权委托书'],excludedMaterialIds:[]});assert.equal(r.statusCode,200,r.body);
 const item=r.json().requirements.find((x:any)=>x.name==='授权委托书');assert(item);assert.equal(item.required,true);assert.match(item.condition,/不能双录/);assert.deepEqual(r.json().history.at(-1).payload.materialIds,['授权委托书']);
 const replay=await f.server.inject({method:'POST',url:f.url+'/actions',payload:r.json().history.at(-1).payload});assert.equal(replay.statusCode,200,replay.body);assert.deepEqual(replay.json(),r.json());
 const review=await f.server.inject({method:'POST',url:f.url+'/actions',payload:{requestId:randomUUID(),expectedRevision:r.json().revision,action:'review',decision:'approve',note:'缺原件不得通过'}});assert.equal(review.statusCode,409,review.body);
 const g=await fixture(t),excluded=await g.act({materialIds:[],excludedMaterialIds:['授权委托书']});assert.equal(excluded.statusCode,200,excluded.body);assert(!excluded.json().requirements.some((x:any)=>x.name==='授权委托书'));assert.deepEqual(excluded.json().history.at(-1).payload.excludedMaterialIds,['授权委托书']);assert.equal((await g.act({})).statusCode,400);
});
test('natural-person conditional recordings and product scope use the same new-import rules',async t=>{
 const f=await fixture(t,'自然人');assert.equal((await f.act({})).statusCode,400);
 const r=await f.act({materialIds:['自然人录音或录像'],excludedMaterialIds:[]});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().requirements.find((x:any)=>x.name==='自然人录音或录像')?.required,true);
 const g=await fixture(t,'产品');assert.equal((await g.act({excludedMaterialIds:['授权委托书']})).statusCode,400);const product=await g.act({});assert.equal(product.statusCode,200,product.body);assert(product.json().requirements.every((x:any)=>x.category==='signed'));
});
test('reimport leaves legacy optional requirements unchanged while new unresolved conditions still block',async t=>{
 const f=await fixture(t),template=fundraisingTemplates[0],old={id:'legacy-optional-authority',name:'授权委托书',required:false,ownerId:'user-admin',dueDate:'2026-01-01',source:{path:template.source,sha256:template.sha256}};
 await f.store.lpTransaction(s=>{(s.data.fundraising??={})[f.id]={requirements:[structuredClone(old)],plans:[],allocations:[],history:[]};});
 const r=await f.act({});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().requirements.find((x:any)=>x.id===old.id),{...old,available:false});
});

test('AI import preparation exposes choices while requiring the user to decide applicability',async()=>{
 const {workflowCatalog}=await import('../src/ai/workflow-tools.ts');
 const operation=workflowCatalog().find(m=>m.module==='fundraising')!.operations.find(a=>a.operation==='import')!;
 assert.deepEqual(operation.required,['templateId','ownerId','dueDate']);
 assert(operation.fields.includes('materialIds'));assert(operation.fields.includes('excludedMaterialIds'));assert(operation.fields.includes('templateVersion'));assert.match(operation.guide,/不得代用户核定/);
});
