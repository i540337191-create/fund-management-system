import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {writeCompany,writeProjectMaster} from '../src/ledger/company-project-master.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const actor={id:'user-admin',name:'管理员'};
const company=()=>({requestId:randomUUID(),name:'独立企业',shortName:'企业',industry:'制造'});
const metadata=(p:{name:string;shortName:string;industry:string;description:string})=>({requestId:randomUUID(),expectedRevision:1,name:p.name,shortName:p.shortName,industry:p.industry,description:p.description});
const create=(companyId?:string)=>({requestId:randomUUID(),name:'同一项目名',shortName:'项目',industry:'制造',fundId:'fundapp-growth-i',manager:'',collaborators:'',sourceChannel:'',description:'初始描述',...(companyId?{companyId}:{})});

test('company and two projects keep independent names and stable ids; retry is actor, payload and target bound',async t=>{
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>server.close());
 const input=company();const created=await server.inject({method:'POST',url:'/api/companies',payload:input});assert.equal(created.statusCode,201,created.body);
 const c=created.json().company;assert.equal(c.revision,1);assert.equal(c.dataOrigin,'user_input');
 const retry=await server.inject({method:'POST',url:'/api/companies',payload:input});assert.deepEqual(retry.json(),{...created.json(),created:false});
 const a=(await store.createProject(create(c.id),actor)).project,b=(await store.createProject(create(c.id),actor)).project;
 const edit={...metadata(a),name:'项目甲新名',companyId:c.id};
 const edited=await server.inject({method:'PATCH',url:`/api/projects/${a.id}`,payload:edit});assert.equal(edited.statusCode,200,edited.body);assert.equal(edited.json().project.masterRevision,2);
 const rename={...input,requestId:randomUUID(),expectedRevision:1,name:'企业新名'};
 const renamed=await server.inject({method:'PATCH',url:`/api/companies/${c.id}`,payload:rename});assert.equal(renamed.statusCode,200,renamed.body);
 const detail=(await server.inject(`/api/companies/${c.id}`)).json();assert.equal(detail.company.name,'企业新名');assert.equal(detail.company.revision,2);
 assert.deepEqual(detail.projects.map((p:{id:string})=>p.id).sort(),[a.id,b.id].sort());
 assert.equal(store.getProjectDetail(a.id)!.project.name,'项目甲新名');assert.equal(store.getProjectDetail(b.id)!.project.name,'同一项目名');
 assert.equal(store.getProjectDetail(a.id)!.project.companyId,c.id);
 const duplicate=await server.inject({method:'POST',url:'/api/companies',payload:{...company(),name:'企业新名'}});assert.equal(duplicate.statusCode,409);assert.equal(duplicate.json().error,'company_name_conflict');
 assert.equal(store.listCompanies().length,1);
 const conflict=await server.inject({method:'PATCH',url:`/api/projects/${b.id}`,payload:edit});assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error,'master_request_conflict');
 const replay=await server.inject({method:'PATCH',url:`/api/projects/${a.id}`,payload:edit});assert.deepEqual(replay.json(),edited.json());
});

test('strict metadata boundaries reject forbidden business and legal fields without mutation',async t=>{
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>server.close());const p=store.listProjects()[0];
 const before=JSON.stringify([store.listProjects(),store.listCompanies(),store.listAuditEvents()]);
 for(const patch of [{ownerId:'forged'},{manager:'forged'},{managerLabel:'forged'},{fundId:'other'},{stage:'退出'},{status:'已投'},{amount:'1 元'},{companyId:''},{companyId:'id',newCompany:{name:'name',shortName:'short',industry:''}},{expectedRevision:0},{requestId:'bad'},{name:'x'.repeat(201)},{description:'\0'},{actor:'伪造'},{toString:'bad'}]){
 const r=await server.inject({method:'PATCH',url:`/api/projects/${p.id}`,payload:{...metadata(p),...patch}});assert.equal(r.statusCode,400,r.body);
 }
 for(const patch of [{creditCode:'invented'},{legalRepresentative:'invented'},{description:'not an existing column'},{revision:4},{name:' '},{shortName:null},{industry:[]},{expectedRevision:1},{requestId:'not-uuid'}]){
 const r=await server.inject({method:'POST',url:'/api/companies',payload:{...company(),...patch}});assert.equal(r.statusCode,400,r.body);
 }
 assert.equal(JSON.stringify([store.listProjects(),store.listCompanies(),store.listAuditEvents()]),before);
});

