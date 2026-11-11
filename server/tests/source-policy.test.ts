import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDataOrigin,confirmedSource,inputSource,parseIncludeDemo} from '../src/ledger/source-policy.ts';
import {createTestServer as createServer} from './auth-fixture.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';

test('origins are explicit; derived creation method never alone proves content and ancestry cannot be laundered',()=>{
 for(const v of [undefined,null,'invalid','',42])assert.equal(normalizeDataOrigin(v),'unknown');
 assert.equal(normalizeDataOrigin('seed_demo'),'seed_demo');assert.equal(confirmedSource({dataOrigin:'system_generated'}),false);
 assert.equal(confirmedSource({dataOrigin:'system_generated',sourceBasis:[{id:'raw',dataOrigin:'source_pdf_ocr'}]}),true);
 const amended=inputSource({id:'seed',dataOrigin:'seed_demo'});assert.equal(amended.dataOrigin,'user_input');assert.equal(confirmedSource(amended),false);assert.equal(confirmedSource(inputSource({id:'amended',...amended})),false);
 assert.equal(parseIncludeDemo(undefined),true);for(const v of ['False','1',1,[],null])assert.throws(()=>parseIncludeDemo(v));
});

test('legacy manual write HTTP boundaries reject client origin and server labels fresh records and audit',async(t)=>{
 const store=createMemoryLedgerStore(),app=createServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());
 const cases=[['/api/reports',{name:'来源核验',target:store.listFunds()[0].name,fundId:store.listFunds()[0].id,type:'季度报告',status:'草稿',owner:'人工',updatedAt:'2026-10-30'}],['/api/capital-records',{company:store.listProjects()[0].name,projectId:store.listProjects()[0].id,fund:store.listFunds()[0].name,fundId:store.listFunds()[0].id,received:'100',date:'2026-10-30',rule:'待核验',receivable:'100',dueDate:'2026-11-30',status:'未收'}],['/api/materials/archive',{name:'真实录入',type:'资料',project:store.listProjects()[0].name,uploader:'人工',time:'2026-10-30',source:'人工上传',status:'待复核',quotes:'0'}]] as const;
 for(const [url,payload] of cases){assert.equal((await app.inject({method:'POST',url,payload:{...payload,dataOrigin:'source_file'}})).statusCode,400);const r=await app.inject({method:'POST',url,payload});assert.equal(r.statusCode,201,r.body);const v=r.json();assert.equal((v.report??v.capitalRecord??v.material).dataOrigin,'user_input');assert.equal(v.auditEvent.dataOrigin,'system_generated');}
});

test('uploading a new version cannot relabel pre-existing demo or unverified material as real',async()=>{
 const {applyVersion}=await import('../src/ledger/material-upload.ts');
 for(const origin of ['seed_demo','user_input',undefined]){const material={id:'material',dataOrigin:origin} as any;applyVersion(material,{id:'new',name:'new.pdf',uploadedBy:'actor',createdAt:'2026-10-30',version:2,sizeBytes:20,sha256:'hash'} as any,'资料');assert.equal(material.dataOrigin,origin??'unknown');assert.equal(material.currentVersionId,'new');}
});

