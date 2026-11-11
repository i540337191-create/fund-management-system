import test from 'node:test';
import assert from 'node:assert/strict';
import {applySourcePurposes,purposeLookup,type SourcePurposeEntry} from '../src/ledger/source-purposes.ts';
import {materialVersionSourceBasis,retainEvidenceSource,sourceOf,sourceBasisOf,confirmedSource,hiddenSource,inputSource,readSourceRows} from '../src/ledger/source-policy.ts';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {createPostgresLedgerStore} from '../src/ledger/postgres-store.ts';
import {createTestServer} from './auth-fixture.ts';
import {projectInvestmentLedger} from '../src/ledger/investment-ledger.ts';
const entry=(recordType:string,recordId:string,projectId=''):SourcePurposeEntry=>({recordType,recordId,projectId,dataPurpose:'engineering_fixture',evidence:{test:'exact identity'},classifiedBy:'test',classifiedAt:'2026-10-30T00:00:00Z',revision:1});

test('purpose and origin are independent; only exact child identities are classified',()=>{
 const lookup=purposeLookup([entry('project','p'),entry('deal_terms','same','p')]);
 const records:any={states:[{project:{id:'p',dataOrigin:'user_input'},deals:[{id:'d',projectId:'p',dataOrigin:'user_input',terms:[{id:'same',dataOrigin:'user_input'}]}],materials:[{id:'raw',projectId:'p',dataOrigin:'source_file'}]},{project:{id:'other',dataOrigin:'user_input'},deals:[{id:'d',projectId:'other',terms:[{id:'same',dataOrigin:'user_input'}]}]}]};
 applySourcePurposes(records,lookup);
 assert.equal(records.states[0].project.dataOrigin,'user_input');assert.equal(records.states[0].project.dataPurpose,'engineering_fixture');
 assert.equal(records.states[0].deals[0].terms[0].dataPurpose,'engineering_fixture');assert.equal(records.states[1].deals[0].terms[0].dataPurpose,'unknown');
 assert.equal(records.states[0].materials[0].dataPurpose,'unknown');assert.equal(confirmedSource(records.states[0].materials[0]),true);
 assert.equal(confirmedSource({dataOrigin:'unknown',dataPurpose:'unknown'}),false);assert.equal(confirmedSource({dataOrigin:'user_input',dataPurpose:'unknown'}),true);
});

test('versions and parent classification stay independent and purpose survives explicit derivation',()=>{
 const lookup=purposeLookup([entry('material_version','fixture-version')]);
 const material:any=applySourcePurposes({id:'raw',currentVersionId:'fixture-version',dataOrigin:'source_file'},lookup,'material');
 assert.equal(material.dataPurpose,'unknown');assert.equal(material.currentVersionPurpose,'engineering_fixture');assert.equal(hiddenSource(material),true);
 const amended=inputSource(material);assert.equal(confirmedSource(amended),false);assert.equal(sourceOf(amended).sourceBasis!.some(v=>v.dataPurpose==='engineering_fixture'),true);
 assert.equal(applySourcePurposes({id:'original-version'},lookup,'material_version').dataPurpose,'unknown');
});

test('record policy excludes engineering and explicit engineering bases, keeps independent unknown children',()=>{
 const records:any[]=[{id:'f',dataOrigin:'user_input',dataPurpose:'engineering_fixture'},{id:'d',dataOrigin:'system_generated',sourceBasis:[{id:'f',dataOrigin:'user_input',dataPurpose:'engineering_fixture'}]},{id:'u',dataOrigin:'unknown'},{id:'r',dataOrigin:'source_file'}];
 assert.deepEqual(readSourceRows(records,false).map(v=>v.id),['u','r']);assert.equal(readSourceRows(records,true).length,4);assert.equal(confirmedSource(records[1]),false);
});