test('unbound project explicitly creates and binds company atomically; missing targets and rebind leave no orphan',async t=>{
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>server.close());const p=store.listProjects()[0];
 const meta={name:'明确选择企业',shortName:'明确',industry:'制造'};
 const missing=await server.inject({method:'PATCH',url:'/api/projects/missing',payload:{...metadata(p),newCompany:meta}});assert.equal(missing.statusCode,404);assert.equal(store.listCompanies().length,0);
 const created=await server.inject({method:'PATCH',url:`/api/projects/${p.id}`,payload:{...metadata(p),newCompany:meta}});assert.equal(created.statusCode,200,created.body);
 const c=store.listCompanies()[0];assert.equal(created.json().project.companyId,c.id);assert.equal(created.json().project.id,p.id);
 const before=JSON.stringify([store.listCompanies(),store.listProjects(),store.listAuditEvents()]);
 const rebind=await server.inject({method:'PATCH',url:`/api/projects/${p.id}`,payload:{...metadata(p),expectedRevision:2,newCompany:{...meta,name:'不得留下孤儿'}}});assert.equal(rebind.statusCode,409);assert.equal(rebind.json().error,'project_company_rebind_forbidden');
 assert.equal(JSON.stringify([store.listCompanies(),store.listProjects(),store.listAuditEvents()]),before);
 const failedCreation=await server.inject({method:'POST',url:'/api/projects',payload:{...create(),fundId:'missing',newCompany:{...meta,name:'失败创建'}}});assert.equal(failedCreation.statusCode,404);assert.equal(store.listCompanies().length,1);
 const duplicate=await server.inject({method:'POST',url:'/api/projects',payload:{...create(),newCompany:meta}});assert.equal(duplicate.statusCode,409);assert.equal(store.listProjects().length,1);
 const success=await server.inject({method:'POST',url:'/api/projects',payload:{...create(),newCompany:{...meta,name:'新建企业'}}});assert.equal(success.statusCode,201,success.body);assert.equal(store.listCompanies().length,2);assert.equal(store.listProjects().length,2);
 assert.equal(store.listAuditEvents().filter(e=>e.action==='新增企业').length,2);
});

test('optimistic races accept one writer and return latest whitelist; identical concurrent requests write once',async()=>{
 const store=createMemoryLedgerStore(),p=store.listProjects()[0],body=metadata(p);
 const results=await Promise.allSettled([writeProjectMaster(store,p.id,{...body,name:'甲'},actor),writeProjectMaster(store,p.id,{...body,requestId:randomUUID(),name:'乙'},actor)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const error=(results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason;assert.equal(error.code,'project_revision_conflict');assert.equal(error.latest.masterRevision,2);assert.deepEqual(Object.keys(error.latest).sort(),['id','name','shortName','industry','description','companyId','masterRevision','customFields','schemaRevision'].sort());
 const retryBody={...metadata(p),expectedRevision:2,name:'第三稿'};
 const repeated=await Promise.all(Array.from({length:5},()=>writeProjectMaster(store,p.id,retryBody,actor)));assert.equal(repeated[0].project!.masterRevision,3);for(const result of repeated)assert.deepEqual(result,repeated[0]);
 assert.equal(store.listAuditEvents().filter(e=>e.action==='修改项目主档').length,2);
 const c=(await writeCompany(store,company(),actor)).company!;
 const change={...company(),name:'修改公司',expectedRevision:1};
 const companyResults=await Promise.allSettled([writeCompany(store,change,actor,c.id),writeCompany(store,{...change,requestId:randomUUID(),name:'冲突公司'},actor,c.id)]);
 assert.equal(companyResults.filter(r=>r.status==='fulfilled').length,1);const companyError=(companyResults.find(r=>r.status==='rejected') as PromiseRejectedResult).reason;assert.equal(companyError.code,'company_revision_conflict');assert.equal(companyError.latest.revision,2);
});

test('company and project metadata require project write permission and actor-specific receipt replay',async t=>{
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:'master-test-secret'}});t.after(()=>server.close());
 const p=store.listProjects()[0];const viewer=await registeredCookie(server,{id:'viewer',name:'viewer',email:'viewer@test',role:'viewer'},'master-test-secret');
 for(const route of [{method:'POST' as const,url:'/api/companies',payload:company()},{method:'PATCH' as const,url:`/api/companies/unknown`,payload:{...company(),expectedRevision:1}},{method:'PATCH' as const,url:`/api/projects/${p.id}`,payload:metadata(p)}]){
 assert.equal((await server.inject(route)).statusCode,401);assert.equal((await server.inject({...route,headers:{cookie:viewer}})).statusCode,403);
 }
 const body=company();await writeCompany(store,body,actor);await assert.rejects(writeCompany(store,body,{...actor,id:'different'}),{code:'master_request_conflict'});
 assert.equal((await server.inject({url:'/api/companies',headers:{cookie:viewer}})).statusCode,200);
});

