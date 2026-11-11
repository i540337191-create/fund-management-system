import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {registerDocumentTemplateManagerRoutes} from '../src/http/document-template-manager.ts';
import {scopedLedgerStore} from '../src/auth/object-access.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const synthetic='document-template-synthetic-secret';
function xml(buffer:Buffer){let pos=0;while(buffer.readUInt32LE(pos)===0x04034b50){const size=buffer.readUInt32LE(pos+18),nameLength=buffer.readUInt16LE(pos+26),extra=buffer.readUInt16LE(pos+28),name=buffer.subarray(pos+30,pos+30+nameLength).toString(),start=pos+30+nameLength+extra;if(name==='word/document.xml')return (buffer.readUInt16LE(pos+8)===8?inflateRawSync(buffer.subarray(start,start+size)):buffer.subarray(start,start+size)).toString();pos=start+size;}throw new Error('missing_document_xml');}
async function setup(password=false){
 const seed=createSeedLedgerState(),fund=seed.funds[0],investor=seed.investors[0];fund.name='工程验收基金';fund.dataOrigin='user_input';investor.name='工程验收投资者';investor.dataOrigin='user_input';
 const store=createMemoryLedgerStore(seed),auth=password?{mode:'password' as const,sessionSecret:synthetic,adminEmail:'admin@example.invalid',adminPassword:'password'}:{mode:'local-bypass' as const};
 const app=createTestServer({ledgerStore:store,auth});if(!app.hasRoute({method:'GET',url:'/api/funds/:fundId/document-templates'}))registerDocumentTemplateManagerRoutes(app,scopedLedgerStore(store),{auth});
 await store.lifecycleTransaction(fund.id,async s=>{s.data.accounts.push({id:'registered-account',name:'工程验收收款账户',kind:'raising',number:'622200001234567890'});});
 await store.lpTransaction(s=>{s.data.fundraising={[investor.id]:{requirements:[],plans:[{id:'real-plan',name:'第一期出资',amount:'1200.00',dueDate:'2026-12-01',ownerId:'user-admin'}],allocations:[{planId:'real-plan',receiptId:'paid-receipt',amount:'300.00'}],history:[]}};s.data.entries.push({id:'paid-receipt',fundId:fund.id,requestId:randomUUID(),investorId:investor.id,amount:'300.00',currency:'CNY',unit:'元',actorId:'user-admin',actor:'工程验收',createdAt:'2026-11-02',bankDate:'2026-11-01',proof:{id:'proof',materialId:'proof-material',versionId:'proof-version',name:'工程回单.pdf',sha256:'a'.repeat(64),sizeBytes:10,blobId:'fixture-only'}});});
 return {app,store,fund,investor,base:`/api/funds/${fund.id}/document-templates`};
}
const custom=(revision:number,extra:Record<string,unknown>={})=>({requestId:randomUUID(),expectedRevision:revision,name:'基金工作函',sections:[{title:'说明',text:'{{基金名称}}：{{经办说明}}'}],variables:[{name:'基金名称',required:true},{name:'经办说明',required:true}],...extra});

test('template saves use RID and lifecycle CAS, preserve versions and leave audits',async()=>{
 const {app,store,base,fund}=await setup();try{const initial=await app.inject({url:base});assert.equal(initial.statusCode,200,initial.body);assert.equal(initial.json().templates[0].name,'缴款通知草稿');const payload=custom(initial.json().revision);
 const created=await app.inject({method:'POST',url:base,payload});assert.equal(created.statusCode,200,created.body);const first=created.json();assert.equal(first.template.version,1);
 const replay=await app.inject({method:'POST',url:base,payload});assert.deepEqual(replay.json(),first);
 const ridConflict=await app.inject({method:'POST',url:base,payload:{...payload,name:'变更指令'}});assert.equal(ridConflict.statusCode,409);assert.equal(ridConflict.json().error,'template_request_conflict');
 const stale=await app.inject({method:'POST',url:base,payload:custom(initial.json().revision)});assert.equal(stale.statusCode,409);assert.equal(stale.json().error,'lifecycle_revision_conflict');
 const updated=await app.inject({method:'POST',url:base,payload:custom(first.revision,{templateId:first.template.id,expectedTemplateVersion:1,name:'更新后的基金工作函'})});assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().template.version,2);
 const versions=(await app.inject({url:base})).json().templates.filter((t:any)=>t.id===first.template.id);assert.deepEqual(versions.map((t:any)=>t.version),[1,2]);assert.equal((await store.listAuditEvents()).filter(a=>a.action==='保存文档模板版本').length,2);
 const wrongVersion=await app.inject({method:'POST',url:base,payload:custom(updated.json().revision,{templateId:first.template.id,expectedTemplateVersion:1})});assert.equal(wrongVersion.statusCode,409);assert.equal(wrongVersion.json().error,'template_version_conflict');
 assert.equal(await store.lifecycleTransaction(fund.id,async s=>(s.data as any).templates.length),2);
 }finally{await app.close();}
});

