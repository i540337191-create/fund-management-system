import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {writeCompany,writeProjectMaster} from '../src/ledger/company-project-master.ts';
import {emptySchemas,customView,validateCustom,writeSchema,type Field} from '../src/ledger/custom-fields.ts';
const admin={id:'user-admin',name:'管理员',role:'admin'};
const field=(id:string,type:Field['type']='text',required=false):Field=>({id,label:id,type,required,enabled:true,order:0,options:type==='singleChoice'?[{id:'a',label:'甲',enabled:true}]:[]});
const company=()=>({requestId:randomUUID(),name:randomUUID(),shortName:'企业',industry:''});
const change=(store:ReturnType<typeof createMemoryLedgerStore>,kind:'company'|'project'|'fund',expectedRevision:number,fields:Field[])=>writeSchema(store,kind,{requestId:randomUUID(),expectedRevision,fields},admin);
test('custom values: decimal zero, false, strict dates, unknown and dangerous keys',()=>{
 const schema={schemaRevision:1,fields:[field('n','number',true),field('b','boolean',true),field('d','date')]};
 assert.deepEqual(validateCustom(schema,{schemaRevision:1,customFields:{n:0 as never,b:false,d:'2024-02-29'}}).customFields,{n:'0',b:false,d:'2024-02-29'});
 for(const values of [{n:'NaN',b:false},{n:'1',b:false,d:'2025-02-29'},{n:9007199254740992,b:false},{n:'1',b:false,name:'bad'},JSON.parse('{"__proto__":"bad"}')])assert.throws(()=>validateCustom(schema,{schemaRevision:1,customFields:values as never}));
});
test('required policy, disabled historical options, immutable schema, replay across schema, object isolation',async()=>{
 const s=createMemoryLedgerStore(),old=(await writeCompany(s,company(),admin)).company!;
 await change(s,'company',0,[field('required','text',true),field('choice','singleChoice')]);
 await assert.rejects(writeCompany(s,{...company(),schemaRevision:1},admin),{code:'required_custom_field'});
 const patch={...company(),expectedRevision:1,schemaRevision:1};await writeCompany(s,patch,admin,old.id);
 const input={...company(),schemaRevision:1,customFields:{required:'yes',choice:'a'}};const made=await writeCompany(s,input,admin);
 await change(s,'company',1,[field('required','text',true),{...field('choice','singleChoice'),options:[{id:'a',label:'甲',enabled:false},{id:'b',label:'乙',enabled:true}]}]);
 assert.deepEqual(await writeCompany(s,input,admin),{...made,created:false});
 await assert.rejects(writeCompany(s,{...company(),schemaRevision:1,customFields:{required:'yes'}},admin),{code:'custom_schema_revision_conflict'});
 await assert.rejects(writeCompany(s,{...company(),expectedRevision:1,schemaRevision:2,customFields:{required:null}},admin,made.company!.id),{code:'required_custom_field'});
 await assert.rejects(writeCompany(s,{...company(),expectedRevision:1,schemaRevision:2,customFields:{choice:'a'}},admin,made.company!.id),{code:'invalid_custom_option'});
 await writeCompany(s,{...company(),expectedRevision:1,schemaRevision:2},admin,made.company!.id);
 assert.equal(s.listCompanies().find(c=>c.id===made.company!.id)!.customFields!.choice,'a');
 await assert.rejects(change(s,'company',2,[field('required','number',true),field('choice','singleChoice')]),{code:'custom_field_type_immutable'});
 assert.equal((await s.masterTransaction(x=>x.schemas)).fund.schemaRevision,0);
 await assert.rejects(async()=>writeSchema(s,'fund',{requestId:randomUUID(),expectedRevision:0,fields:[]},{...admin,role:'viewer'}),{code:'forbidden'});
});
test('project bound/unbound creation and nested company validation roll back together; concurrent schema edits serialize',async()=>{
 const s=createMemoryLedgerStore();await change(s,'project',0,[field('p','boolean',true)]);await change(s,'company',0,[field('c','text',true)]);
 const input=()=>({requestId:randomUUID(),name:'项目',shortName:'项',industry:'科技',fundId:s.listFunds()[0].id,manager:'',collaborators:'',sourceChannel:'',description:'',schemaRevision:1,customFields:{p:false}});
 const count=s.listProjects().length;
 await assert.rejects(s.createProject({...input(),newCompany:{name:'新企',shortName:'企',industry:'',schemaRevision:1}},admin),{code:'required_custom_field'});assert.equal(s.listProjects().length,count);assert.equal(s.listCompanies().some(c=>c.name==='新企'),false);
 const unbound=await s.createProject(input(),admin);assert.equal(unbound.project.customFields!.p,false);
 const bound=await s.createProject({...input(),newCompany:{name:'新企',shortName:'企',industry:'',schemaRevision:1,customFields:{c:'值'}}},admin);assert.ok(bound.project.companyId);
 const update={requestId:randomUUID(),expectedRevision:1,schemaRevision:1,name:'改',shortName:'改',industry:'科技',description:''};await writeProjectMaster(s,bound.project.id,update,admin);
 const results=await Promise.allSettled([change(s,'project',1,[field('p','boolean',true)]),change(s,'project',1,[field('p','boolean',true)])]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});

test('HTTP schema admin boundary, schema conflict and consistent list/detail/export snapshot',async t=>{
 const {createTestServer,registeredCookie}=await import('./auth-fixture.ts');
 const s=createMemoryLedgerStore(),server=createTestServer({ledgerStore:s,auth:{mode:'password',sessionSecret:'custom-test-secret'}});t.after(()=>server.close());
 const cookie=await registeredCookie(server,{id:'viewer',name:'读者',email:'viewer@test',role:'viewer'},'custom-test-secret');
 const result=await server.inject({method:'PUT',url:'/api/custom-field-schemas/company',headers:{cookie},payload:{requestId:randomUUID(),expectedRevision:0,fields:[]}});assert.equal(result.statusCode,403,result.body);
 const local=createTestServer({ledgerStore:s,auth:{mode:'local-bypass'}});t.after(()=>local.close());
 let response=await local.inject({method:'PUT',url:'/api/custom-field-schemas/company',payload:{requestId:randomUUID(),expectedRevision:0,fields:[field('n','number')]}});assert.equal(response.statusCode,200,response.body);
 response=await local.inject({method:'PUT',url:'/api/custom-field-schemas/company',payload:{requestId:randomUUID(),expectedRevision:0,fields:[]}});assert.equal(response.statusCode,409);
 const created=await local.inject({method:'POST',url:'/api/companies',payload:{...company(),schemaRevision:1,customFields:{n:'000.000'}}});assert.equal(created.statusCode,201,created.body);
 const id=created.json().company.id;
 for(const path of ['/api/companies',`/api/companies/${id}`,'/api/custom-field-export/company']){const r=await local.inject(path);assert.equal(r.statusCode,200,r.body);const json=r.json(),record=json.company??(json.companies??json.records).find((x:{id:string})=>x.id===id);assert.equal(record.customFields.n,'0');assert.equal(record.customFieldSchema.schemaRevision,1);}
});

test('fund core/custom failure is atomic; zero and required values survive unrelated edits',async()=>{
 const {writeFund}=await import('../src/ledger/fund-master.ts');const s=createMemoryLedgerStore();
 await change(s,'fund',0,[field('n','number',true)]);
 const manager={id:'manager',name:'经理',email:'manager@test',role:'investment_manager' as const,enabled:true,revision:1,passwordHash:null};await s.accountTransaction(state=>{state.users.push(manager);});
 const input={requestId:randomUUID(),name:'基金',shortName:'基金',managerId:'manager',stage:'投资期',scale:'',nextAction:'',schemaRevision:1,customFields:{n:'0'}};
 const created=await writeFund(s,input,admin);assert.equal(created.fund.customFields!.n,'0');
 const before=structuredClone(s.listFunds());await assert.rejects(writeFund(s,{...input,requestId:randomUUID(),name:'不应保存',expectedRevision:1,customFields:{n:null}},admin,created.fund.id),{code:'required_custom_field'});assert.deepEqual(s.listFunds(),before);
 await change(s,'fund',1,[field('n','number',true),field('later','text',true)]);
 await assert.rejects(writeFund(s,{...input,requestId:randomUUID(),expectedRevision:1},admin,created.fund.id),{code:'custom_schema_revision_conflict'});
 assert.deepEqual(await writeFund(s,input,admin),{...created,created:false});
 const updated=await writeFund(s,{...input,requestId:randomUUID(),expectedRevision:1,schemaRevision:2,customFields:undefined},admin,created.fund.id);assert.equal(updated.fund.customFields!.n,'0');
});

test('historical audit-only unbound creation replays before new required schema',async()=>{
 const {normalizeProjectInput}=await import('../src/ledger/store.ts');const s=createMemoryLedgerStore();
 const raw={requestId:randomUUID(),name:'历史项目',shortName:'历史',industry:'科技',fundId:s.listFunds()[0].id,manager:'',collaborators:'',sourceChannel:'',description:''};const input=normalizeProjectInput(raw);
 const original=s.listProjects()[0];const historical={...original,id:`project-${input.requestId}`};
 await s.masterTransaction(state=>{state.projects.push(historical);state.auditEvents.push({id:randomUUID(),module:'项目账本',action:'新增项目',targetType:'项目',targetId:historical.id,targetName:historical.name,actor:admin.name,time:new Date().toISOString(),detail:JSON.stringify({actorId:admin.id,input})});});
 await change(s,'project',0,[field('new','text',true)]);
 const replay=await s.createProject(raw,admin);assert.equal(replay.created,false);assert.equal(replay.project.id,historical.id);
 await assert.rejects(s.createProject({...raw,name:'变更'},admin),{code:'project_request_conflict'});
});

test('custom enrichment preserves original projected DTO, registry purpose, filtering and export visibility',async t=>{
 const {createSeedLedgerState}=await import('../src/ledger/store.ts');const {createTestServer}=await import('./auth-fixture.ts');
 const initial=createSeedLedgerState(),p=initial.projects[0],f=initial.funds[0];
 const sourcePurposes=[['project',p.id],['fund',f.id]].map(([recordType,recordId])=>({recordType,recordId,dataPurpose:'engineering_fixture' as const,evidence:{test:true},classifiedBy:'test',classifiedAt:new Date().toISOString(),revision:1}));
 const original=createMemoryLedgerStore(initial,{sourcePurposes});
 // The master transaction deliberately supplies raw records lacking classification.
 const store={...original,masterTransaction:async(action:any)=>original.masterTransaction(state=>{const s=structuredClone(state);for(const row of [...s.projects,...s.funds]){delete row.dataPurpose;(row as any).privateRaw='must not escape';}return action(s);}),listProjects:()=>original.listProjects().filter(r=>r.id===p.id).map(({description,...r})=>({...r,derivedLabel:'project projection'})),listFunds:()=>original.listFunds().filter(r=>r.id===f.id).map(r=>({...r,derivedLabel:'fund projection'})),getProjectDetail:async(id:string)=>{const d=await original.getProjectDetail(id);if(!d)return d;const {description,...project}=d.project;return {...d,project:{...project,derivedLabel:'detail projection'}};}};
 const app=createTestServer({ledgerStore:store as never,auth:{mode:'local-bypass'}});t.after(()=>app.close());
 for(const [kind,id] of [['project',p.id],['fund',f.id]]){
  const plural=kind+'s',list=(await app.inject('/api/'+plural)).json()[plural];assert.equal(list.length,1);assert.equal(list[0].dataPurpose,'engineering_fixture');assert.equal(list[0].derivedLabel,kind+' projection');assert.equal(list[0].privateRaw,undefined);
  const exported=(await app.inject('/api/custom-field-export/'+kind)).json();assert.equal(exported.records.length,1);assert.equal(exported.records[0].id,id);assert.equal(exported.records[0].dataPurpose,'engineering_fixture');assert.equal(exported.records[0].derivedLabel,kind+' projection');assert.equal(exported.records[0].privateRaw,undefined);
 }
 const detail=(await app.inject('/api/projects/'+p.id)).json().project;assert.equal(detail.description,undefined);assert.equal(detail.derivedLabel,'detail projection');assert.equal(detail.dataPurpose,'engineering_fixture');assert.equal(detail.privateRaw,undefined);
});

test('required whitespace is missing without rewriting text, zero or false; legacy whitespace remains editable',()=>{
 const {company:schema}=emptySchemas();schema.schemaRevision=1;schema.fields=[field('t','text',true),field('n','number',true),field('b','boolean',true)];
 for(const t of [' ','\n\t'])assert.throws(()=>validateCustom(schema,{schemaRevision:1,customFields:{t,n:'0',b:false}}),{code:'required_custom_field'});
 assert.throws(()=>validateCustom(schema,{schemaRevision:1,customFields:{t:' \n '}},{customFields:{t:'filled',n:'0',b:false}}),{code:'required_custom_field'});
 const old={schemaRevision:1,customFields:{t:' \n ',n:'0',b:false}};assert.deepEqual(customView(schema,old).missingCustomFields,['t']);assert.equal(validateCustom(schema,{schemaRevision:1},old).customFields!.t,' \n ');
 assert.equal(validateCustom(schema,{schemaRevision:1,customFields:{t:' value ',n:'0',b:false}}).customFields!.t,' value ');
});

test('enabled single choice must remain fillable; disabling entire field preserves historical value',async()=>{
 const s=createMemoryLedgerStore();for(const options of [[],[{id:'a',label:'甲',enabled:false}]])await assert.rejects(change(s,'company',0,[{...field('choice','singleChoice',true),options}]),{code:'unfillable_custom_choice'});
 await change(s,'company',0,[field('choice','singleChoice',true)]);const created=await writeCompany(s,{...company(),schemaRevision:1,customFields:{choice:'a'}},admin);
 await change(s,'company',1,[{...field('choice','singleChoice',true),enabled:false,options:[{id:'a',label:'甲',enabled:false}]}]);
 const updated=await writeCompany(s,{...company(),expectedRevision:1,schemaRevision:2},admin,created.company!.id);assert.equal(updated.company!.customFields!.choice,'a');
});

test('export holds master lock across asynchronous authorized projection and cannot mix old core/new custom',async t=>{
 const {createTestServer}=await import('./auth-fixture.ts');const original=createMemoryLedgerStore();
 await change(original,'company',0,[field('v')]);const companyInput={...company(),name:'旧名称',schemaRevision:1,customFields:{v:'旧值'}};const created=(await writeCompany(original,companyInput,admin)).company!;
 let announce!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{announce=r;}),gate=new Promise<void>(r=>{release=r;});
 const store={...original,listCompanies:async()=>{const rows=original.listCompanies().map(r=>({...r,derivedLabel:'authorized projection'}));announce();await gate;return rows;}};
 const app=createTestServer({ledgerStore:store as never,auth:{mode:'local-bypass'}});t.after(()=>app.close());
 const exported=app.inject('/api/custom-field-export/company');await entered;
 let writeFinished=false;const update=writeCompany(original,{...company(),name:'新名称',expectedRevision:1,schemaRevision:1,customFields:{v:'新值'}},admin,created.id).then(r=>{writeFinished=true;return r;});
 await new Promise(r=>setImmediate(r));assert.equal(writeFinished,false);release();
 const response=await exported;assert.equal(response.statusCode,200,response.body);const row=response.json().records.find((r:{id:string})=>r.id===created.id);assert.equal(row.name,'旧名称');assert.equal(row.customFields.v,'旧值');assert.equal(row.derivedLabel,'authorized projection');assert.equal(response.json().schema.schemaRevision,1);
 await update;const latest=original.listCompanies().find(r=>r.id===created.id)!;assert.equal(latest.name,'新名称');assert.equal(latest.customFields!.v,'新值');
});

