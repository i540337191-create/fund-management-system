import test from 'node:test';
import assert from 'node:assert/strict';
import {projectInvestmentLedger,type InvestmentLedgerSnapshot} from '../src/ledger/investment-ledger.ts';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {createPostgresLedgerStore} from '../src/ledger/postgres-store.ts';
import {createTestServer as createServer, registeredCookie} from './auth-fixture.ts';
function fixture():InvestmentLedgerSnapshot{
 const terms={id:'approved',version:1,status:'approved',allocations:[{fundId:'B',amount:'100.01'},{fundId:'C',amount:'20.00'}]};
 return {capturedAt:'2026-10-30',funds:['A','B','C'].map(id=>({id,name:id})) as any,companies:[{id:'co',name:'同名'},{id:'collision',name:'同名'}] as any,states:['p1','p2'].map(id=>({project:{id,name:id,companyId:'co',fundId:'A',status:'在管'} as any,deals:['d1','d2'].map(dealId=>({id:dealId,projectId:id,title:dealId,status:'closed',closing:{termsId:'approved'},terms:[terms,{...terms,id:'rejected',version:2,status:'rejected',allocations:[{fundId:'A',amount:'999'}]}]})) as any,postInvestment:{investmentCashflows:[{id:'pay',projectId:id,dealId:'d1',fundId:'B',kind:'investment_payment',currency:'CNY',amount:'999999999999999999.99',status:'posted',bankAccount:'secret-account'},{id:'rev',projectId:id,dealId:'d1',fundId:'B',kind:'project_fee',currency:'CNY',amount:'4',status:'reversed'}],exitExecutions:[{id:'ex',projectId:id,dealId:'d1',status:'recorded',allocations:[{fundId:'B',portion:'50',consideration:'80'}]},{id:'cancel',projectId:id,dealId:'d2',status:'cancelled',allocations:[{fundId:'B',portion:'10',consideration:'90'}]}],exitPayments:[{id:'old',projectId:id,executionId:'ex',fundId:'B',status:'posted',amount:'10',principal:'8',income:'2'},{id:'new',projectId:id,executionId:'ex',fundId:'B',currency:'CNY',status:'posted',amount:'20.01',principal:'18',income:'2.01'},{id:'reversed',projectId:id,executionId:'ex',fundId:'B',currency:'CNY',status:'reversed',amount:'100',principal:'80',income:'20'},{id:'bad',projectId:id,executionId:'cancel',fundId:'B',currency:'CNY',status:'posted',amount:'100',principal:'80',income:'20'}]} as any}))};
}
test('one shared projection counts ID scopes, pinned closing and exact posted money; history is minimal',()=>{
 const snapshot=fixture(),before=structuredClone(snapshot),v=projectInvestmentLedger(snapshot);
 assert.deepEqual(v.counts,{companies:1,projects:2,batches:4,allocations:8,closedBatches:4,unboundProjects:0,primaryFundProjects:2});assert.equal(v.totals.closedContribution,'480.04');assert.equal(v.totals.plannedContribution,'0.00');assert.equal(v.totals.investmentPrincipal,'1999999999999999999.98');assert.equal(v.totals.investmentFees,'0.00');assert.equal(v.totals.exitReceipts,'40.02');assert.equal(v.totals.exitConsideration,'160.00');assert.equal(v.totals.returnedPrincipal,'36.00');assert.equal(v.rows[0].plannedContribution,null);assert.equal(v.rows[0].termsVersion,1);assert.equal(v.rows[0].cashStatus,'posted');assert.ok(v.issues.some(i=>i.code==='unknown_exit_currency'));assert.ok(v.issues.some(i=>i.code==='inactive_or_mismatched_exit_execution'));assert.equal(JSON.stringify(v).includes('secret-account'),false);assert.deepEqual(snapshot,before);
 assert.equal(projectInvestmentLedger(snapshot,{type:'fund',id:'A'}).rows.length,0);assert.equal(projectInvestmentLedger(snapshot,{type:'fund',id:'A'}).counts.primaryFundProjects,2);
 for(const [type,id,count] of [['fund','B',4],['project','p1',4],['company','co',8],['company','collision',0]] as const)assert.equal(projectInvestmentLedger(snapshot,{type,id}).rows.length,count);
 snapshot.companies[0].name='renamed';assert.equal(projectInvestmentLedger(snapshot,{type:'company',id:'co'}).counts.companies,1);
});
test('current plan, unbound company, rejected/missing closing version never fall back',()=>{
 const s=fixture();s.states[0].project.companyId=null;s.states[0].deals[0].status='active';s.states[1].deals[0].closing!.termsId='missing';s.states[1].deals[1].closing!.termsId='rejected';const v=projectInvestmentLedger(s);assert.equal(v.rows.length,3);assert.equal(v.rows.find(r=>r.basis==='current_plan')!.closedContribution,null);assert.equal(v.counts.unboundProjects,1);assert.equal(v.issues.filter(i=>i.code==='invalid_approved_closing_terms').length,2);
});
test('memory snapshot waits for in-flight writer and returned snapshot is detached',async()=>{
 const store=createMemoryLedgerStore(),id=store.listProjects()[0].id;let release!:()=>void;const gate=new Promise<void>(r=>release=r);const writing=store.workflowTransaction(id,async s=>{s.project.name='after';await gate;});const reading=store.readInvestmentLedgerSnapshot();release();await writing;const s=await reading;assert.equal(s.states.find(s=>s.project.id===id)!.project.name,'after');s.states[0].project.name='outside';assert.equal((await store.readInvestmentLedgerSnapshot()).states.find(s=>s.project.id===id)!.project.name,'after');
});
test('SQL snapshot encloses all reads in repeatable read read-only, rollback on middle failure',async()=>{
 for(const failure of [false,true]){const calls:string[]=[];const store=createPostgresLedgerStore({runWithClient:async cb=>cb({query:async(sql:string)=>{calls.push(sql);if(failure&&sql.includes('post_investment_states'))throw Error('middle');return {rows:[]};}})});if(failure)await assert.rejects(store.readInvestmentLedgerSnapshot(),/middle/);else assert.equal((await store.readInvestmentLedgerSnapshot()).states.length,0);assert.equal(calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(calls.at(-1),failure?'ROLLBACK':'COMMIT');assert.ok(calls.some(s=>s.includes('portfolio_companies')));}
});
test('route scopes return unknown 404, failure never partial success',async()=>{
 const store=createMemoryLedgerStore(createSeedLedgerState()),app=createServer({ledgerStore:store,auth:{mode:'local-bypass'}});try{assert.equal((await app.inject('/api/funds/missing/investment-ledger')).statusCode,404);store.readInvestmentLedgerSnapshot=async()=>{throw Error('unavailable');};const r=await app.inject('/api/investment-ledger');assert.equal(r.statusCode,500);assert.deepEqual(r.json(),{error:'investment_ledger_unavailable'});}finally{await app.close();}
});

test('finance and viewer receive the minimal ledger DTO through registered sessions; unauthenticated reads rejected',async()=>{
 const store=createMemoryLedgerStore(),project=store.listProjects()[0],sample=fixture();await store.workflowTransaction(project.id,async s=>{s.deals=sample.states[0].deals.map(d=>({...d,projectId:project.id}));s.postInvestment=sample.states[0].postInvestment;for(const v of s.postInvestment!.investmentCashflows!)v.projectId=project.id;});
 const secret='ledger-secret',app=createServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret}});try{assert.equal((await app.inject('/api/investment-ledger')).statusCode,401);for(const role of ['finance','viewer'] as const){const cookie=await registeredCookie(app,{id:role,name:role,email:role+'@example.local',role},secret);const r=await app.inject({url:'/api/projects/'+project.id+'/investment-ledger',headers:{cookie}});assert.equal(r.statusCode,200,r.body);const v=r.json();assert.equal(v.rows.length,4);for(const key of ['bankAccount','secret-account','agreements','decisions','packetBlobId','passwordHash'])assert.equal(r.body.includes(key),false);}}finally{await app.close();}
});
test('orphan allocation cash and missing closed terms remain explicit in fund scope; unknown kind is not valid posted cash',()=>{
 const s=fixture();s.states=s.states.slice(0,1);const p=s.states[0];p.postInvestment!.exitPayments=[];p.postInvestment!.exitExecutions=[];
 p.postInvestment!.investmentCashflows=[{id:'unmapped',projectId:'p1',dealId:'d1',fundId:'A',kind:'investment_payment',currency:'CNY',amount:'25',status:'posted'} as any];
 let v=projectInvestmentLedger(s,{type:'fund',id:'A'});assert.equal(v.rows.length,0);assert.ok(v.issues.some(i=>i.code==='unmapped_investment_cashflow'&&i.recordId==='unmapped'));
 p.deals[0].closing!.termsId='missing';v=projectInvestmentLedger(s,{type:'fund',id:'A'});assert.ok(v.issues.some(i=>i.code==='invalid_approved_closing_terms'&&i.dealId==='d1'));assert.ok(v.issues.every(i=>!i.fundId||i.fundId==='A'));
 p.deals[0].closing!.termsId='approved';p.postInvestment!.investmentCashflows![0].fundId='B';p.postInvestment!.investmentCashflows![0].kind='unknown' as any;v=projectInvestmentLedger(s,{type:'fund',id:'B'});assert.equal(v.rows[0].cashStatus,'needs_review');assert.equal(v.totals.investmentPrincipal,'0.00');assert.ok(v.issues.some(i=>i.code==='unknown_cashflow_kind'));
});
test('mixed reversed and unverifiable posted cash requires review; only entirely reversed history is reversed_only',()=>{
 const s=fixture();s.states=s.states.slice(0,1);const p=s.states[0],cash=p.postInvestment!.investmentCashflows!;cash.length=0;cash.push({id:'reverse',projectId:'p1',dealId:'d1',fundId:'B',kind:'investment_payment',currency:'CNY',amount:'1',status:'reversed'} as any,{id:'unknown',projectId:'p1',dealId:'d1',fundId:'B',kind:'investment_payment',amount:'2',status:'posted'} as any);
 const status=()=>projectInvestmentLedger(s,{type:'fund',id:'B'}).rows.find(r=>r.dealId==='d1')!.cashStatus;
 assert.equal(status(),'needs_review');cash.pop();assert.equal(status(),'reversed_only');cash.length=0;assert.equal(status(),'not_recorded');cash.push({id:'invalid',projectId:'p1',dealId:'d1',fundId:'B',kind:'unknown',currency:'CNY',amount:'2',status:'posted'} as any);assert.equal(status(),'needs_review');cash.push({id:'valid',projectId:'p1',dealId:'d1',fundId:'B',kind:'investment_payment',currency:'CNY',amount:'3',status:'posted'} as any);assert.equal(status(),'posted');
});