test('memory classification labels history and explicit generated archive basis without classifying independent children',async()=>{
 const initial=createSeedLedgerState();const project=initial.projects[0],intake=initial.aiIntakeItems[0];
 const store=createMemoryLedgerStore(initial,{sourcePurposes:[entry('project',project.id),entry('intake',intake.id)]});
 assert.equal(store.listProjects()[0].dataOrigin,project.dataOrigin);assert.equal(store.listProjects()[0].dataPurpose,'engineering_fixture');
 const result=await store.archiveAiIntakeItem(intake.id);assert.ok(result);assert.equal(result.material.dataPurpose,'unknown');assert.equal(hiddenSource(result.material),true);assert.ok(result.tasks.every(hiddenSource));
 assert.ok(store.listMaterials().some(v=>v.id===result.material.id));assert.equal(readSourceRows(store.listMaterials(),false).some(v=>v.id===result.material.id),false);
 const before=JSON.stringify(store.listProjects());await store.readInvestmentLedgerSnapshot();await store.readInvestmentLedgerSnapshot();assert.equal(JSON.stringify(store.listProjects()),before);
});

test('HTTP purpose fields cannot be forged at nested or top level, while history GET remains labelled',async t=>{
 const initial=createSeedLedgerState(),id=initial.projects[0].id;
 const store=createMemoryLedgerStore(initial,{sourcePurposes:[entry('project',id)]}),app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());
 for(const payload of [{dataPurpose:'unknown'},{dataPurpose:'engineering_fixture'},{terms:{sourceBasis:[{id:'x',dataPurpose:'unknown'}]}}])assert.equal((await app.inject({method:'POST',url:'/api/projects',payload})).statusCode,400);
 const response=await app.inject('/api/projects');assert.equal(response.statusCode,200);assert.equal(response.json().projects.find((p:any)=>p.id===id).dataPurpose,'engineering_fixture');
 assert.equal((await app.inject('/api/materials/text-search?q=test&includeDemo=False')).statusCode,400);
});

test('Postgres snapshot reads registry once on its single repeatable-read connection, without writes',async()=>{
 const calls:string[]=[];let connections=0;
 const store=createPostgresLedgerStore({runWithClient:async callback=>{connections++;return callback({query:async(sql)=>{calls.push(sql);const q=sql.toLowerCase();if(q.includes('from source_record_purposes'))return {rows:[{record_type:'project',record_id:'p',project_id:'',data_purpose:'engineering_fixture'}]};if(q.includes('from projects p'))return {rows:[{id:'p',data_origin:'user_input'}]};if(q.includes('from deal_batches'))return {rows:[{project_id:'p',payload:{id:'deal',projectId:'p',dataOrigin:'user_input',terms:[]}}]};return {rows:[]};}});}});
 const snapshot=await store.readInvestmentLedgerSnapshot();assert.equal(connections,1);assert.equal(snapshot.states[0].project.dataPurpose,'engineering_fixture');assert.equal(snapshot.states[0].deals[0].dataPurpose,'unknown');
 assert.equal(calls.filter(q=>q.includes('from source_record_purposes')).length,1);assert.ok(calls[0].includes('REPEATABLE READ READ ONLY'));assert.equal(calls.at(-1),'COMMIT');assert.equal(calls.some(q=>/^\s*(insert|update|delete)/i.test(q)),false);
});

test('Postgres text-search excludes material and version fixtures in SQL before LIMIT',async()=>{
 let search='';const store=createPostgresLedgerStore({runWithClient:async callback=>callback({query:async(sql)=>{if(sql.includes('from material_text_chunks'))search=sql;return {rows:[]};}})});
 await store.searchMaterialTextChunks({query:'合同',includeDemo:false,limit:1});assert.match(search,/record_type='material'/);assert.match(search,/record_type='material_version'/);assert.match(search,/jsonb_array_elements\(m.source_basis\)/);assert.ok(search.indexOf("record_type='material'")<search.indexOf('limit $3'));
});

