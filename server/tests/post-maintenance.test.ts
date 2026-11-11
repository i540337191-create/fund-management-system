import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {emptyPostInvestment} from '../src/ledger/post-investment.ts';
import {registerPostInvestmentRoutes} from '../src/http/post-investment.ts';
import {registerHealthRoutes} from '../src/http/health.ts';
const root='/tmp/fundapp-post-maintenance-test';
function serverFor(store:ReturnType<typeof createMemoryLedgerStore>,interval=10){const server=Fastify({logger:false,pluginTimeout:50});registerHealthRoutes(server);registerPostInvestmentRoutes(server,store,{auth:{mode:'local-bypass'},projectRoot:root,reconcileIntervalMs:interval,clock:()=>new Date('2030-01-01T00:00:00Z')});return server;}
async function until(check:()=>boolean|Promise<boolean>){const deadline=Date.now()+2000;while(!(await check())){if(Date.now()>deadline)throw Error('maintenance condition not met');await new Promise(r=>setTimeout(r,5));}}

test('slow initial scan does not gate listening; health truthfully reports running then idle without private details',async t=>{
 const store=createMemoryLedgerStore();let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);store.listPostInvestmentProjectIds=async()=>{await gate;return [];};
 const server=serverFor(store,60_000);t.after(async()=>{release();await server.close();});
 await server.ready();const health=(await server.inject('/api/health')).json();assert.equal(health.ok,true);assert.deepEqual(health.maintenance,{postInvestment:{state:'running',lastCompletedAt:null}});
 release();await until(async()=>(await server.inject('/api/health')).json().maintenance.postInvestment.state==='idle');const done=(await server.inject('/api/health')).json();assert.equal(typeof done.maintenance.postInvestment.lastCompletedAt,'string');assert.deepEqual(Object.keys(done.maintenance.postInvestment).sort(),['lastCompletedAt','state']);
});

test('post-investment GET reconciles its project while global scan is pending, and repeated reads create one warning',async t=>{
 const store=createMemoryLedgerStore(),p=store.listProjects()[0];await store.workflowTransaction(p.id,async s=>{s.postInvestment=emptyPostInvestment();s.postInvestment.clauses.push({id:'clause-secret',version:1,status:'active',triggerDate:'2028-08-31',title:'约定',obligation:'义务',threshold:'阈值',owner:{id:'user-admin',name:'管理员',role:'admin',email:'admin@local'}} as any);});
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);store.listPostInvestmentProjectIds=async()=>{await gate;return [p.id];};const server=serverFor(store,60_000);t.after(async()=>{release();await server.close();});await server.ready();
 const results=await Promise.all(Array.from({length:3},()=>server.inject(`/api/projects/${p.id}/post-investment`)));for(const result of results){assert.equal(result.statusCode,200,result.body);assert.ok(result.json().postInvestment.clauses[0].warningTaskId);}
 assert.equal(store.listTasks().filter(t=>t.type==='条款预警').length,1);assert.equal(store.listAuditEvents().filter(e=>e.action==='投后条款预警').length,1);release();
});

for(const failure of ['list','project'] as const)test(`${failure} scan failure is observable and a later retry recovers without duplicate scans`,async t=>{
 const store=createMemoryLedgerStore(),p=store.listProjects()[0];let fail=true,calls=0,active=0,maxActive=0;const transaction=store.workflowTransaction.bind(store);
 store.listPostInvestmentProjectIds=async()=>{calls++;if(failure==='list'&&fail)throw Error('private database connection secret');return [p.id];};
 store.workflowTransaction=async(id,action)=>{active++;maxActive=Math.max(active,maxActive);try{if(failure==='project'&&fail)throw Error('private project id and query');return await transaction(id,action);}finally{active--;}};
 const server=serverFor(store,25);t.after(()=>server.close());await server.ready();await until(async()=>(await server.inject('/api/health')).json().maintenance.postInvestment.state==='failed');
 const failed=(await server.inject('/api/health')).json();assert.deepEqual(failed.maintenance.postInvestment,{state:'failed',lastCompletedAt:null});assert.equal(JSON.stringify(failed).includes('private'),false);
 fail=false;await until(async()=>(await server.inject('/api/health')).json().maintenance.postInvestment.state==='idle');assert.ok(calls>=2);assert.equal(maxActive,1);
});
