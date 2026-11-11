import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lpInput,lpWrite} from '../src/ledger/lp-ledger.ts';
import {parseLpProfile} from '../src/ledger/lp-profile.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {lpProjection} from '../src/ledger/lp-privacy.ts';
import {raisingInput,raisingWrite} from '../src/ledger/fundraising.ts';
import {fundraisingTemplates} from '../src/ledger/fundraising-templates.ts';
const actor={id:'user-admin',name:'管理员',role:'admin' as const,email:'admin@example.invalid'};
test('typed profiles validate category keys and remain optional for historical LPs',()=>{
 assert.deepEqual(parseLpProfile({kind:'natural',fields:{identityNumber:'SYNTHETIC-ID'}}),{kind:'natural',fields:{identityNumber:'SYNTHETIC-ID'}});
 for(const value of [{kind:'other',fields:{}},{kind:'product',fields:{identityNumber:'wrong category'}},{kind:'natural',fields:{age:42}},{kind:'natural',fields:{address:'bad\nvalue'}}])assert.throws(()=>parseLpProfile(value));
 assert.equal(lpInput({requestId:randomUUID(),name:'legacy',type:'其他'},'master').profile,undefined);
});
test('profile writes persist, preserve prior evidence and sanitize arbitrary downstream text',async()=>{
 const store=createMemoryLedgerStore(),fund=(await store.listFunds())[0];
 const created:any=await store.lpTransaction(s=>lpWrite(s,fund.id,undefined,'master',lpInput({requestId:randomUUID(),name:'profile LP',type:'自然人',profile:{kind:'natural',fields:{identityNumber:'SYNTHETIC-SECRET-OLD'}}},'master'),actor));
 const id=created.investor.id;
 await store.lpTransaction(s=>lpWrite(s,fund.id,id,'master',lpInput({requestId:randomUUID(),expectedRevision:1,profile:{kind:'natural',fields:{identityNumber:'SYNTHETIC-SECRET-NEW'}}},'master'),actor));
 const projection=await lpProjection(store);
 assert.equal(projection.text('SYNTHETIC-SECRET-OLD'),'[LP信息已脱敏]');assert.equal(projection.text('SYNTHETIC-SECRET-NEW'),'[LP信息已脱敏]');
 assert.equal((projection.project({investorId:id,profile:{kind:'natural',fields:{age:'47'}}}) as any).profile,'[LP信息已脱敏]');
 await assert.rejects(store.lpTransaction(s=>lpWrite(s,fund.id,id,'master',lpInput({requestId:randomUUID(),expectedRevision:2,type:'产品'},'master'),actor)));
});
test('source categories apply per investor and edits preserve uploaded proofs and reopen assessment',async()=>{
 const store=createMemoryLedgerStore(),fund=(await store.listFunds())[0];
 const created:any=await store.lpTransaction(s=>lpWrite(s,fund.id,undefined,'master',lpInput({requestId:randomUUID(),name:'product LP',type:'产品'},'master'),actor));
 const id=created.investor.id;
 let view:any=await store.lpTransaction(s=>raisingWrite(s,fund.id,id,raisingInput({requestId:randomUUID(),expectedRevision:1,action:'import',templateId:'uncustodied',ownerId:'user-admin',dueDate:'2026-11-01'}),actor));
 assert.equal(view.requirements.length,12);assert.equal(view.requirements.some((r:any)=>r.category==='base'),false);
 const item=view.requirements[0];
 view=await store.lpTransaction(s=>raisingWrite(s,fund.id,id,raisingInput({requestId:randomUUID(),expectedRevision:view.revision,action:'updateRequirement',itemId:item.id,required:true,ownerId:'user-admin',dueDate:'2026-12-01',note:'缺少签章页'}),actor));
 assert.equal(view.requirements[0].dueDate,'2026-12-01');assert.equal(view.requirements[0].incompleteNote,'缺少签章页');assert.equal(view.tasks[0].name,'缺少签章页');assert.match(view.tasks[0].note,/合伙协议/);assert.equal(view.tasks[0].dueDate,'2026-12-01');assert.equal(view.approved,false);
 const natural=fundraisingTemplates[0].materials.filter(x=>x.applicableTo.includes('natural'));
 assert(natural.some(x=>x.name.includes('银行账户')));assert(natural.some(x=>x.name.includes('资产或收入')));
 assert(fundraisingTemplates[0].materials.some(x=>x.name==='授权委托书'&&!x.required&&x.condition));
});
test('uploaded incomplete material cannot pass review; replacing original retains prior proof and supports recovery',async()=>{
 const store=createMemoryLedgerStore(),fund=(await store.listFunds())[0];
 const created:any=await store.lpTransaction(s=>lpWrite(s,fund.id,undefined,'master',lpInput({requestId:randomUUID(),name:'incomplete synthetic LP',type:'机构'},'master'),actor));
 const id=created.investor.id;
 await store.lpTransaction(async s=>{
  s.materials.push({id:'profile-test-material',relationships:{investors:[{id,name:'synthetic'}],funds:[],projects:[],companies:[]}} as any);
  for(const version of ['old','new'])s.versions.push({id:version,materialId:'profile-test-material',sha256:version} as any);
  const act=async(action:string,body:Record<string,unknown>,proof?:any)=>raisingWrite(s,fund.id,id,raisingInput({requestId:randomUUID(),expectedRevision:s.investors.find(i=>i.id===id)!.revision,action,...body}),actor,proof);
  let view=await act('requirement',{name:'盖章报表',required:true,ownerId:'user-admin',dueDate:'2026-11-01'});const itemId=view.requirements[0].id;
  const proof=(version:string)=>({id:'proof-'+version,materialId:'profile-test-material',versionId:version,sha256:version,name:'synthetic',sizeBytes:1,blobId:'synthetic'});
  await act('submit',{reviewerId:'user-admin',itemId,proof:{materialId:'profile-test-material',versionId:'old'}},proof('old'));
  await act('review',{decision:'approve',note:'人工核对'});
  view=await act('updateRequirement',{itemId,required:true,ownerId:'user-admin',dueDate:'2026-12-01',note:'缺少盖章页'});
  assert.equal(view.approved,false);assert.equal(view.requirements[0].available,true);
  await assert.rejects(act('review',{decision:'approve',note:'不应通过'}));
  view=await act('submit',{reviewerId:'user-admin',itemId,proof:{materialId:'profile-test-material',versionId:'new'}},proof('new'));
  assert.equal(view.requirements[0].proofHistory?.[0].versionId,'old');assert.equal(view.requirements[0].incompleteNote,'缺少盖章页');
  await act('updateRequirement',{itemId,required:true,ownerId:'user-admin',dueDate:'2026-12-01',note:''});
  view=await act('review',{decision:'approve',note:'重新核对盖章页完整'});assert.equal(view.approved,true);assert.equal(view.tasks[0].status,'已完成');
 });
});
test('reimport augments historical title-only checklist without replacing existing records',async()=>{
 const store=createMemoryLedgerStore(),fund=(await store.listFunds())[0];
 await store.lpTransaction(async s=>{
  const investor=s.investors.find(i=>i.fundId===fund.id)!;investor.type='自然人';
  const template=fundraisingTemplates[0],old={id:'legacy-signed-requirement',name:template.titles[0],required:true,ownerId:'user-admin',dueDate:'2026-01-01',source:{path:template.source,sha256:template.sha256}};
  (s.data.fundraising??={})[investor.id]={requirements:[old],plans:[],allocations:[],history:[]};
  const view=await raisingWrite(s,fund.id,investor.id,raisingInput({requestId:randomUUID(),expectedRevision:investor.revision??1,action:'import',templateId:'custodied',ownerId:'user-admin',dueDate:'2026-12-01',excludedMaterialIds:['自然人录音或录像']}),actor);
  assert.equal(view.requirements.filter(r=>r.name===old.name).length,1);assert.equal(view.requirements[0].id,old.id);assert.equal(view.requirements[0].dueDate,old.dueDate);assert(view.requirements.some(r=>r.name.includes('银行账户')));
 });
});
test('client and server original-form field labels remain in sync',async()=>{
 const {lpProfileFields:server}=await import('../src/ledger/lp-profile.ts');const {lpProfileFields:client}=await import('../../src/lib/lpProfile.ts');assert.deepEqual(server,client);
});
test('published LP custom fields validate exact namespaces, scalar types, required values and template versions',async()=>{
 const {validateLpTemplateProfile}=await import('../src/ledger/lp-profile.ts');
 const template={id:'lp-custom-template',version:2,status:'published',objectType:'lp',scope:'organization',ownerId:'user-admin',fields:[{id:'review',label:'核对情况',type:'choice',options:['已核对','待补充'],required:true,enabled:true},{id:'date',label:'核对日期',type:'date',required:false,enabled:true},{id:'verified',label:'人工确认',type:'boolean',required:false,enabled:true},{id:'amount',label:'规模',type:'number',required:false,enabled:true}]};
 const profile=(extraFields:any={},version=2)=>parseLpProfile({kind:'natural',fields:{},extraFields,templateRefs:[{id:template.id,version}]});
 const valid={'lp-custom-template:review':'已核对','lp-custom-template:date':'2026-11-05','lp-custom-template:verified':false,'lp-custom-template:amount':'123.45'};
 assert.doesNotThrow(()=>validateLpTemplateProfile({profile:profile(valid)},[template]));
 for(const extra of [{...valid,arbitrary:'bad'},{...valid,'lp-custom-template:review':'invented'},{...valid,'lp-custom-template:date':'2026-02-30'},{...valid,'lp-custom-template:verified':'true'},{...valid,'lp-custom-template:amount':'1e3'},{}])assert.throws(()=>validateLpTemplateProfile({profile:profile(extra)},[template]));
 assert.throws(()=>validateLpTemplateProfile({profile:profile(valid,1)},[template]),(e:any)=>e.code==='lp_template_version_conflict');
 assert.throws(()=>validateLpTemplateProfile({},[template]),(e:any)=>e.code==='lp_custom_fields_required');
 // Historical missing values do not block unrelated contact updates or completing other fields.
 assert.doesNotThrow(()=>validateLpTemplateProfile({},[template],{}));assert.doesNotThrow(()=>validateLpTemplateProfile({profile:profile({})},[template],{}));
 assert.throws(()=>validateLpTemplateProfile({profile:profile({})},[template],{profile:profile(valid)}));
 for(const p of [{kind:'natural',fields:{},extraFields:{x:{secret:'object'}}},{kind:'natural',fields:{},extraFields:{x:12}},{kind:'natural',fields:{},templateRefs:[{id:template.id,version:0}]}])assert.throws(()=>parseLpProfile(p));
});
test('LP custom values persist and enter privacy history while omission preserves prior namespace',async()=>{
 const store=createMemoryLedgerStore(),fund=(await store.listFunds())[0];
 let result:any=await store.lpTransaction(s=>lpWrite(s,fund.id,undefined,'master',lpInput({requestId:randomUUID(),name:'custom synthetic LP',type:'机构',profile:{kind:'institution',fields:{},extraFields:{'template:secret':'CUSTOM-LP-SECRET'},templateRefs:[{id:'template',version:1}]}},'master'),actor));
 result=await store.lpTransaction(s=>lpWrite(s,fund.id,result.investor.id,'master',lpInput({requestId:randomUUID(),expectedRevision:result.investor.revision,profile:{kind:'institution',fields:{officeAddress:'synthetic'}}},'master'),actor));
 assert.equal(result.investor.profile.extraFields['template:secret'],'CUSTOM-LP-SECRET');const privacy=await lpProjection(store);assert.equal(privacy.text('CUSTOM-LP-SECRET'),'[LP信息已脱敏]');
});
test('LP master API enforces published template contract, detects changes and replays committed requests',async()=>{
 const Fastify=(await import('fastify')).default,{registerLpRoutes}=await import('../src/http/lp-ledger.ts'),{AgentRepository}=await import('../src/agent/repository.ts');
 const store=createMemoryLedgerStore(),repository=new AgentRepository(),server=Fastify(),fund=(await store.listFunds())[0];
 registerLpRoutes(server,store,{auth:{mode:'local-bypass'},projectRoot:process.cwd(),agentRepository:repository});
 const template={id:'lp-api-template',ownerId:'user-admin',scope:'organization' as const,title:'Published LP form',objectType:'lp' as const,stage:'',version:1,status:'published' as const,fields:[{id:'check',label:'核对结果',type:'choice' as const,options:['已核对'],required:true,enabled:true}],materials:[]};
 await repository.transaction(s=>{s.templates.push(template);});
 const base=`/api/funds/${fund.id}/investors`,payload={requestId:randomUUID(),name:'API custom synthetic LP',type:'自然人',profile:{kind:'natural',fields:{},extraFields:{'lp-api-template:check':'已核对'},templateRefs:[{id:template.id,version:1}]}};
 try{
 const missing=await server.inject({method:'POST',url:base,payload:{requestId:randomUUID(),name:'missing',type:'自然人'}});assert.equal(missing.statusCode,400);assert.equal(missing.json().error,'lp_custom_fields_required');
 const saved=await server.inject({method:'POST',url:base,payload});assert.equal(saved.statusCode,200,saved.body);const id=saved.json().investor.id;
 await repository.transaction(s=>{s.templates.find(t=>t.id===template.id)!.version=2;});
 const replay=await server.inject({method:'POST',url:base,payload});assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().investor.id,id);
 const stale=await server.inject({method:'PATCH',url:base+'/'+id,payload:{...payload,requestId:randomUUID(),expectedRevision:1}});assert.equal(stale.statusCode,409);assert.equal(stale.json().error,'lp_template_version_conflict');
 const unrelated=await server.inject({method:'PATCH',url:base+'/'+id,payload:{requestId:randomUUID(),expectedRevision:1,contactName:'new contact'}});assert.equal(unrelated.statusCode,200,unrelated.body);assert.equal(unrelated.json().investor.profile.extraFields['lp-api-template:check'],'已核对');
 }finally{await server.close();}
});
test('retired template values remain unchanged historical evidence without granting new arbitrary keys',async()=>{
 const {validateLpTemplateProfile}=await import('../src/ledger/lp-profile.ts'),previous={profile:parseLpProfile({kind:'natural',fields:{},extraFields:{'retired:field':'retained'},templateRefs:[{id:'retired',version:1}]})};
 assert.doesNotThrow(()=>validateLpTemplateProfile({profile:parseLpProfile({...previous.profile,templateRefs:[]})},[],previous));
 assert.throws(()=>validateLpTemplateProfile({profile:parseLpProfile({...previous.profile,extraFields:{'retired:field':'changed'},templateRefs:[]})},[],previous));
 assert.throws(()=>validateLpTemplateProfile({profile:parseLpProfile({kind:'natural',fields:{},templateRefs:[{id:'fabricated',version:1}]})},[]));
});
test('legacy type aliases accept matching original profile and keep the historical type label',async()=>{
 const store=createMemoryLedgerStore(),fund=(await store.listFunds())[0];const saved:any=await store.lpTransaction(s=>lpWrite(s,fund.id,undefined,'master',lpInput({requestId:randomUUID(),name:'legacy alias synthetic',type:'机构投资者',profile:{kind:'institution',fields:{}}},'master'),actor));assert.equal(saved.investor.type,'机构投资者');assert.equal(saved.investor.profile.kind,'institution');
});