test('ledger excludes engineering records but preserves independent child amounts in project/fund/company/all scopes',()=>{
 const snapshot:any={capturedAt:'now',funds:[{id:'f',name:'fund'}],companies:[{id:'c',name:'company'}],states:[{project:{id:'p',fundId:'f',companyId:'c',name:'project',dataOrigin:'user_input',dataPurpose:'engineering_fixture'},deals:[{id:'d',projectId:'p',title:'d',status:'active',dataOrigin:'user_input',dataPurpose:'engineering_fixture',terms:[{id:'t',dataOrigin:'user_input',dataPurpose:'engineering_fixture',version:1,allocations:[{fundId:'f',amount:'90.00'}]}]}],postInvestment:{exitExecutions:[],exitPayments:[],investmentCashflows:[{id:'real',projectId:'p',dealId:'d',fundId:'f',dataOrigin:'user_input',status:'posted',currency:'CNY',amount:'7.00',kind:'investment_payment',date:'2026-10-30'},{id:'fixture',projectId:'p',dealId:'d',fundId:'f',dataOrigin:'user_input',dataPurpose:'engineering_fixture',status:'posted',currency:'CNY',amount:'99.00',kind:'investment_payment',date:'2026-10-30'}]}}]};
 for(const scope of [{type:'all'},{type:'project',id:'p'},{type:'fund',id:'f'},{type:'company',id:'c'}] as const){const result=projectInvestmentLedger(snapshot,scope,{includeDemo:false});assert.equal(result.rows.length,1);assert.equal(result.totals.investmentPrincipal,'7.00');assert.equal(result.totals.plannedContribution,'0.00');assert.equal(result.counts.primaryFundProjects,0);assert.equal(result.rows[0].sourceOrigins.project.dataPurpose,'engineering_fixture');assert.ok(result.sourceCounts.excludedEngineering>=3);}
 assert.equal(projectInvestmentLedger(snapshot,{type:'all'},{includeDemo:true}).totals.investmentPrincipal,'106.00');
});

test('report exports retain explicit engineering basis and remain inspectable only in all-history policy',async()=>{
 const state=createSeedLedgerState(),report=state.reports[0];report.dataOrigin='user_input';report.sections=[{title:'工程测试正文',text:'仅用于来源用途传递测试。'}];
 const store=createMemoryLedgerStore(state,{sourcePurposes:[entry('report',report.id)]});
 await store.approveReport(report.id);const result=await store.exportReport(report.id);assert.ok(result);assert.equal(result.report.dataOrigin,'user_input');assert.equal(result.exportRecord.dataOrigin,'system_generated');assert.equal(result.exportRecord.dataPurpose,'unknown');assert.equal(result.exportRecord.sourceBasis![0].dataPurpose,'engineering_fixture');assert.equal(confirmedSource(result.exportRecord),false);
 assert.equal(readSourceRows(store.listReportExports(),false).length,0);assert.equal(readSourceRows(store.listReportExports(),true).length,1);
});

test('AI cannot cite engineering materials or current versions even with all-history enabled',async t=>{
 const state=createSeedLedgerState(),project=state.projects[0];
 state.materials=[{id:'fixture',projectId:project.id,fundId:project.fundId,dataOrigin:'source_file'},{id:'mixed',projectId:project.id,fundId:project.fundId,dataOrigin:'source_file',currentVersionId:'fixture-version'},{id:'real',projectId:project.id,fundId:project.fundId,dataOrigin:'source_file'}] as any;
 const store=createMemoryLedgerStore(state,{sourcePurposes:[entry('material','fixture'),entry('material_version','fixture-version')]});
 let requested:string[]=[];let payload:any;
 store.searchMaterialTextChunks=(input:any)=>{requested=input.allowedMaterialIds;return [{id:'c1',materialId:'fixture',dataOrigin:'source_file',dataPurpose:'engineering_fixture',page:1,text:'fixture'},{id:'c2',materialId:'mixed',dataOrigin:'source_file',page:1,text:'mixed'},{id:'c3',materialId:'real',dataOrigin:'source_file',page:1,text:'real evidence'}] as any;};
 const app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'},ai:{env:{QWEN_API_KEY:'test',QWEN_MODEL:'test'},fetchImpl:async(_url,init)=>{payload=JSON.parse(init!.body!);return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'answer'}}]})};}}});t.after(()=>app.close());
 for(const includeDemo of [true,false]){const result=await app.inject({method:'POST',url:'/api/ai/chat',payload:{prompt:'合同',includeDemo,history:[{role:'assistant',content:'fixture old claim'}]}});assert.equal(result.statusCode,200,result.body);assert.deepEqual(requested,['real']);assert.deepEqual(result.json().sources,['资料 real 正文片段 1']);assert.equal(JSON.stringify(payload).includes('mixed'),false);assert.equal(JSON.stringify(payload).includes('fixture old claim'),includeDemo);}
});