test('renames preserve actual linked history and global unbound labels without claiming a matching name',async t=>{
 const state=createSeedLedgerState(),p=state.projects[0];state.materials.push({...state.materials[0],id:'unbound-original',projectId:null,fundId:null,project:p.name,relationships:{projects:[],funds:[],companies:[],investors:[]}});
 state.meetings.push({...state.meetings[0],id:'unbound-meeting',projectId:null,project:p.name});
 state.risks=[{id:'risk-stable',projectId:p.id,title:'风险',target:p.name,type:'经营',level:'中',source:'记录',time:'2026-10-30',status:'待处理',summary:'保留'}];
 const store=createMemoryLedgerStore(state),server=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>server.close());
 const original=JSON.stringify({materials:store.listMaterials(),meetings:store.listMeetings(),capital:store.listCapitalRecords()});const before=store.getProjectDetail(p.id)!;
 await writeProjectMaster(store,p.id,{...metadata(p),name:'全新展示名称',shortName:'新简称'},actor);
 const detail=(await server.inject(`/api/projects/${p.id}`)).json();assert.equal(detail.project.id,p.id);assert.deepEqual(detail.materials.map((m:{id:string})=>m.id),before.materials.map(m=>m.id));assert.deepEqual(detail.meetings.map((m:{id:string})=>m.id),before.meetings.map(m=>m.id));assert.deepEqual(detail.capitalRecords,before.capitalRecords);assert.equal(detail.risks[0].id,'risk-stable');
 assert.ok(!detail.materials.some((m:{id:string})=>m.id==='unbound-original'));assert.ok(!detail.meetings.some((m:{id:string})=>m.id==='unbound-meeting'));assert.equal(JSON.stringify({materials:store.listMaterials(),meetings:store.listMeetings(),capital:store.listCapitalRecords()}),original);
});

test('metadata queued during workflow approval and material upload preserves both committed states',async()=>{
 const store=createMemoryLedgerStore(),p=store.listProjects()[0];let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(resolve=>enter=resolve),gate=new Promise<void>(resolve=>release=resolve);
 const workflow=store.workflowTransaction(p.id,async s=>{enter();await gate;s.project.stage='尽调';s.project.latest='审批通过';s.project.ownerId='governed-owner';return s.project.id;});await entered;
 const edit=writeProjectMaster(store,p.id,{...metadata(p),name:'编辑后项目'},actor);
 const upload=store.uploadMaterial({requestId:randomUUID(),versionId:randomUUID(),name:'identity.pdf',type:'其他资料',projectId:p.id,sizeBytes:10,sha256:'a'.repeat(64),mimeType:'application/pdf',actor});release();
 const [,saved,uploaded]=await Promise.all([workflow,edit,upload]);const detail=store.getProjectDetail(p.id)!;
 assert.equal(detail.project.name,'编辑后项目');assert.equal(detail.project.masterRevision,2);assert.equal(detail.project.stage,'尽调');assert.equal(detail.project.ownerId,'governed-owner');assert.equal(detail.project.latest,'审批通过');assert.equal(saved.project!.stage,'尽调');assert.ok(detail.materials.some(m=>m.id===uploaded.material.id));
 await store.workflowTransaction(p.id,async s=>{s.project.stage='谈判';return null;});assert.equal(store.getProjectDetail(p.id)!.project.name,'编辑后项目');assert.equal(store.getProjectDetail(p.id)!.project.masterRevision,2);
});