test('intake demo creation, same-ID edits and downstream archive/meeting derivations never promote parent sources',async(t)=>{
 const store=createMemoryLedgerStore(),app=createServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());
 const input={...store.listAiIntakeItems()[0],id:'source-demo',isDemo:true};delete input.dataOrigin;delete input.dataPurpose;
 let r=await app.inject({method:'POST',url:'/api/ai-intake-items',payload:{...input,dataOrigin:'source_file'}});assert.equal(r.statusCode,410);
 r=await app.inject({method:'POST',url:'/api/ai-intake-items',payload:input});assert.equal(r.statusCode,410);
 await store.createAiIntakeItem({...input,dataOrigin:'seed_demo'});
 assert.equal(store.listAiIntakeItems().find(v=>v.id===input.id)?.dataOrigin,'seed_demo');
 assert.equal((await app.inject({method:'PATCH',url:`/api/ai-intake-items/${input.id}/suggestion`,payload:{suggestedFund:input.suggestedFund,suggestedProject:input.suggestedProject,suggestedPath:input.suggestedPath,dataOrigin:'user_input'}})).statusCode,400);
 r=await app.inject({method:'POST',url:`/api/ai-intake-items/${input.id}/archive`});assert.equal(r.statusCode,201,r.body);for(const v of [r.json().material,r.json().fundDocument,...r.json().tasks])assert.equal(v.dataOrigin,'seed_demo');
 const meeting=store.listMeetings()[0];meeting.dataOrigin='seed_demo';const result=await store.confirmMeeting(meeting.id);assert.equal(result!.material.dataOrigin,'seed_demo');assert.ok(result!.tasks.every(v=>v.dataOrigin==='seed_demo'));
});
test('exports inherit report provenance and can never launder a demo report',async()=>{
 const store=createMemoryLedgerStore(),report=store.listReports()[0];report.dataOrigin='seed_demo';report.sections=[{title:'工程测试正文',text:'仅用于来源传递测试。'}];await store.approveReport(report.id);const v=await store.exportReport(report.id);assert.equal(v!.exportRecord.dataOrigin,'seed_demo');assert.deepEqual(v!.exportRecord.sourceBasis,[{id:report.id,recordType:'report',projectId:'',dataOrigin:'seed_demo',dataPurpose:'unknown'}]);assert.equal(store.listReportExports().find(e=>e.id===v!.exportRecord.id)?.dataOrigin,'seed_demo');
});

test('report capture excludes approved demo financials and all other unverifiable snapshot sources',async()=>{
 const {capturePostReport}=await import('../src/ledger/post-report.ts');const base={dealId:'d',version:1,dataOrigin:'seed_demo',period:{kind:'month',value:'2026-10'}};
 const state:any={project:{id:'p',name:'p'},deals:[{id:'d',closing:{termsId:'t'},terms:[{id:'t',allocations:[]}]}],tasks:[],reportSources:{risks:[],capitalRecords:[]},postInvestment:{financials:[{...base,id:'f',status:'approved',revenue:'900'}],visits:[{...base,id:'v',date:'2026-10-01'}],archives:[{...base,id:'a'}],clauses:[{...base,id:'c',triggerDate:'2026-10-01'}]}};
 const report=capturePostReport(state,'d',{kind:'month',value:'2026-10'},'2026-10-30');assert.equal(report.snapshot.financial,null);assert.deepEqual(report.snapshot.visits,[]);assert.deepEqual(report.snapshot.archives,[]);assert.deepEqual(report.snapshot.clauses,[]);assert.ok(report.missing.some(v=>v.key==='financial'));
 state.postInvestment.financials[0].dataOrigin='system_generated';assert.equal(capturePostReport(state,'d',{kind:'month',value:'2026-10'},'now').snapshot.financial,null);
 state.postInvestment.financials[0].sourceBasis=[{id:'raw',dataOrigin:'source_file'}];assert.equal(capturePostReport(state,'d',{kind:'month',value:'2026-10'},'now').snapshot.financial!.revenue,'900');
});

test('report and capital list policies reject malformed booleans and preserve unknown while excluding explicit demos',async(t)=>{
 const store=createMemoryLedgerStore(),app=createServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>app.close());
 const report=store.listReports()[0];report.dataOrigin='seed_demo';report.sections=[{title:'工程测试正文',text:'仅用于来源传递测试。'}];await store.approveReport(report.id);await store.exportReport(report.id);
 const capital=store.listCapitalRecords()[0];capital.dataOrigin='seed_demo';
 for(const [url,key] of [['/api/reports','reports'],['/api/capital-records','capitalRecords']] as const){assert.equal((await app.inject(url+'?includeDemo=False')).statusCode,400);const r=await app.inject(url+'?includeDemo=false');assert.equal(r.statusCode,200);assert.equal(r.json()[key].some((v:any)=>v.id===(key==='reports'?report.id:capital.id)),false);assert.ok(r.json()[key].every((v:any)=>v.dataOrigin!=='seed_demo'));}
 assert.equal((await app.inject('/api/reports?includeDemo=false')).json().exportRecords.length,0);
});