test('template definitions reject unknown, duplicate, unused and unresolved variable markers',async()=>{
 const {app,base}=await setup();try{const initial=(await app.inject({url:base})).json();
 for(const patch of [{sections:[{title:'说明',text:'{{基金名称 }}'}]},{sections:[{title:'说明',text:'{{未定义}}'}]},{variables:[{name:'基金名称',required:true},{name:'基金名称',required:false}]},{variables:[{name:'基金名称',required:true},{name:'经办说明',required:true},{name:'未引用',required:true}]},{sections:[{title:'说明',text:'{{经办说明'}]},{sections:[{title:'说明',text:'${未完成书签}'}]}]){const r=await app.inject({method:'POST',url:base,payload:custom(initial.revision,patch)});assert.equal(r.statusCode,400,r.body);}
 const builtin=await app.inject({method:'POST',url:base,payload:custom(initial.revision,{templateId:'payment-notice-draft',expectedTemplateVersion:1})});assert.equal(builtin.statusCode,409);assert.equal(builtin.json().error,'builtin_template_readonly');
 }finally{await app.close();}
});

test('custom outputs fill required values, reject unknown/system overrides and unresolved inserted bookmarks',async()=>{
 const {app,base}=await setup();try{const initial=(await app.inject({url:base})).json(),saved=await app.inject({method:'POST',url:base,payload:custom(initial.revision)});assert.equal(saved.statusCode,200,saved.body);const url=base+'/'+saved.json().template.id+'/generate/docx';
 for(const [values,status,code] of [[{},409,'required_template_variable_missing'],[{'经办说明':'明确填写','未知值':'无'},400,'unknown_template_variable'],[{'基金名称':'伪造基金','经办说明':'明确填写'},400,'system_template_variable_override'],[{'经办说明':'{{残留书签}}'},400,'unresolved_template_bookmark']] as const){const r=await app.inject({method:'POST',url,payload:{templateVersion:1,values}});assert.equal(r.statusCode,status,r.body);assert.equal(r.json().error,code);}
 const valid=await app.inject({method:'POST',url,payload:{templateVersion:1,values:{'经办说明':'已由经办人明确填写 <&>'}}});assert.equal(valid.statusCode,200,valid.body);assert.match(valid.headers['content-type']!,/wordprocessingml/);const text=xml(valid.rawPayload);assert.match(text,/工程验收基金/);assert.match(text,/已由经办人明确填写 &lt;&amp;&gt;/);assert.doesNotMatch(text,/\{\{|\}\}/);
 }finally{await app.close();}
});

test('payment notices use the actual selected LP plan, partial payment balance, date and registered account in real DOCX and PDF',async()=>{
 const {app,base,investor}=await setup();try{const choices=await app.inject({url:base+'/generation-options'});assert.equal(choices.statusCode,200,choices.body);assert.equal(choices.json().investors[0].plans[0].remaining,'900.00');
 const payload={templateVersion:1,investorId:investor.id,planId:'real-plan',accountId:'registered-account',values:{}};
 const docx=await app.inject({method:'POST',url:base+'/payment-notice-draft/generate/docx',payload});assert.equal(docx.statusCode,200,docx.body);const text=xml(docx.rawPayload);for(const expected of ['工程验收基金','工程验收投资者','第一期出资','1200.00','300.00','900.00','2026-12-01','工程验收收款账户','622200001234567890','人工复核'])assert.ok(text.includes(expected),expected);assert.doesNotMatch(text,/\{\{|\}\}/);
 const pdf=await app.inject({method:'POST',url:base+'/payment-notice-draft/generate/pdf',payload});assert.equal(pdf.statusCode,200,pdf.body);assert.equal(pdf.rawPayload.subarray(0,5).toString(),'%PDF-');assert.equal(pdf.headers['content-type'],'application/pdf');
 }finally{await app.close();}
});

test('payment notices refuse missing or mismatched sources, cancelled/paid plans and spoofed names/account facts',async()=>{
 const {app,store,base,investor}=await setup();try{const payload={templateVersion:1,investorId:investor.id,planId:'real-plan',accountId:'registered-account',values:{}};
 for(const patch of [{investorId:undefined},{planId:undefined},{accountId:undefined},{investorId:'other-fund-investor'},{planId:'other-plan'},{accountId:'other-account'},{values:{'投资者名称':'伪造名称'}},{values:{'本期未缴金额':'0.01'}},{values:{'收款账号':'伪造账户'}}]){const r=await app.inject({method:'POST',url:base+'/payment-notice-draft/generate/docx',payload:{...payload,...patch}});assert.ok([400,404,409].includes(r.statusCode),r.body);}
 await store.lpTransaction(s=>{s.data.fundraising![investor.id].plans[0].cancelled=true;});const cancelled=await app.inject({method:'POST',url:base+'/payment-notice-draft/generate/docx',payload});assert.equal(cancelled.statusCode,409);assert.equal(cancelled.json().error,'payment_plan_unavailable');
 await store.lpTransaction(s=>{s.data.fundraising![investor.id].plans[0].cancelled=false;s.data.fundraising![investor.id].allocations[0].amount='1200.00';s.data.entries[0].amount='1200.00';});const paid=await app.inject({method:'POST',url:base+'/payment-notice-draft/generate/docx',payload});assert.equal(paid.statusCode,409);assert.equal(paid.json().error,'payment_plan_unavailable');
 }finally{await app.close();}
});