test('source policy excludes demo and unverified amounts before totals without cascading parent demo to independent cash',()=>{
 const s=fixture();s.states=s.states.slice(0,1);const p=s.states[0];p.project.dataOrigin='seed_demo';p.deals.forEach(d=>{d.dataOrigin='seed_demo';d.terms.forEach(t=>t.dataOrigin='seed_demo');});
 p.postInvestment!.exitExecutions=[];p.postInvestment!.exitPayments=[];
 const cash={id:'real',projectId:'p1',dealId:'d1',fundId:'B',kind:'investment_payment',currency:'CNY',amount:'100',status:'posted',dataOrigin:'user_input'};
 p.postInvestment!.investmentCashflows=[cash,{...cash,id:'demo',amount:'900',dataOrigin:'seed_demo'},{...cash,id:'old',amount:'50',dataOrigin:undefined},{...cash,id:'derived',amount:'60',dataOrigin:'system_generated'},{...cash,id:'tainted',amount:'70',dataOrigin:'user_input',sourceBasis:[{id:'seed',dataOrigin:'seed_demo'}]}] as any;
 const v=projectInvestmentLedger(s,{type:'fund',id:'B'},{includeDemo:false});
 assert.equal(v.totals.investmentPrincipal,'100.00');assert.equal(v.totals.closedContribution,'0.00');assert.equal(v.rows[0].closedContribution,null);assert.equal(v.rows[0].sourceOrigins.project.dataOrigin,'seed_demo');
 assert.deepEqual(v.rows[0].investmentCashflows.map(v=>v.id),['real','old','derived','tainted']);assert.equal(v.rows[0].investmentCashflows.find(v=>v.id==='old')!.dataOrigin,'unknown');assert.equal(v.sourceCounts.unknown,1);assert.ok(v.sourceCounts.excludedDemo>0);assert.equal(v.sourcePolicy.unknownAmounts,'excluded');
 const all=projectInvestmentLedger(s,{type:'fund',id:'B'});assert.equal(all.totals.investmentPrincipal,'1180.00');assert.ok(all.issues.some(i=>i.code==='unknown_source_amounts_included'));assert.ok(all.issues.some(i=>i.code==='unverified_source_amounts_included'));
 p.postInvestment!.investmentCashflows![3].sourceBasis=[{id:'original',dataOrigin:'source_file'}];assert.equal(projectInvestmentLedger(s,{type:'fund',id:'B'},{includeDemo:false}).totals.investmentPrincipal,'160.00');
 assert.equal(projectInvestmentLedger(s,{type:'company',id:'collision'},{includeDemo:false}).rows.length,0);
});
test('all ledger APIs validate includeDemo consistently after permission and return same prefiltered figures',async()=>{
 const store=createMemoryLedgerStore(),project=store.listProjects()[0],sample=fixture();sample.states=sample.states.slice(0,1);const fund=store.listFunds()[0];
 await store.workflowTransaction(project.id,async s=>{s.deals=sample.states[0].deals.map(d=>({...d,projectId:project.id,terms:d.terms.map(t=>({...t,allocations:[{fundId:fund.id,amount:'900'}],dataOrigin:'seed_demo'}))}));s.postInvestment={...sample.states[0].postInvestment,investmentCashflows:[{id:'real',projectId:project.id,dealId:'d1',fundId:fund.id,kind:'investment_payment',currency:'CNY',amount:'100',status:'posted',dataOrigin:'user_input'}]} as any;});
 const app=createServer({ledgerStore:store,auth:{mode:'local-bypass'}});try{for(const path of ['/api/investment-ledger',`/api/projects/${project.id}/investment-ledger`,`/api/funds/${fund.id}/investment-ledger`]){let r=await app.inject(path+'?includeDemo=false');assert.equal(r.statusCode,200);assert.equal(r.json().totals.investmentPrincipal,'100.00');assert.equal(r.json().totals.closedContribution,'0.00');r=await app.inject(path+'?includeDemo=no');assert.equal(r.statusCode,400);}
 const legacy=await app.inject(`/api/funds/${fund.id}/deals?includeDemo=false`);assert.equal(legacy.statusCode,200);assert.ok(legacy.json().allocations.every((v:any)=>v.allocationAmount===null));assert.equal(legacy.json().sourcePolicy.includeDemo,false);assert.equal((await app.inject(`/api/funds/${fund.id}/deals?includeDemo=0`)).statusCode,400);
 }finally{await app.close();}
});