test('HTTP text search filters readable fixture IDs before passing store limit and keeps original download policy separate',async t=>{
 const state=createSeedLedgerState(),project=state.projects[0];state.materials=[{id:'fixture',projectId:project.id,dataOrigin:'user_input'},{id:'mixed',projectId:project.id,dataOrigin:'source_file',currentVersionId:'fv'},{id:'original',projectId:project.id,dataOrigin:'source_file'}] as any;
 const store=createMemoryLedgerStore(state,{sourcePurposes:[entry('material','fixture'),entry('material_version','fv')]});let requested:any;
 store.searchMaterialTextChunks=(input:any)=>{requested=input;return [];};
 const app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());
 assert.equal((await app.inject('/api/materials/text-search?q=test&includeDemo=false&limit=1')).statusCode,200);assert.deepEqual(requested.allowedMaterialIds,['original']);assert.equal(requested.limit,1);assert.equal(requested.includeDemo,false);
 const all=await app.inject('/api/materials');assert.equal(all.json().materials.length,3);assert.equal(all.json().materials.find((m:any)=>m.id==='mixed').dataPurpose,'unknown');
});

test('Postgres workflow pure reads do not persist attached classification DTOs',async()=>{
 const writes:string[]=[];
 const store=createPostgresLedgerStore({runWithClient:async callback=>callback({query:async(sql)=>{const q=sql.toLowerCase();if(/^\s*(insert|update|delete)/.test(q))writes.push(sql);if(q.includes('from source_record_purposes'))return {rows:[{record_type:'deal_terms',record_id:'t',project_id:'p',data_purpose:'engineering_fixture'}]};if(q.includes('from projects p'))return {rows:[{id:'p',data_origin:'user_input'}]};if(q.includes('select payload from deal_batches'))return {rows:[{payload:{id:'d',projectId:'p',terms:[{id:'t',dataOrigin:'user_input'}]}}]};return {rows:[]};}})});
 const result=await store.workflowTransaction('p',async state=>state.deals![0].terms[0]);assert.equal(result.dataPurpose,'engineering_fixture');assert.deepEqual(writes,[]);
});

test('classification overlay keeps sealed report source JSON and hash unchanged',async()=>{
 const {reportSourceHash}=await import('../src/ledger/post-report.ts');
 const report:any={id:'r',dataOrigin:'system_generated',evidence:[],missing:[],snapshot:{project:{id:'p',name:'p'},capturedAt:'old',financial:{id:'f',projectId:'p',dataOrigin:'user_input'},visits:[],archives:[],clauses:[],risks:[],capitalRecords:[],fundIds:[]}};
 report.sourceHash=reportSourceHash(report);const sealed=JSON.stringify(report.snapshot);applySourcePurposes(report,purposeLookup([entry('financial','f','p')]),'post_report','p');assert.equal(JSON.stringify(report.snapshot),sealed);assert.equal(reportSourceHash(report),report.sourceHash);
});

test('purpose registry is refreshed between requests even when the pool reuses one client',async()=>{
 let registered=false,reads=0;
 const client={query:async(sql:string)=>{if(sql.includes('from source_record_purposes')){reads++;return {rows:registered?[{record_type:'project',record_id:'p',project_id:'',data_purpose:'engineering_fixture'}]:[]};}if(sql.includes('from projects p'))return {rows:[{id:'p',data_origin:'user_input'}]};return {rows:[]};}};
 const store=createPostgresLedgerStore({runWithClient:async callback=>callback(client)});
 assert.equal((await store.listProjects())[0].dataPurpose,'unknown');registered=true;assert.equal((await store.listProjects())[0].dataPurpose,'engineering_fixture');registered=false;assert.equal((await store.listProjects())[0].dataPurpose,'unknown');assert.equal(reads,3);
});