test('viewer reads only authorized templates; writes, LP choices and payment outputs require their distinct rights',async()=>{
 const {app,store,base,fund,investor}=await setup(true);try{const user={id:'template-viewer',name:'模板只读用户',email:'template-viewer@example.invalid',role:'viewer' as const},cookie=await registeredCookie(app,user,synthetic),headers={cookie};
 const read=await app.inject({url:base,headers});assert.equal(read.statusCode,200,read.body);assert.equal(read.json().canWrite,false);
 const write=await app.inject({method:'POST',url:base,headers,payload:custom(read.json().revision)});assert.equal(write.statusCode,403);
 assert.equal((await app.inject({url:base+'/generation-options',headers})).statusCode,403);
 const generated=await app.inject({method:'POST',url:base+'/payment-notice-draft/generate/docx',headers,payload:{templateVersion:1,investorId:investor.id,planId:'real-plan',accountId:'registered-account',values:{}}});assert.equal(generated.statusCode,403);
 await store.accessTransaction(s=>{s.data.funds[fund.id]={visibility:'members',memberIds:[],revision:2};});assert.equal((await app.inject({url:base,headers})).statusCode,403);
 }finally{await app.close();}
});

test('concurrent template saves using one lifecycle revision cannot both win',async()=>{
 const {app,base}=await setup();try{const initial=(await app.inject({url:base})).json();const results=await Promise.all([app.inject({method:'POST',url:base,payload:custom(initial.revision,{name:'并发模板甲'})}),app.inject({method:'POST',url:base,payload:custom(initial.revision,{name:'并发模板乙'})})]);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);const visible=(await app.inject({url:base})).json();assert.equal(visible.templates.filter((t:any)=>!t.builtin).length,1);assert.equal(visible.revision,initial.revision+1);
 }finally{await app.close();}
});


test('a plan with excluded or invalid payment evidence is not silently treated as wholly unpaid',async()=>{
 const {app,store,base,investor}=await setup();try{await store.lpTransaction(s=>{s.data.entries[0].dataOrigin='seed_demo';});
 const choices=await app.inject({url:base+'/generation-options'});assert.equal(choices.statusCode,200,choices.body);assert.deepEqual(choices.json().investors[0].plans,[]);
 const response=await app.inject({method:'POST',url:base+'/payment-notice-draft/generate/docx',payload:{templateVersion:1,investorId:investor.id,planId:'real-plan',accountId:'registered-account',values:{}}});assert.equal(response.statusCode,409,response.body);assert.equal(response.json().error,'payment_plan_unavailable');
 }finally{await app.close();}
});


test('unallocated incoming receipts must be reconciled before a payment notice requests more money',async()=>{
 const {app,store,base,investor}=await setup();try{await store.lpTransaction(s=>{s.data.fundraising![investor.id].allocations=[];});const response=await app.inject({method:'POST',url:base+'/payment-notice-draft/generate/docx',payload:{templateVersion:1,investorId:investor.id,planId:'real-plan',accountId:'registered-account',values:{}}});assert.equal(response.statusCode,409,response.body);assert.equal(response.json().error,'payment_plan_unavailable');
 }finally{await app.close();}
});

test('ordinary template output is projected before ZIP bytes and still enforces fund scope',async()=>{
 const {app,store,base,fund}=await setup(true);const admin=await registeredCookie(app,{id:'template-projection-admin',name:'模板管理员',email:'template-projection-admin@example.invalid',role:'admin'},synthetic),reader=await registeredCookie(app,{id:'template-projection-reader',name:'模板只读',email:'template-projection-reader@example.invalid',role:'viewer'},synthetic);
 try{const initial=(await app.inject({url:base,headers:{cookie:admin}})).json();const saved=await app.inject({method:'POST',url:base,headers:{cookie:admin},payload:custom(initial.revision)});assert.equal(saved.statusCode,200,saved.body);
 await store.lpTransaction(s=>{s.investors.push({...s.investors[0],id:'template-short-a',name:'A'},{...s.investors[0],id:'template-short-b',name:'B'});});const url=base+'/'+saved.json().template.id+'/generate/docx';const body={templateVersion:1,values:{'经办说明':'普通工作安排，不涉及投资者'}};
 const r=await app.inject({method:'POST',url,headers:{cookie:reader},payload:body});assert.equal(r.statusCode,200,r.headers['content-type']?.includes('json')?r.body:'binary incorrectly denied');assert.match(xml(r.rawPayload),/普通工作安排/);
 await store.accessTransaction(s=>{s.data.funds[fund.id]={visibility:'members',memberIds:[],revision:1};});assert.equal((await app.inject({method:'POST',url,headers:{cookie:reader},payload:body})).statusCode,403);
 }finally{await app.close();}
});