test('pure demo relationships disappear and unrelated fund sources cannot pollute scoped counts or issues',()=>{
 const s=fixture();for(const p of s.states){p.project.dataOrigin='seed_demo';p.deals.forEach(d=>{d.dataOrigin='seed_demo';d.terms.forEach(t=>t.dataOrigin='seed_demo');});p.postInvestment!.investmentCashflows=[];p.postInvestment!.exitPayments=[];p.postInvestment!.exitExecutions=[];}
 const empty=projectInvestmentLedger(s,{type:'all'},{includeDemo:false});assert.equal(empty.rows.length,0);assert.equal(empty.counts.projects,0);assert.equal(empty.counts.primaryFundProjects,0);
 const before=projectInvestmentLedger(s,{type:'fund',id:'B'},{includeDemo:false});
 s.states.push({project:{id:'unrelated',fundId:'Z',companyId:'collision'} as any,deals:[{id:'foreign',projectId:'unrelated',status:'active',terms:[{id:'foreign-terms',version:1,allocations:[{fundId:'Z',amount:'1'}]}]}] as any,postInvestment:{investmentCashflows:[{id:'secret-seed',projectId:'unrelated',dealId:'missing',fundId:'Z',dataOrigin:'seed_demo'}],exitPayments:[],exitExecutions:[]} as any});
 const after=projectInvestmentLedger(s,{type:'fund',id:'B'},{includeDemo:false});assert.deepEqual(after,before);assert.equal(JSON.stringify(after).includes('secret-seed'),false);
});