test('basis registry overlays require exact record type and project namespace, never bare reused IDs',()=>{
 const lookup=purposeLookup([entry('deal_terms','shared-id','p'),entry('material_version','test-version','')]);
 const originals=[{recordType:'material_version',projectId:'',id:'shared-id',dataOrigin:'source_file',dataPurpose:'unknown'},{recordType:'deal_terms',projectId:'other-project',id:'shared-id',dataOrigin:'user_input',dataPurpose:'unknown'},{id:'shared-id',dataOrigin:'source_file',dataPurpose:'unknown'},{recordType:'deal_terms',id:'shared-id',dataOrigin:'user_input',dataPurpose:'unknown'}] as const;
 for(const basis of originals){const material:any={id:'derived',projectId:'p',dataOrigin:'system_generated',sourceBasis:[{...basis}]};applySourcePurposes(material,lookup,'material','p');assert.equal(hiddenSource(material),false,JSON.stringify(basis));assert.deepEqual(material.sourceBasis,[basis]);}
 const incomplete=sourceBasisOf({id:'shared-id',dataOrigin:'user_input'},'deal_terms');assert.equal(Object.hasOwn(incomplete[0],'projectId'),false);
 const exact:any={id:'derived',projectId:'p',dataOrigin:'system_generated',sourceBasis:[{id:'shared-id',recordType:'deal_terms',projectId:'p',dataOrigin:'user_input',dataPurpose:'unknown'}]};applySourcePurposes(exact,lookup,'material','p');assert.equal(hiddenSource(exact),true);
 const explicit:any={id:'legacy',dataOrigin:'system_generated',sourceBasis:[{id:'shared-id',dataOrigin:'user_input',dataPurpose:'engineering_fixture'}]};applySourcePurposes(explicit,lookup,'material','p');assert.equal(hiddenSource(explicit),true);
 const version=sourceBasisOf({id:'shared-id',recordType:'material_version',projectId:'',dataOrigin:'source_file'});assert.equal(version[0].recordType,'material_version');assert.equal(version[0].projectId,'');assert.deepEqual(sourceOf({sourceBasis:version}).sourceBasis,version);
 const fixtureVersion:any={id:'version-derived',projectId:'p',sourceBasis:sourceBasisOf({id:'test-version',dataOrigin:'source_file'},'material_version','')};applySourcePurposes(fixtureVersion,lookup,'material','p');assert.equal(hiddenSource(fixtureVersion),true);
});

test('exact basis classification preserves replay receipts, audit details, and sealed snapshots on repeated reads',()=>{
 const receipt={fingerprint:'unchanged',result:{material:{id:'replay',sourceBasis:[{id:'shared-id',dataOrigin:'source_file'}]}}};const detail=JSON.stringify({prior:'original',id:'shared-id'});
 const state:any={project:{id:'p'},receipts:{request:structuredClone(receipt)},auditEvents:[{id:'audit',detail}],materials:[{id:'original',sourceBasis:sourceBasisOf({id:'shared-id',dataOrigin:'source_file'},'material_version','')}]};
 const lookup=purposeLookup([entry('deal_terms','shared-id','p')]);applySourcePurposes(state,lookup);const first=JSON.stringify(state);applySourcePurposes(state,lookup);assert.equal(JSON.stringify(state),first);assert.deepEqual(state.receipts.request,receipt);assert.equal(state.auditEvents[0].detail,detail);assert.equal(hiddenSource(state.materials[0]),false);
});

test('new material derivations retain exact currently-unknown version identity for later audited classification',()=>{
 const material={id:'raw',dataOrigin:'source_file',currentVersionId:'original-version',currentVersionPurpose:'unknown' as const};
 const basis=sourceBasisOf(material,'material','');assert.ok(basis.some(v=>v.id==='original-version'&&v.recordType==='material_version'&&v.projectId===''));
 const child:any={id:'derived',sourceBasis:basis};applySourcePurposes(child,purposeLookup([entry('deal_terms','original-version','p')]),'material','p');assert.equal(hiddenSource(child),false);
 applySourcePurposes(child,purposeLookup([entry('material_version','original-version','')]),'material','p');assert.equal(hiddenSource(child),true);assert.equal(material.currentVersionPurpose,'unknown');
});

