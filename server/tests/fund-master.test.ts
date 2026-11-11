import assert from 'node:assert/strict';
import test from 'node:test';
import {hashPassword} from '../src/auth/password.ts';
import {randomUUID} from 'node:crypto';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {writeFund,normalizeFundInput} from '../src/ledger/fund-master.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const actor={id:'manager-real',name:'真实经理',email:'real@example.test',role:'investment_manager' as const};
const input=()=>({requestId:randomUUID(),name:'同名基金',shortName:'同名',managerId:actor.id,stage:'募集期',scale:'规模尚未确认',nextAction:'核实协议'});
test('fund assignment cannot commit a write that removes the writer own object access',async t=>{
 const store=createMemoryLedgerStore(),secret='fund-access-assignment-regression',app=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret}});t.after(()=>app.close());
 const cookie=await registeredCookie(app,actor,secret),headers={cookie};
 await registeredCookie(app,{id:'user-demo-investment-manager',name:'其他负责人',email:'other-manager@example.test',role:'investment_manager'},secret);
 const send=(method:any,url:string,payload:any)=>app.inject({method,url,headers,payload});
 const before=JSON.stringify([store.listFunds(),store.listAuditEvents()]);
 const denied=await send('POST','/api/funds',{...input(),managerId:'user-demo-investment-manager'});
 assert.equal(denied.statusCode,409,denied.body);assert.equal(denied.json().error,'fund_access_assignment_conflict');
 assert.equal(JSON.stringify([store.listFunds(),store.listAuditEvents()]),before,'denied assignment must roll back the fund and audit');
 const created=await send('POST','/api/funds',input());assert.equal(created.statusCode,201,created.body);const fund=created.json().fund;
 const transfer=await send('PATCH','/api/funds/'+fund.id,{...input(),managerId:'user-demo-investment-manager',expectedRevision:fund.revision});assert.equal(transfer.statusCode,409,transfer.body);
 assert.equal(store.listFunds().find(f=>f.id===fund.id)!.managerId,actor.id);
 await store.accessTransaction(s=>{s.data.funds[fund.id]={visibility:'members',memberIds:[actor.id],revision:1};});
 const shared=await send('PATCH','/api/funds/'+fund.id,{...input(),managerId:'user-demo-investment-manager',expectedRevision:fund.revision});assert.equal(shared.statusCode,200,shared.body);assert.equal(shared.json().fund.managerId,'user-demo-investment-manager');
});
async function fixture(){const store=createMemoryLedgerStore();await store.insertUser({...actor,passwordHash:hashPassword("fund-test-password"),enabled:true});return store;}
test('fund master create/update: stable identity, duplicate names, unknown finance, receipt snapshots and revision races',async()=>{
 const store=await fixture();const body=input();const a=await writeFund(store,body,actor);assert.equal(a.created,true);assert.equal(a.fund.revision,1);assert.equal(a.fund.balance,'待确认');
 const b=await writeFund(store,input(),actor);assert.notEqual(a.fund.id,b.fund.id);
 const update={...body,requestId:randomUUID(),name:'更新名称',expectedRevision:1};
 const results=await Promise.allSettled([writeFund(store,update,actor,a.fund.id),writeFund(store,{...update,requestId:randomUUID(),name:'竞争名称'},actor,a.fund.id)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failed=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.equal(failed.reason.code,'fund_revision_conflict');assert.equal(failed.reason.latest.revision,2);
 assert.deepEqual(await writeFund(store,body,actor),{...a,created:false});
 await assert.rejects(writeFund(store,body,{...actor,id:'other'}),{code:'fund_request_conflict'});
 assert.equal(store.listAuditEvents().filter(e=>e.targetId===a.fund.id).length,2);
});
test('strict validator, disabled and virtual manager, rollback leave no write or receipt',async()=>{
 const store=await fixture();const body=input();
 for(const patch of [{paidIn:'0'},{actor:'伪造'},{stage:'不存在'},{expectedRevision:1},{requestId:'bad'},{name:'\0'}])assert.throws(()=>normalizeFundInput({...body,...patch}));
 await store.accountTransaction(s=>{s.users[0].enabled=false;});
 await assert.rejects(writeFund(store,body,actor),{code:'invalid_fund_manager'});
 await assert.rejects(writeFund(store,{...body,managerId:'user-admin'},actor),{code:'invalid_fund_manager'});
 assert.equal(store.listFunds().length,1);
 await assert.rejects(store.fundTransaction(s=>{s.funds.length=0;throw Error('failure');}),/failure/);assert.equal(store.listFunds().length,1);
 await store.accountTransaction(s=>{s.users[0].enabled=true;});assert.equal((await writeFund(store,body,actor)).created,true);
});
test('rename preserves keyed relations and historic audit/documents and original finance labels',async()=>{
 const store=await fixture();const old=structuredClone(store.getFundDetail('fundapp-growth-i'))!;
 const result=await writeFund(store,{...input(),name:'重命名',expectedRevision:1},actor,old.fund.id);
 assert.equal(result.fund.id,old.fund.id);assert.equal(result.fund.paidIn,old.fund.paidIn);assert.deepEqual(store.getFundDetail(old.fund.id)!.documents,old.documents);
 assert.equal(store.listProjects()[0].fund,'重命名');assert.equal(store.getProjectDetail(store.listProjects()[0].id)!.project.fund,'重命名');
 for(const event of old.auditEvents)assert.deepEqual(store.listAuditEvents().find(e=>e.id===event.id),event);
});
test('API permissions, directory whitelist, validation and stale conflict DTO',async(t)=>{
 const store=await fixture();const secret='fund-test-session-secret';const server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret}});t.after(()=>server.close());
 const cookie=await registeredCookie(server,actor,secret);const body=input();
 assert.equal((await server.inject({method:'POST',url:'/api/funds',payload:body})).statusCode,401);
 const viewer=await registeredCookie(server,{id:'viewer',name:'只读',email:'v@test',role:'viewer'},secret);
 assert.equal((await server.inject({method:'POST',url:'/api/funds',headers:{cookie:viewer},payload:body})).statusCode,403);
 const directory=await server.inject({method:'GET',url:'/api/funds/managers',headers:{cookie}});assert.equal(directory.statusCode,200);assert.deepEqual(Object.keys(directory.json().users[0]).sort(),['email','enabled','id','name','role']);
 const created=await server.inject({method:'POST',url:'/api/funds',headers:{cookie},payload:body});assert.equal(created.statusCode,201,created.body);
 const id=created.json().fund.id;const update={...body,requestId:randomUUID(),expectedRevision:1};
 assert.equal((await server.inject({method:'PATCH',url:`/api/funds/${id}`,headers:{cookie},payload:update})).statusCode,200);
 const stale=await server.inject({method:'PATCH',url:`/api/funds/${id}`,headers:{cookie},payload:{...update,requestId:randomUUID()}});assert.equal(stale.statusCode,409);assert.equal(stale.json().latest.revision,2);assert.ok(!JSON.stringify(stale.json()).includes('passwordHash'));
});
test('capital uses selected fund ID and rejects ambiguous fund name without writes',async(t)=>{
 const store=await fixture();const a=await writeFund(store,input(),actor);await writeFund(store,input(),actor);
 const server=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>server.close());
 const body={company:'未关联项目',fund:a.fund.name,received:'0',date:'2026-10-30',rule:'合成规则',receivable:'10.00',dueDate:'2026-11-30',status:'未收'};
 const before=store.listCapitalRecords().length;
 const bad=await server.inject({method:'POST',url:'/api/capital-records',payload:body});assert.equal(bad.statusCode,409,bad.body);assert.equal(store.listCapitalRecords().length,before);
 const ok=await server.inject({method:'POST',url:'/api/capital-records',payload:{...body,fundId:a.fund.id}});assert.equal(ok.statusCode,201,ok.body);assert.equal(ok.json().capitalRecord.fundId,a.fund.id);
});
test('AI intake stable fund binding survives a later duplicate name; explicit invalid IDs never fall back',async(t)=>{
 const store=await fixture();const original=store.listFunds()[0];const item=store.listAiIntakeItems().find(i=>i.id==='meeting-20260608')!;
 assert.equal(item.suggestedFundId,original.id);
 const duplicate=await writeFund(store,{...input(),name:original.name,shortName:original.shortName},actor);
 assert.notEqual(duplicate.fund.id,original.id);
 const server=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>server.close());
 const archived=await server.inject({method:'POST',url:`/api/ai-intake-items/${item.id}/archive`});assert.equal(archived.statusCode,201,archived.body);assert.equal(archived.json().fundDocument.fundId,original.id);assert.equal(archived.json().material.fundId,original.id);
 assert.equal(store.getFundDetail(duplicate.fund.id)!.documents.length,0);
 const payload={...item,id:'new-ai-duplicate',suggestedFundId:undefined};delete payload.dataPurpose;delete payload.sourceBasis;
 const before=store.listAiIntakeItems().length;
 const ambiguous=await server.inject({method:'POST',url:'/api/ai-intake-items',payload});assert.equal(ambiguous.statusCode,410,ambiguous.body);assert.equal(store.listAiIntakeItems().length,before);
 const patch={suggestedFund:original.name,suggestedProject:item.suggestedProject,suggestedPath:item.suggestedPath};
 assert.equal((await server.inject({method:'PATCH',url:`/api/ai-intake-items/${item.id}/suggestion`,payload:patch})).statusCode,409);
 for(const method of ['POST','PATCH'] as const){const r=await server.inject({method,url:method==='POST'?'/api/ai-intake-items':`/api/ai-intake-items/${item.id}/suggestion`,payload:{...(method==='POST'?payload:patch),suggestedFundId:'missing-id'}});assert.equal(r.statusCode,method==='POST'?410:409,r.body);}
 const selected=await store.createAiIntakeItem({...payload,suggestedFundId:duplicate.fund.id});assert.equal(selected.item.suggestedFundId,duplicate.fund.id);
 const secondArchive=await server.inject({method:'POST',url:`/api/ai-intake-items/${payload.id}/archive`});assert.equal(secondArchive.statusCode,201,secondArchive.body);assert.equal(secondArchive.json().material.fundId,duplicate.fund.id);
 // A broken stored ID must not resolve through the otherwise valid display label.
 store.listAiIntakeItems().find(i=>i.id===payload.id)!.suggestedFundId='missing-id';
 const broken=await server.inject({method:'POST',url:`/api/ai-intake-items/${payload.id}/archive`});assert.equal(broken.statusCode,404,broken.body);assert.equal(broken.json().error,'fund_not_found');
});