test('hidden asset status and asset-history projection ignore demo lifecycle triggers before projection',async()=>{
 const {sourceAssetProjection}=await import('../src/ledger/asset-history.ts');
 const s=fixture();s.states=s.states.slice(0,1);const state=s.states[0];state.project.dataOrigin='user_input';state.deals.forEach(d=>{d.dataOrigin='user_input';d.terms.forEach(t=>t.dataOrigin='user_input');});state.postInvestment={...state.postInvestment,investmentCashflows:[],exitExecutions:[],exitPayments:[],exitArchives:[],exitPreparations:[]} as any;
 const hidden=()=>projectInvestmentLedger(s,{type:'project',id:'p1'},{includeDemo:false});assert.ok(hidden().rows.every(v=>v.assetStatus==='managed'));
 state.postInvestment!.exitPreparations=[{id:'seed-plan',dealId:'d1',status:'archived',dataOrigin:'seed_demo'}] as any;
 state.postInvestment!.exitExecutions=[{id:'seed-execution',dealId:'d1',projectId:'p1',status:'recorded',dataOrigin:'seed_demo',allocations:[{fundId:'B',portion:'100',consideration:'900'}]}] as any;
 const before=JSON.stringify(s);assert.ok(hidden().rows.every(v=>v.assetStatus==='managed'));assert.equal(sourceAssetProjection(state,false).projection.status,'managed');assert.equal(sourceAssetProjection(state,true).projection.status,'exiting');assert.equal(JSON.stringify(s),before);
 state.postInvestment!.exitPayments=[{id:'independent',executionId:'seed-execution',fundId:'B',projectId:'p1',status:'posted',currency:'CNY',amount:'100',principal:'100',income:'0',dataOrigin:'user_input'}] as any;
 assert.equal(sourceAssetProjection(state,false).sourceIssue,true);assert.ok(hidden().rows.every(v=>v.assetStatus===null));state.postInvestment!.exitPayments=[];
 state.postInvestment!.exitPreparations![0].dataOrigin=undefined;
 assert.ok(hidden().rows.every(v=>v.assetStatus===null));assert.ok(hidden().issues.some(v=>v.code==='asset_status_source_unverified'));assert.equal(sourceAssetProjection(state,false).sourceIssue,true);assert.equal(sourceAssetProjection(state,false).projection.status,'managed');
});
