import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {managementRecords,recordKinds} from '../src/ledger/record-management.ts';
const paths={company:'/api/companies',project:'/api/projects',fund:'/api/funds',material:'/api/materials',report:'/api/reports',capital:'/api/capital-records',intake:'/api/ai-intake-items'};
const fields={company:'companies',project:'projects',fund:'funds',material:'materials',report:'reports',capital:'capitalRecords',intake:'items'};
test('managed records preserve stored data; project/company cannot restore while other kinds retain restore',async t=>{
 const store=createMemoryLedgerStore(),app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());
 const company=await app.inject({method:'POST',url:'/api/companies',payload:{requestId:randomUUID(),name:'独立删除测试企业',shortName:'删除测试',industry:'测试'}});assert.equal(company.statusCode,201,company.body);
 await store.archiveMaterial({name:'独立删除测试材料.txt',type:'会议资料',uploader:'测试',time:'2026-11-04',source:'人工创建',status:'待复核',quotes:'0',project:store.listProjects()[0].name});
 for(const kind of recordKinds.filter(k=>k!=='investor')){
  const record=(await managementRecords(store,kind))[0];assert(record,kind);
  const count=(await managementRecords(store,kind)).length;
  let meta=(await app.inject('/api/record-management/'+kind)).json();const body={requestId:randomUUID(),expectedVersion:meta.versions[record.id]};
  const remove=await app.inject({method:'POST',url:`/api/record-management/${kind}/${record.id}/delete`,payload:body});assert.equal(remove.statusCode,200,remove.body);
  const rows=(await app.inject(paths[kind])).json()[fields[kind]];assert(!rows.some((r:any)=>r.id===record.id),kind);
  assert.equal((await managementRecords(store,kind)).length,count,'original data is retained');
  meta=(await app.inject('/api/record-management/'+kind)).json();
  if(kind==='project'||kind==='company'){
    assert.deepEqual(meta.records,[]);
    const restore=await app.inject({method:'POST',url:`/api/record-management/${kind}/${record.id}/restore`,payload:{requestId:randomUUID(),expectedVersion:meta.versions[record.id]}});assert.equal(restore.statusCode,409);assert.equal(restore.json().error,'record_restore_unavailable');
    assert.equal((await app.inject({method:'POST',url:`/api/record-management/${kind}/${record.id}/delete`,payload:body})).statusCode,200);
    continue;
  }
  assert(meta.records.some((r:any)=>r.id===record.id));
  const stale=await app.inject({method:'POST',url:`/api/record-management/${kind}/${record.id}/restore`,payload:{...body,requestId:randomUUID()}});assert.equal(stale.statusCode,409,stale.body);
  const restore=await app.inject({method:'POST',url:`/api/record-management/${kind}/${record.id}/restore`,payload:{requestId:randomUUID(),expectedVersion:meta.versions[record.id]}});assert.equal(restore.statusCode,200,restore.body);
  assert.equal((await app.inject({method:'POST',url:`/api/record-management/${kind}/${record.id}/delete`,payload:body})).statusCode,200);
  assert((await app.inject(paths[kind])).json()[fields[kind]].some((r:any)=>r.id===record.id),'late replay must not delete restored row');
 }
});
test('record management rejects unprivileged accounts and deleted parents cannot be edited or used for new work',async t=>{
 const store=createMemoryLedgerStore(),secret='record-management-fixture-secret',app=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret}});t.after(()=>app.close());
 const viewer=await registeredCookie(app,{id:'record-viewer',name:'只读',email:'record-viewer@example.test',role:'viewer'},secret);
 for(const kind of recordKinds)assert.equal((await app.inject({url:'/api/record-management/'+kind,headers:{cookie:viewer}})).statusCode,403);
 const admin=await registeredCookie(app,{id:'user-admin',name:'管理员',email:'admin@example.local',role:'admin'},secret),headers={cookie:admin};
 const p=store.listProjects()[0],meta=(await app.inject({url:'/api/record-management/project',headers})).json();
 assert.equal((await app.inject({method:'POST',url:`/api/record-management/project/${p.id}/delete`,headers,payload:{requestId:randomUUID(),expectedVersion:meta.versions[p.id]}})).statusCode,200);
 const write=await app.inject({method:'PATCH',url:'/api/projects/'+p.id,headers,payload:{}});assert.equal(write.statusCode,409);assert.equal(write.json().error,'record_deleted');const material=(await store.archiveMaterial({name:'被删项目关联测试.txt',type:'会议资料',uploader:'测试',time:'2026-11-04',source:'人工创建',status:'待复核',quotes:'0',project:p.name,projectId:p.id})).material;const association=await app.inject({method:'PUT',url:`/api/materials/${material.id}/projects`,headers,payload:{projectIds:[p.id]}});assert.equal(association.statusCode,409,association.body);
});
test('uploaded text remains intact after deletion and extracted text is visible only for the current active version',async t=>{
 const root=await mkdtemp(resolve(tmpdir(),'record-text-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=createMemoryLedgerStore(),app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'},materialStorageRoot:root});t.after(()=>app.close());
 const body=Buffer.from('独立测试识别正文 987654321'),q=new URLSearchParams({requestId:randomUUID(),name:'识别验收.txt',type:'验收',projectId:store.listProjects()[0].id});
 const uploaded=await app.inject({method:'POST',url:'/api/materials/upload?'+q,headers:{'content-type':'application/octet-stream'},payload:body});assert.equal(uploaded.statusCode,201,uploaded.body);const id=uploaded.json().material.id;
 const text=await app.inject(`/api/materials/${id}/extraction/text?page=1`);assert.equal(text.statusCode,200,text.body);assert.equal(text.json().text,body.toString());
 assert.equal((await app.inject(`/api/materials/${id}/extraction/text?page=0`)).statusCode,400);
 const meta=(await app.inject('/api/record-management/material')).json();assert.equal((await app.inject({method:'POST',url:`/api/record-management/material/${id}/delete`,payload:{requestId:randomUUID(),expectedVersion:meta.versions[id]}})).statusCode,200);
 assert.equal((await app.inject(`/api/materials/${id}/extraction/text?page=1`)).statusCode,404);
 const removed=(await app.inject('/api/record-management/material')).json();assert.equal((await app.inject({method:'POST',url:`/api/record-management/material/${id}/restore`,payload:{requestId:randomUUID(),expectedVersion:removed.versions[id]}})).statusCode,200);
 assert.equal((await app.inject(`/api/materials/${id}/extraction/text?page=1`)).json().text,body.toString());
});
test('custom template removal keeps all versions and restores without accepting stale state',async t=>{
 const store=createMemoryLedgerStore(),app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());const fund=store.listFunds()[0],base=`/api/funds/${fund.id}/document-templates`;
 const view=(await app.inject(base)).json();const made=await app.inject({method:'POST',url:base,payload:{requestId:randomUUID(),expectedRevision:view.revision,name:'可恢复模板',sections:[{title:'正文',text:'独立测试内容'}],variables:[]}});assert.equal(made.statusCode,200,made.body);const v=made.json(),id=v.template.id;
 const deletion={requestId:randomUUID(),expectedRevision:v.revision,expectedTemplateVersion:1};const d=await app.inject({method:'POST',url:base+'/'+id+'/delete',payload:deletion});assert.equal(d.statusCode,200,d.body);
 assert(!(await app.inject(base)).json().templates.some((x:any)=>x.id===id));assert((await app.inject(base+'?deleted=true')).json().templates.some((x:any)=>x.id===id));
 assert.equal((await app.inject({method:'POST',url:base+'/'+id+'/restore',payload:{requestId:randomUUID(),expectedRevision:d.json().revision,expectedTemplateVersion:1}})).statusCode,200);
 await app.inject({method:'POST',url:base+'/'+id+'/delete',payload:deletion});assert((await app.inject(base)).json().templates.some((x:any)=>x.id===id));
});
test('editing a pending meeting is retry-safe; stale edits and archived changes are rejected',async t=>{
 const store=createMemoryLedgerStore(),app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());const project=store.listProjects()[0];
 const input={requestId:randomUUID(),projectId:project.id,title:'待编辑纪要',date:'2026-11-04',attendees:'测试',summary:'编辑前的摘要',conclusions:[],todoItems:[],riskItems:[]};
 const made=(await app.inject({method:'POST',url:'/api/meetings',payload:input})).json().meeting;
 const edit={...input,summary:'编辑后的摘要',expectedRevision:made.revision};
 for(let i=0;i<2;i++){const r=await app.inject({method:'PATCH',url:'/api/meetings/'+made.id,payload:edit});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().meeting.summary,edit.summary);}
 assert.equal((await app.inject({method:'PATCH',url:'/api/meetings/'+made.id,payload:{...edit,summary:'旧页面试图覆盖'}})).statusCode,409);
 await app.inject({method:'POST',url:`/api/meetings/${made.id}/confirm`});assert.equal((await app.inject({method:'PATCH',url:'/api/meetings/'+made.id,payload:{...edit,expectedRevision:2}})).statusCode,409);
 assert.equal(store.listAuditEvents().filter(a=>a.action==='编辑会议纪要').length,1);
});
test('capital corrections preserve identity and source, keep an audit and reject stale conflicting edits',async t=>{
 const store=createMemoryLedgerStore(),app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());
 const input={fundId:store.listFunds()[0].id,fund:store.listFunds()[0].name,projectId:null,company:'独立资金编辑测试',received:'0元',date:'2026-11-04',rule:'独立测试',receivable:'100元',dueDate:'2026-12-01',status:'未收'};
 const made=await app.inject({method:'POST',url:'/api/capital-records',payload:input});assert.equal(made.statusCode,201,made.body);const record=made.json().capitalRecord;
 const change={...input,receivable:'120元',expectedUpdatedAt:record.updatedAt};for(let i=0;i<2;i++){const r=await app.inject({method:'PATCH',url:'/api/capital-records/'+record.id,payload:change});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().capitalRecord.id,record.id);assert.equal(r.json().capitalRecord.dataOrigin,record.dataOrigin);}
 assert.equal((await app.inject({method:'PATCH',url:'/api/capital-records/'+record.id,payload:{...change,receivable:'200元'}})).statusCode,409);
 assert.equal(store.listAuditEvents().filter(a=>a.action==='编辑资金事项').length,1);
});
test('write-capable users cannot list or restore records outside their object access scope',async t=>{
 const store=createMemoryLedgerStore(),secret='record-private-fixture-secret',app=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret}});t.after(()=>app.close());
 const fund=store.listFunds()[0];await store.accessTransaction(s=>{s.data.funds[fund.id]={visibility:'private',memberIds:[],revision:1};});
 const manager=await registeredCookie(app,{id:'unrelated-record-manager',name:'其他经理',email:'unrelated-record-manager@example.test',role:'investment_manager'},secret);
 const visible=await app.inject({url:'/api/record-management/fund',headers:{cookie:manager}});assert.equal(visible.statusCode,200,visible.body);assert.equal(visible.json().versions[fund.id],undefined);
 for(const action of ['delete','restore'])assert.equal((await app.inject({method:'POST',url:`/api/record-management/fund/${fund.id}/${action}`,headers:{cookie:manager},payload:{requestId:randomUUID(),expectedVersion:'a'.repeat(64)}})).statusCode,403);
});
test('uncommitted LP drafts can be removed and restored, while signed LPs retain their business history and privacy identities',async t=>{
 const store=createMemoryLedgerStore(),app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());const fund=store.listFunds()[0],base=`/api/funds/${fund.id}/investors`;
 const create=await app.inject({method:'POST',url:base,payload:{requestId:randomUUID(),name:'独立草稿LP',type:'机构'}});assert.equal(create.statusCode,200,create.body);const id=create.json().investor.id;
 const before=(await app.inject(base)).json();let meta=(await app.inject('/api/record-management/investor')).json();
 assert.equal((await app.inject({method:'POST',url:`/api/record-management/investor/${id}/delete`,payload:{requestId:randomUUID(),expectedVersion:meta.versions[id]}})).statusCode,200);
 const hidden=(await app.inject(base)).json();assert(!hidden.investors.some((i:any)=>i.id===id));assert.equal(hidden.totals.investorCount,before.totals.investorCount-1);assert((await store.readLpPrivacy()).identities.some(i=>i.name==='独立草稿LP'));
 meta=(await app.inject('/api/record-management/investor')).json();assert.equal((await app.inject({method:'POST',url:`/api/record-management/investor/${id}/restore`,payload:{requestId:randomUUID(),expectedVersion:meta.versions[id]}})).statusCode,200);assert.equal((await app.inject(base)).json().totals.investorCount,before.totals.investorCount);
 const signed=await app.inject({method:'POST',url:`/api/fund-investors/${id}/confirm-signature`,payload:{requestId:randomUUID(),expectedRevision:1}});assert.equal(signed.statusCode,200,signed.body);
 meta=(await app.inject('/api/record-management/investor')).json();const protectedResult=await app.inject({method:'POST',url:`/api/record-management/investor/${id}/delete`,payload:{requestId:randomUUID(),expectedVersion:meta.versions[id]}});assert.equal(protectedResult.statusCode,409,protectedResult.body);assert.equal(protectedResult.json().error,'investor_has_business_records');
});