test('memory master async callback rejection rolls back schema/core/custom/audits and releases queue',async()=>{
 const store=createMemoryLedgerStore(),before=structuredClone(await store.masterTransaction(s=>s));
 await assert.rejects(store.masterTransaction(async s=>{s.schemas.company.schemaRevision=99;s.companies.push({id:'bad',name:'bad',shortName:'bad',industry:'',revision:1,customFields:{v:'bad'}});await Promise.resolve();throw Error('async failure');}),/async failure/);
 assert.deepEqual(await store.masterTransaction(s=>s),before);assert.equal(await store.masterTransaction(async()=>{await Promise.resolve();return 'resumed';}),'resumed');
});

test('prototype-named stable IDs require own values across schema, writes and missing-field views',async()=>{
 for(const id of ['toString','valueOf','hasOwnProperty']){
  const store=createMemoryLedgerStore(),old=(await writeCompany(store,company(),admin)).company!;
  await change(store,'company',0,[field(id,'text',true),field('zero','number',true),field('flag','boolean',true)]);
  await assert.rejects(writeCompany(store,{...company(),schemaRevision:1,customFields:{zero:'0',flag:false}},admin),{code:'required_custom_field'});
  const schema=(await store.masterTransaction(s=>s.schemas)).company;
  assert.deepEqual(customView(schema,old).missingCustomFields,[id,'zero','flag']);
  const edited=(await writeCompany(store,{...company(),schemaRevision:1,expectedRevision:1},admin,old.id)).company!;
  assert.equal(Object.hasOwn(edited.customFields!,id),false);assert.deepEqual(customView(schema,edited).missingCustomFields,[id,'zero','flag']);
  const values={[id]:'合法文本',zero:'0',flag:false};const created=(await writeCompany(store,{...company(),schemaRevision:1,customFields:values},admin)).company!;
  assert.equal(Object.hasOwn(created.customFields!,id),true);assert.equal(created.customFields![id],'合法文本');assert.deepEqual(customView(schema,created).missingCustomFields,[]);
  const preserved=(await writeCompany(store,{...company(),schemaRevision:1,expectedRevision:1},admin,created.id)).company!;
  assert.deepEqual(preserved.customFields,values);assert.deepEqual(customView(schema,preserved).missingCustomFields,[]);
  await assert.rejects(writeCompany(store,{...company(),schemaRevision:1,expectedRevision:2,customFields:{[id]:null}},admin,created.id),{code:'required_custom_field'});
 }
});