test('capital uses explicit project ids and explicit null; legacy same-name lookup rejects ambiguity',async t=>{
 const store=createMemoryLedgerStore(),p=store.listProjects()[0];const second=(await store.createProject({...create(),name:p.name,shortName:p.shortName},actor)).project;
 const server=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>server.close());
 const base={company:p.name,fund:'原始基金标签',fundId:p.fundId,received:'0',date:'2026-10-30',rule:'规则',receivable:'10.00',dueDate:'2026-10-31',status:'未收'};
 const exact=await server.inject({method:'POST',url:'/api/capital-records',payload:{...base,company:'未跟随项目改名的历史标签',projectId:second.id}});assert.equal(exact.statusCode,201,exact.body);assert.equal(exact.json().capitalRecord.projectId,second.id);assert.equal(exact.json().capitalRecord.company,'未跟随项目改名的历史标签');assert.equal(exact.json().capitalRecord.fundId,p.fundId);
 const unbound=await server.inject({method:'POST',url:'/api/capital-records',payload:{...base,projectId:null}});assert.equal(unbound.statusCode,201,unbound.body);assert.equal(unbound.json().capitalRecord.projectId,null);
 const before=JSON.stringify(store.listCapitalRecords());
 const missing=await server.inject({method:'POST',url:'/api/capital-records',payload:{...base,projectId:'missing'}});assert.equal(missing.statusCode,404);assert.equal(missing.json().error,'project_not_found');
 const ambiguous=await server.inject({method:'POST',url:'/api/capital-records',payload:base});assert.equal(ambiguous.statusCode,409);assert.equal(ambiguous.json().error,'project_ambiguous');
 for(const value of ['',42,{},'bad\0'])assert.equal((await server.inject({method:'POST',url:'/api/capital-records',payload:{...base,projectId:value}})).statusCode,400);
 assert.equal(JSON.stringify(store.listCapitalRecords()),before);
 await writeProjectMaster(store,second.id,{...metadata(second),name:'新项目名称',shortName:'新简称'},actor);
 const detail=store.getProjectDetail(second.id)!;assert.equal(detail.capitalRecords.length,1);assert.equal(detail.capitalRecords[0].id,exact.json().capitalRecord.id);assert.equal(detail.capitalRecords[0].company,'未跟随项目改名的历史标签');assert.ok(!store.getProjectDetail(p.id)!.capitalRecords.some(r=>r.id===exact.json().capitalRecord.id));
});

test('new projects display an unrecorded investment amount for every company path; existing zero labels remain untouched',async()=>{
 const state=createSeedLedgerState();state.projects[0].amount='0 元';const historical=structuredClone(state.projects[0]);const store=createMemoryLedgerStore(state);
 const c=(await writeCompany(store,company(),actor)).company!;
 for(const binding of [{},{companyId:c.id},{newCompany:{name:'新金额标签企业',shortName:'金额',industry:''}}]){
  const result=await store.createProject({...create(),...binding},actor);assert.equal(result.project.amount,'未录入');assert.equal(store.getProjectDetail(result.project.id)!.project.amount,'未录入');
 }
 assert.equal(store.getProjectDetail(historical.id)!.project.amount,'0 元');await writeProjectMaster(store,historical.id,{...metadata(historical),name:'仅修改历史项目名称'},actor);assert.equal(store.getProjectDetail(historical.id)!.project.amount,'0 元');
});