test('new proof dependencies react to exact later classification without rewriting sealed evidence or its hash',async()=>{
 const {reportSourceHash}=await import('../src/ledger/post-report.ts');const proof={materialId:'raw',versionId:'original-version',sourceBasis:materialVersionSourceBasis({id:'raw',dataOrigin:'source_file'},{id:'original-version',dataPurpose:'unknown'})};
 const cash:any=retainEvidenceSource({id:'cash',dataOrigin:'user_input'},[proof]);assert.equal(confirmedSource(cash),true);applySourcePurposes(cash,purposeLookup([entry('material_version','original-version','')]));assert.equal(confirmedSource(cash),false);assert.equal(proof.sourceBasis.at(-1)!.dataPurpose,'unknown');
 const report:any=retainEvidenceSource({id:'report',dataOrigin:'system_generated',snapshot:{project:{id:'p',name:'p'},capturedAt:'old',financial:null,visits:[],archives:[],clauses:[],risks:[],capitalRecords:[],fundIds:[]},evidence:[proof],missing:[]},[proof]);report.sourceHash=reportSourceHash(report);const sealed=JSON.stringify(report.evidence),before=report.sourceHash;
 applySourcePurposes(report,purposeLookup([entry('material_version','original-version','')]),'post_report','p');assert.equal(confirmedSource(report),false);assert.equal(JSON.stringify(report.evidence),sealed);assert.equal(reportSourceHash(report),before);
});

test('Postgres raw archives bypass DTO overlays and unrelated writes preserve all original nested archival metadata',async()=>{
 const report:any={id:'r',version:2,status:'archived',sourceBasis:[{id:'v',recordType:'material_version',projectId:'',dataOrigin:'source_file',dataPurpose:'unknown'}],snapshot:{project:{id:'p',name:'p'},financial:null}};
 const plan:any={id:'e',version:3,status:'archived',investment:{terms:{id:'t',dataPurpose:'unknown'}},documents:[{material:{materialId:'raw',versionId:'v',sourceBasis:[{id:'original',dataOrigin:'source_file',dataPurpose:'engineering_fixture'}]}}]};
 let persisted:any={revision:1,financials:[],visits:[],archives:[],clauses:[],reports:[structuredClone(report)],exitPreparations:[structuredClone(plan)]};const queries:string[]=[];
 const store=createPostgresLedgerStore({runWithClient:async action=>action({query:async(sql,values=[])=>{queries.push(sql);if(sql.includes('from projects p'))return {rows:[{id:'p',data_origin:'user_input'}]};if(sql.includes('from source_record_purposes'))return {rows:[['post_report','r','p'],['exit_preparation','e','p'],['deal_terms','t','p'],['material_version','v','']].map(([record_type,record_id,project_id])=>({record_type,record_id,project_id,data_purpose:'engineering_fixture'}))};if(sql.includes('select payload from post_investment_states'))return {rows:[{payload:structuredClone(persisted)}]};if(sql.includes('insert into post_investment_states'))persisted=JSON.parse(String(values[1]));return {rows:[]};}})});
 assert.deepEqual(await store.readPostInvestmentArchive('p','report','r','2'),report);assert.deepEqual(await store.readPostInvestmentArchive('p','exit_preparation','e','3'),plan);assert.equal(queries.some(q=>q.includes('source_record_purposes')),false);
 const listed=await store.workflowTransaction('p',async s=>({postInvestment:s.postInvestment}));assert.equal(listed.postInvestment!.reports![0].dataPurpose,'engineering_fixture');assert.equal(listed.postInvestment!.exitPreparations![0].investment.terms.dataPurpose,'engineering_fixture');assert.equal(queries.some(q=>/^\s*(insert|update|delete)/i.test(q)),false);
 await store.workflowTransaction('p',async s=>{s.postInvestment!.revision++;});assert.deepEqual(persisted.reports,[report]);assert.deepEqual(persisted.exitPreparations,[plan]);assert.equal(persisted.revision,2);assert.deepEqual(await store.readPostInvestmentArchive('p','exit_preparation','e','3'),plan);
});