test('HTTP custom scalar IDs matching purpose metadata stay isolated; real metadata forgery remains rejected',async t=>{
 const {createTestServer}=await import('./auth-fixture.ts');const {confirmedSource}=await import('../src/ledger/source-policy.ts');
 const store=createMemoryLedgerStore(),app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());
 const ids=['dataPurpose','currentVersionPurpose','sourcePurposes'];
 for(const kind of ['company','project','fund']){const configured=await app.inject({method:'PUT',url:'/api/custom-field-schemas/'+kind,payload:{requestId:randomUUID(),expectedRevision:0,fields:ids.map(id=>field(id))}});assert.equal(configured.statusCode,200,configured.body);}
 const customFields=Object.fromEntries(ids.map(id=>[id,'engineering_fixture']));
 const body={...company(),schemaRevision:1,customFields};const made=await app.inject({method:'POST',url:'/api/companies',payload:body});assert.equal(made.statusCode,201,made.body);
 const id=made.json().company.id,detail=(await app.inject('/api/companies/'+id)).json().company;assert.deepEqual(detail.customFields,customFields);assert.equal(detail.dataPurpose,'unknown');assert.equal(confirmedSource(detail),true);
 const project={requestId:randomUUID(),name:'项目',shortName:'项',industry:'科技',fundId:store.listFunds()[0].id,manager:'',collaborators:'',sourceChannel:'',description:'',schemaRevision:1,customFields,newCompany:{name:'嵌套企业',shortName:'企业',industry:'',schemaRevision:1,customFields}};
 const nested=await app.inject({method:'POST',url:'/api/projects',payload:project});assert.equal(nested.statusCode,201,nested.body);assert.deepEqual(nested.json().project.customFields,customFields);assert.notEqual(nested.json().project.dataPurpose,'engineering_fixture');
 await store.insertUser({id:'manager',name:'经理',email:'manager@test',role:'investment_manager',passwordHash:null,enabled:true});
 const fund=await app.inject({method:'POST',url:'/api/funds',payload:{requestId:randomUUID(),name:'基金',shortName:'基金',managerId:'manager',stage:'投资期',scale:'',nextAction:'',schemaRevision:1,customFields}});assert.equal(fund.statusCode,201,fund.body);assert.deepEqual(fund.json().fund.customFields,customFields);
 const p=nested.json().project;const projectPatch=await app.inject({method:'PATCH',url:'/api/projects/'+p.id,payload:{requestId:randomUUID(),expectedRevision:1,schemaRevision:1,name:p.name,shortName:p.shortName,industry:p.industry,description:p.description,customFields:{dataPurpose:'unknown'}}});assert.equal(projectPatch.statusCode,200,projectPatch.body);
 const f=fund.json().fund;const fundPatch=await app.inject({method:'PATCH',url:'/api/funds/'+f.id,payload:{requestId:randomUUID(),expectedRevision:1,schemaRevision:1,name:f.name,shortName:f.shortName,managerId:'manager',stage:f.stage,scale:f.scale,nextAction:f.nextAction,customFields:{dataPurpose:'unknown'}}});assert.equal(fundPatch.statusCode,200,fundPatch.body);
 const edited=await app.inject({method:'PATCH',url:'/api/companies/'+id,payload:{...company(),expectedRevision:1,schemaRevision:1,customFields:{dataPurpose:'unknown'}}});assert.equal(edited.statusCode,200,edited.body);
 for(const poison of [{dataPurpose:'unknown'},{sourceBasis:[{dataPurpose:'unknown'}]},{attachment:{currentVersionPurpose:'unknown'}},{newCompany:{...project.newCompany,dataPurpose:'unknown'}},{customFields:{dataPurpose:{dataPurpose:'unknown'}}},{other:{customFields:{dataPurpose:'unknown'}}},{'':{customFields:{dataPurpose:'unknown'}}}]){
  const response=await app.inject({method:'POST',url:'/api/projects',payload:{...project,...poison}});assert.equal(response.statusCode,400,response.body);assert.equal(response.json().error,'untrusted_source_purpose');
 }
 const nonMaster=await app.inject({method:'POST',url:'/api/tasks',payload:{customFields:{dataPurpose:'unknown'}}});assert.equal(nonMaster.statusCode,400);assert.equal(nonMaster.json().error,'untrusted_source_purpose');
 const objectValue=await app.inject({method:'POST',url:'/api/companies',payload:{...company(),schemaRevision:1,customFields:{dataPurpose:{ordinary:'object'}}}});assert.equal(objectValue.statusCode,400);
 const exported=(await app.inject('/api/custom-field-export/company')).json().records.find((r:{id:string})=>r.id===id);assert.equal(exported.dataPurpose,'unknown');assert.equal(exported.customFields.dataPurpose,'unknown');
});

test('registry overlay and source policy ignore custom purpose-like scalars in both directions',async()=>{
 const {applySourcePurposes,purposeLookup}=await import('../src/ledger/source-purposes.ts');const {engineeringSource,sourceOf}=await import('../src/ledger/source-policy.ts');
 const lookup=purposeLookup([{recordType:'project',recordId:'fixture',dataPurpose:'engineering_fixture'}]);
 for(const [id,custom] of [['fixture','unknown'],['ordinary','engineering_fixture']]){
  const record=applySourcePurposes({id,dataOrigin:'user_input',customFields:{dataPurpose:custom,currentVersionPurpose:custom,sourcePurposes:custom}},lookup,'project');
  assert.equal(record.dataPurpose,id==='fixture'?'engineering_fixture':'unknown');assert.equal(engineeringSource(record),id==='fixture');assert.equal(sourceOf(record).dataPurpose,record.dataPurpose);assert.deepEqual(record.customFields,{dataPurpose:custom,currentVersionPurpose:custom,sourcePurposes:custom});
 }
});
