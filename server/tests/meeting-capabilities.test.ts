import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from '../src/index.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {emptyAgentState} from '../src/agent/model.ts';
import {reconcileIntakeTasks} from '../src/http/business-intake.ts';

test('manual supplement note becomes the task title and changing it preserves identity and deadline',()=>{
 const s=emptyAgentState(),key='template:proof',d:any={id:'draft',ownerId:'user-admin',objectType:'project',stage:'尽调',materialIds:[],missing:[],status:'draft',fields:{materialRequirements:[{id:key,title:'投委会决议',required:true}],materialNotes:{[key]:'补李委员签字'},materialDueDates:{[key]:'2026-12-01'}}};
 reconcileIntakeTasks(s,d);const task=s.tasks.find(t=>t.id==='draft:draft:'+key)!;assert.equal(task.title,'补李委员签字');assert.match(task.note,/投委会决议/);const due=task.dueAt;
 d.fields.materialNotes[key]='补李委员及王委员签字';reconcileIntakeTasks(s,d);assert.equal(s.tasks.filter(t=>t.id===task.id).length,1);assert.equal(task.title,d.fields.materialNotes[key]);assert.equal(task.dueAt,due);
 d.fields.materialNotes[key]='   ';reconcileIntakeTasks(s,d);assert.equal(task.title,'补齐材料：投委会决议');
});
const completed=(body:string)=>JSON.parse(body.split('\n\n').find(f=>f.startsWith('event: done\n'))!.split('\ndata: ')[1]).conversation;
const eventReply=()=>({ok:true,status:200,text:async()=>'',body:new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'业务回答'}}]})+'\n\ndata: [DONE]\n\n'));c.close();}})});
function fixture(scope:string|Error){
 const calls:any[]=[];
 const server=createServer({ledgerStore:createMemoryLedgerStore(),auth:{mode:'local-bypass'},ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async(_u,init)=>{const b=JSON.parse(init!.body!);calls.push(b);if(b.messages[0]?.content?.startsWith('FUNDAPP_BUSINESS_SCOPE')){if(scope instanceof Error)throw scope;return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:scope}}]})};}return eventReply();}}});
 return {server,calls};
}
async function turn(f:ReturnType<typeof fixture>,prompt='帮我写一个和工作无关的游戏攻略'){
 const c=(await f.server.inject({method:'POST',url:'/api/ai/conversations',payload:{requestId:randomUUID(),includeDemo:false}})).json();return f.server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/turns`,payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt}});
}
test('non-business turns stop before tools and reply generation; replay stays persisted',async()=>{
 const f=fixture('{"scope":"general"}');try{const r=await turn(f);assert.equal(r.statusCode,200,r.body);assert.match(completed(r.body).messages.at(-1).content,/业务|授权/);assert.equal(f.calls.length,1);assert(!f.calls[0].messages.some((m:any)=>/本轮受控上下文/.test(m.content)));}finally{await f.server.close();}
});
test('invalid or unavailable scope checks fail closed, while business and continuation are admitted',async()=>{
 for(const value of ['{"scope":"forged"}','{"scope":["general"]}',new Error('unavailable')]){const f=fixture(value);try{const r=await turn(f);assert.equal(r.statusCode,502,r.body);assert.equal(f.calls.length,1);}finally{await f.server.close();}}
 const f=fixture('{"scope":"business"}');try{const r=await turn(f,'这份基金材料还缺什么？');assert.equal(r.statusCode,200,r.body);assert.equal(completed(r.body).messages.at(-1).content,'业务回答');assert.equal(f.calls.length,2);}finally{await f.server.close();}
});
test('only published administrator-enabled general capability bypasses scope admission',async()=>{
 const f=fixture('{"scope":"general"}');try{
  const state=(await f.server.inject('/api/agent-workspace')).json(),skill=state.skills.find((x:any)=>x.id==='skill-general');assert.ok(skill);assert.equal(skill.enabled,false);
  const grant=await f.server.inject({method:'POST',url:'/api/agent-workspace/actions',payload:{requestId:randomUUID(),expectedRevision:state.revision,action:'set_shared_skill_enabled',data:{id:skill.id,version:skill.version,enabled:true}}});assert.equal(grant.statusCode,200,grant.body);
  const r=await turn(f);assert.equal(r.statusCode,200,r.body);assert.equal(completed(r.body).messages.at(-1).content,'业务回答');assert.equal(f.calls.length,1);
 }finally{await f.server.close();}
});
test('legacy chat cannot bypass the same business boundary',async()=>{
 const f=fixture('{"scope":"general"}');try{const r=await f.server.inject({method:'POST',url:'/api/ai/chat',payload:{prompt:'给我讲讲如何玩游戏'}});assert.equal(r.statusCode,200,r.body);assert.match(r.json().content,/业务|授权/);assert.equal(f.calls.length,1);}finally{await f.server.close();}
});


test('LP guidance cites supplied company originals and never infers product annex completeness or an approval',async()=>{
 const {lpSuitabilityGuidance}=await import('../src/ledger/lp-suitability.ts');const {fundraisingTemplates}=await import('../src/ledger/fundraising-templates.ts');
 const selected=[{source:{sha256:fundraisingTemplates[0].sha256}}];
 const institution=lpSuitabilityGuidance({type:'机构'} as any,selected);assert(institution.rules.some(r=>r.requirement.includes('净资产需大于1000万元')));assert(institution.unresolved.some(t=>t.includes('经办人')));assert.equal(institution.decision,'requires_human_review');
 const product=(scale:string)=>lpSuitabilityGuidance({type:'产品',profile:{kind:'product',fields:{scale}}} as any,selected);
 assert.match(product('999万元').declaredScaleCheck!.result,/低于/);assert.match(product('1000万元').declaredScaleCheck!.result,/仍须核对/);assert.match(product('1000万美元').declaredScaleCheck!.result,/不明确/);assert.match(product('10000000').declaredScaleCheck!.result,/不明确/);assert.match(product('1,0万元').declaredScaleCheck!.result,/不明确/);assert.match(product('1,000万元').declaredScaleCheck!.result,/仍须核对/);
 assert(product('1000万元').unresolved.some(t=>t.includes('基础附件')));assert(lpSuitabilityGuidance({type:'自然人'} as any).unresolved.some(t=>t.includes('适用')));
 const {createHash}=await import('node:crypto'),{readFile}=await import('node:fs/promises'),{resolve}=await import('node:path');
 for(const r of [...institution.rules,...product('1000万元').rules])assert.equal(createHash('sha256').update(await readFile(resolve(import.meta.dirname,'../../docs/source-materials/2026-06-10-fund-ops-templates/originals',r.source.path))).digest('hex'),r.source.sha256);
});


test('supplied agreement fixed-three-year formula stays exact across leap years and agrees with the portfolio check',async()=>{
 const {feeAmount,lifecycleInput}=await import('../src/ledger/fund-lifecycle.ts'),{feeCalculation}=await import('../../src/iterationB/capitalDataIntegrity.ts');
 assert.equal(feeAmount('1000000','0.9','2024-06-01','2027-05-31','365','half_up',3).amount,'27000.00');
 assert.notEqual(feeAmount('1000000','0.9','2024-01-01','2026-12-31','365','half_up').amount,'27000.00');
 const fee=feeAmount('1000000','0.9','2024-01-01','2026-12-31','365','half_up',3),charge:any={principal:'1000000.00',from:'2024-01-01',to:'2026-12-31',...fee},rule:any={rate:'0.9',accrualYears:3,dayBasis:'365',rounding:'half_up',validFrom:'2024-01-01',validTo:'2027-12-31',approvedBy:'人工核对',approval:{materialId:'proof',versionId:'v1',sha256:'a'.repeat(64),sizeBytes:1}};
 assert.equal(feeCalculation(charge,rule).valid,true);assert.equal(feeCalculation({...charge,amount:'27000.01'},rule).valid,false);
 for(const year of [0,-1,1.5,11,NaN])assert.throws(()=>feeAmount('100','1','2026-01-01','2026-01-01','365','half_up',year));
 const input={requestId:randomUUID(),expectedRevision:1,action:'rule',name:'来源合同样例',rate:'0.9',dayBasis:'365',rounding:'half_up',basis:'H=Ei×年管理费率×N，N=3',approvedBy:'人工',validFrom:'2024-01-01',validTo:'2027-12-31',proof:{materialId:'proof',versionId:'v1'}};
 assert.equal(lifecycleInput({...input,accrualYears:'3'}).accrualYears,3);assert(!Object.hasOwn(lifecycleInput({...input,accrualYears:''}),'accrualYears'));assert.throws(()=>lifecycleInput({...input,accrualYears:'3.1'}));
});


test('a personal copy or a self-enable override cannot grant the general capability',async()=>{
 const {AgentRepository}=await import('../src/agent/repository.ts'),{generalConversationAllowed}=await import('../src/ai/business-scope.ts');const repo=new AgentRepository(),actor={id:'ordinary-user',name:'普通员工',role:'investment_manager' as const,email:'employee@example.invalid'};
 await repo.transaction(s=>{s.overrides[actor.id]={'skill-general':true};const original=s.skills.find(x=>x.id==='skill-general')!;s.skills.push({...original,id:'personal-general',ownerId:actor.id,scope:'personal',enabled:true});});assert.equal(await generalConversationAllowed(repo,actor),false);
 await repo.transaction(s=>{s.skills.find(x=>x.id==='skill-general')!.enabled=true;});assert.equal(await generalConversationAllowed(repo,actor),true);assert.equal(await generalConversationAllowed(new AgentRepository(),actor),false);
 await repo.transaction(s=>{s.skills.find(x=>x.id==='skill-general')!.enabled=false;});assert.equal(await generalConversationAllowed(repo,actor),false);
});

test('LP guidance and new task notes stay private; authorized original rule downloads match the source hash',async()=>{
 const {createTestServer,registeredCookie}=await import('./auth-fixture.ts'),{resolve}=await import('node:path'),{createHash}=await import('node:crypto');
 const store=createMemoryLedgerStore(),fund=(await store.listFunds())[0],secret='capability-privacy-fixture-only',server=createTestServer({ledgerStore:store,materialPreviewProjectRoot:resolve(import.meta.dirname,'../..'),auth:{mode:'password',sessionSecret:secret}});
 const id=await store.lpTransaction(s=>{const i=s.investors.find(i=>i.fundId===fund.id)!;i.type='产品';i.profile={kind:'product',fields:{scale:'PRIVATE-SCALE-SECRET'}};s.data.fundraising??={};s.data.fundraising[i.id]={requirements:[{id:'private-req',name:'PRIVATE_MATERIAL',required:true,ownerId:'user-admin',dueDate:'2026-12-01',incompleteNote:'PRIVATE_NOTE'}],plans:[],allocations:[],history:[]};return i.id;});
 try{
  const viewer=await registeredCookie(server,{id:'capability-viewer',name:'viewer',email:'viewer@fixture.invalid',role:'viewer'},secret),finance=await registeredCookie(server,{id:'capability-finance',name:'finance',email:'finance@fixture.invalid',role:'finance'},secret);
  const restricted=await server.inject({url:`/api/funds/${fund.id}/investors/${id}/fundraising`,headers:{cookie:viewer}});assert.equal(restricted.statusCode,200,restricted.body);assert(!restricted.body.includes('PRIVATE_'));assert(!restricted.body.includes('PRIVATE-SCALE'));assert.equal(restricted.json().suitability,undefined);
  const tasks=await server.inject({url:'/api/fundraising/tasks',headers:{cookie:viewer}});assert.equal(tasks.statusCode,200,tasks.body);assert(!tasks.body.includes('PRIVATE_'));
  const path='/api/fundraising/templates/product-profile/source';assert.equal((await server.inject(path)).statusCode,401);assert.equal((await server.inject({url:path,headers:{cookie:viewer}})).statusCode,403);
  const original=await server.inject({url:path,headers:{cookie:finance}});assert.equal(original.statusCode,200,original.body);assert.equal(createHash('sha256').update(original.rawPayload).digest('hex'),'7b166865647b4da6e30f5d4fd5f13ed4265c96e27e53eec8bbc1e07db8c305bb');
  assert.equal((await server.inject({url:'/api/fundraising/templates/not-a-template/source',headers:{cookie:finance}})).statusCode,404);
 }finally{await server.close();}
});

test('fixed-year upfront fees cannot be charged twice for the same rule and paid-in tranche',async()=>{
 const {lifecycleWrite,emptyLifecycleData}=await import('../src/ledger/fund-lifecycle.ts');const actor={id:'user-admin',name:'QA',email:'qa@fixture.invalid',role:'admin' as const},s:any={fund:{id:'fund',name:'QA'},data:emptyLifecycleData(),users:[],sessions:[],investors:[],materials:[],versions:[],auditEvents:[]};
 const act=(action:string,data:any)=>lifecycleWrite(s,{action,requestId:randomUUID(),expectedRevision:s.data.revision,...data},actor,{proof:{materialId:'proof',versionId:'v',sha256:'a'.repeat(64),sizeBytes:1,name:'工程依据'}});
 await act('rule',{name:'QA三年一次计提',rate:'0.9',accrualYears:3,dayBasis:'365',rounding:'half_up',basis:'工程算例',approvedBy:'QA',validFrom:'2024-01-01',validTo:'2029-12-31'});
 const data={ruleId:s.data.rules[0].id,title:'QA一次计提',tranche:'one-paid-in',principal:'1000000.00',from:'2024-01-01',to:'2026-12-31',dueDate:'2026-12-31',ownerId:'user-admin'};await act('charge',data);
 await assert.rejects(act('charge',{...data,from:'2027-01-01',to:'2029-12-31'}),/duplicate_fee_charge/);assert.equal(s.data.charges.length,1);
 await act('charge',{...data,tranche:'different-paid-in'});assert.equal(s.data.charges.length,2);
});
