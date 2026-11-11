import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {canReadMaterial} from '../src/http/material-files.ts';
import {canReadLp,lpProjection} from '../src/ledger/lp-privacy.ts';
import {getAdminUser,resolveAuthConfig} from '../src/auth/session.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const secret='lp-privacy-synthetic-test-secret';
const auth={mode:'password' as const,sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'test-password'};
const syntheticStore=()=>{const state=createSeedLedgerState();state.investors=state.investors.map((i,n)=>({...i,name:'Synthetic LP '+n}));return createMemoryLedgerStore(state);};
const user=(role:any)=>role==='admin'?getAdminUser(resolveAuthConfig(auth)):({id:'lp-test-'+role,name:'Synthetic tester',email:role+'@example.invalid',role});

test('LP stable-ID policy protects all roles, old nested snapshots and encoded names without mutating source',async()=>{
 const store=syntheticStore();const registry=await store.readLpPrivacy();const identity=registry.identities[0];
 const original={recordType:'investor',id:identity.id,name:identity.name,phone:'13000000000',email:'lp@example.invalid',nested:{old:identity.name,href:encodeURIComponent(identity.name)}};
 const policy=await lpProjection(store);const projected=policy.project(original) as any;
 assert.equal(projected.phone,'[LP信息已脱敏]');assert.equal(projected.email,'[LP信息已脱敏]');assert.equal(projected.nested.old,'[LP信息已脱敏]');assert.notEqual(projected.nested.href,original.nested.href);assert.equal(original.name,identity.name);
 const material={...(await store.listMaterials())[0],relationships:{funds:[],projects:[],companies:[],investors:[{id:identity.id,name:identity.name}]}};
 for(const role of ['admin','investment_manager','finance','legal','post_investment','viewer']) {
  assert.equal(canReadLp(user(role)),['admin','investment_manager','finance','legal'].includes(role));
  if(!canReadLp(user(role))) assert.equal(canReadMaterial(user(role),material),false);
 }
 const fund=(await store.listFunds())[0];const detail=await store.getFundDetail(fund.id);const originalName=detail!.investors[0].name;detail!.investors[0].name='Synthetic renamed LP';const renamed=await lpProjection(store);assert.equal(renamed.text(originalName),'[LP信息已脱敏]');assert.equal(renamed.text('Synthetic renamed LP'),'[LP信息已脱敏]');
 assert.equal(canReadLp(null),false);
});

test('API masks fund DTO, arbitrary deep JSON and 409 receipts; immutable JSON/HTML/Buffer withheld and AI payload sanitized',async()=>{
 const store=syntheticStore();const identity=(await store.readLpPrivacy()).identities[0];let upstream='';
 const server=createTestServer({auth,ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic-key'},fetchImpl:async(_url,init)=>{upstream=init?.body??'';return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:identity.name}}]})};}}});
 server.get('/api/lp-test/deep',async(_r,reply)=>reply.code(409).send({latest:{name:identity.name}}));
 server.get('/api/lp-test/immutable',async(_r,reply)=>reply.type('application/json').send(JSON.stringify({name:identity.name})));
 server.get('/api/lp-test/buffer',async(_r,reply)=>reply.header('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(identity.name)}`).header('content-length',Buffer.byteLength(identity.name)).send(Buffer.from(identity.name)));
 const cookie=await registeredCookie(server,user('viewer'),secret);const headers={cookie};
 const deniedBuffer=await server.inject({url:'/api/lp-test/buffer',headers});assert.equal(deniedBuffer.statusCode,403);assert.equal(deniedBuffer.headers['content-disposition'],undefined);assert.equal(Number(deniedBuffer.headers['content-length']),Buffer.byteLength(deniedBuffer.body));
 assert.equal((await server.inject({url:'/api/lp-test/deep',headers})).body.includes(identity.name),false);
 for(const url of ['/api/lp-test/immutable','/api/lp-test/buffer']) assert.equal((await server.inject({url,headers})).statusCode,403);
 const result=await server.inject({method:'POST',url:'/api/ai/chat',headers,payload:{prompt:identity.name,context:{fund:identity.name},history:[{role:'user',content:identity.name}]}});
 assert.equal(result.statusCode,200);assert.equal(upstream.includes(identity.name),false);assert.equal(result.body.includes(identity.name),false);
 await server.close();
});

test('material privacy stays after relationship removal; direct version/Range URL fails before bytes; ordinary material retains access',async()=>{
 const state=createSeedLedgerState();state.investors=state.investors.map((i,n)=>({...i,name:'Synthetic LP '+n}));
 const m={id:'lp-test-material',fundId:state.investors[0].fundId,projectId:null,name:'Synthetic private document',type:'PDF',uploader:'Synthetic',time:'2026-11-01',source:'test',status:'ready',quotes:'',project:'',path:''} as any;state.materials.push(m);m.relationships={funds:[],projects:[],companies:[],investors:[{id:state.investors[0].id,name:state.investors[0].name}]};
 const store=createMemoryLedgerStore(state);const live=(await store.listMaterials())[0];live.relationships!.investors=[];
 assert.equal((await store.listMaterials())[0].lpSensitive,true);
 const ordinary={...live,lpSensitive:false};assert.equal(canReadMaterial(user('viewer'),ordinary),Boolean(ordinary.fundId||ordinary.projectId));
 const server=createTestServer({auth,ledgerStore:store});
 for(const role of ['admin','investment_manager','finance','legal','post_investment','viewer']) {
  const cookie=await registeredCookie(server,user(role),secret);
  const fund=await server.inject({url:'/api/funds/'+state.investors[0].fundId,headers:{cookie}});
  assert.equal(fund.statusCode,200);assert.equal(fund.body.includes('Synthetic LP 0'),canReadLp(user(role)));
  const response=await server.inject({url:`/api/materials/${m.id}/versions/unknown/file`,headers:{cookie,range:'bytes=0-9'}});
  if(!canReadLp(user(role))) assert.equal(response.statusCode,403);
 }
 assert.equal((await server.inject({url:'/api/funds/'+state.investors[0].fundId})).statusCode,401);
 await server.close();
});

test('explicit investor scope/category needs no investor relation, and reclassification cannot unprotect old versions',async()=>{
 const state=createSeedLedgerState();
 const base={fundId:state.funds[0].id,projectId:null,name:'Synthetic classified document',type:'PDF',uploader:'Synthetic',time:'2026-11-01',source:'test',status:'ready',quotes:'',project:'',path:'',relationships:{funds:[],projects:[],companies:[],investors:[]}};
 state.materials=[{...base,id:'scope-lp',primaryScope:'investor'},{...base,id:'category-lp',type:'投资者适当性资料'},{...base,id:'ordinary',primaryScope:'fund'}];
 const store=createMemoryLedgerStore(state);
 const materials=await store.listMaterials();
 for(const m of materials.filter(m=>['scope-lp','category-lp'].includes(m.id))) {assert.equal(m.lpSensitive,true);assert.equal(canReadMaterial(user('viewer'),m),false);m.primaryScope='fund';m.type='PDF';m.lpSensitive=false;}
 const after=await store.listMaterials();
 assert.equal(after.find(m=>m.id==='scope-lp')!.lpSensitive,true);assert.equal(after.find(m=>m.id==='category-lp')!.lpSensitive,true);assert.equal(canReadMaterial(user('viewer'),after.find(m=>m.id==='ordinary')!),true);
 const server=createTestServer({auth,ledgerStore:store});const cookie=await registeredCookie(server,user('viewer'),secret);
 for(const id of ['scope-lp','category-lp']) {
  const response=await server.inject({url:`/api/materials/${id}/versions/old/file`,headers:{cookie,range:'bytes=0-3'}});
  assert.equal(response.statusCode,403);
 }
 const list=await server.inject({url:'/api/materials',headers:{cookie}});assert.deepEqual(list.json().materials.map((m:any)=>m.id),['ordinary']);
 await server.close();
});

test('LP privacy runs after custom metadata enrichment on company/project/fund list, detail and export',async()=>{
 const store=syntheticStore();const identity=(await store.readLpPrivacy()).identities[0];
 await store.masterTransaction(s=>{
  for(const kind of ['company','project','fund'] as const) s.schemas[kind]={schemaRevision:1,fields:[{id:'note',label:identity.name,type:'text',required:false,enabled:true,order:0}]};
  if(!s.companies.length)s.companies.push({id:'synthetic-company',name:'Synthetic company',shortName:'Synthetic',industry:'',masterRevision:1} as any);
  s.projects[0].companyId=s.companies[0].id;
  for(const record of [...s.companies,...s.projects,...s.funds])Object.assign(record,{customFields:{note:identity.name},customFieldSchemaRevision:1});
 });
 await store.fundTransaction(s=>{for(const record of s.funds)Object.assign(record,{customFields:{note:identity.name},schemaRevision:1});});
 const server=createTestServer({auth,ledgerStore:store});const cookie=await registeredCookie(server,user('viewer'),secret);
 for(const kind of ['company','project','fund'] as const){
  const plural=kind==='company'?'companies':kind+'s';const records=await (kind==='company'?store.listCompanies():kind==='project'?store.listProjects():store.listFunds());const id=records[0].id;
  for(const url of [`/api/${plural}`,`/api/${plural}/${id}`,`/api/custom-field-export/${kind}`]){
   const result=await server.inject({url,headers:{cookie}});assert.equal(result.statusCode,200);assert.equal(result.body.includes(identity.name),false,`${kind} metadata must be projected after enrichment`);
   const data=result.json();const record=data[kind]??(data[plural]??data.records).find((r:any)=>r.id===id);assert.equal(record.customFields.note,'[LP信息已脱敏]');assert.equal(record.customFieldSchema.fields[0].label,'[LP信息已脱敏]');
  }
 }
 await server.close();
});

test('AI sanitizes evidence from readable ordinary material before sending complete model payload',async()=>{
 const store=syntheticStore();const identity=(await store.readLpPrivacy()).identities[0];const fund=(await store.listFunds())[0];
 const ordinary={id:'ordinary-ai-source',fundId:fund.id,projectId:null,name:'Synthetic ordinary evidence',type:'PDF',uploader:'Synthetic',time:'2026-11-01',source:'test',status:'ready',quotes:'',project:'',path:'',dataOrigin:'source_file'};
 store.listMaterials=()=>[ordinary];store.searchMaterialTextChunks=()=>[{materialId:ordinary.id,page:1,text:identity.name+' 联系电话13000000000，邮箱fixture-lp@example.invalid',dataOrigin:'source_file'} as any];
 let upstream='';const server=createTestServer({auth,ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic-key'},fetchImpl:async(_url,init)=>{upstream=init?.body??'';return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'Synthetic response'}}]})};}}});
 for(const role of ['viewer','admin']) {
  const cookie=await registeredCookie(server,user(role),secret);const result=await server.inject({method:'POST',url:'/api/ai/chat',headers:{cookie},payload:{prompt:'Summarize evidence',includeDemo:false}});
  assert.equal(result.statusCode,200);const modelPayload=JSON.parse(upstream);assert.ok(JSON.stringify(modelPayload.messages).includes('ordinary-ai-source'));assert.equal(JSON.stringify(modelPayload.messages).includes(identity.name),canReadLp(user(role)),'retrieved evidence is part of model privacy boundary');assert.equal(upstream.includes('13000000000'),canReadLp(user(role)));assert.equal(upstream.includes('fixture-lp@example.invalid'),canReadLp(user(role)));
 }
 await server.close();
});

test('short LP names mask free text while stable protocol fields and controlled API references remain usable',async()=>{
 const state=createSeedLedgerState();state.investors[0].name='a';const store=createMemoryLedgerStore(state);const policy=await lpProjection(store);
 const dto={id:'project-a123',sha256:'a'.repeat(64),name:'a',description:'a private note',projectId:'project-a123',recordType:'material',downloadHref:'/api/materials/a123/versions/b456/file',customFields:{projectId:'a',sha256:'a'}};
 const projected=policy.project(dto) as any;
 for(const key of ['id','sha256','projectId','recordType','downloadHref'] as const)assert.equal(projected[key],dto[key],key+' is a protocol value');
 assert.equal(projected.name,'[LP信息已脱敏]');assert.equal(projected.description,'[LP信息已脱敏]');assert.equal(policy.text('capital data'),'capital data');assert.equal(projected.customFields.projectId,'[LP信息已脱敏]');assert.equal(projected.customFields.sha256,'[LP信息已脱敏]');
 const server=createTestServer({auth,ledgerStore:store});server.get('/api/lp-test/short',async()=>dto);
 const cookie=await registeredCookie(server,user('viewer'),secret);const response=await server.inject({url:'/api/lp-test/short',headers:{cookie}});assert.equal(response.statusCode,200);assert.deepEqual(response.json(),projected);await server.close();
});

test('short identity never changes AI envelope roles/model; untrusted client keys do not receive DTO exemptions',async()=>{
 const state=createSeedLedgerState();state.investors[0].name='a';const store=createMemoryLedgerStore(state);const policy=await lpProjection(store);
 assert.deepEqual(policy.freeText({id:'a',sha256:'a',context:{recordType:'a'}}),{id:'[LP信息已脱敏]',sha256:'[LP信息已脱敏]',context:{recordType:'[LP信息已脱敏]'}});
 let upstream:any;const server=createTestServer({auth,ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic-key',QWEN_MODEL:'model-a'},fetchImpl:async(_url,init)=>{upstream=JSON.parse(init?.body??'{}');return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'Synthetic reply'}}]})};}}});
 const cookie=await registeredCookie(server,user('viewer'),secret);const response=await server.inject({method:'POST',url:'/api/ai/chat',headers:{cookie},payload:{prompt:'a',history:[{role:'assistant',content:'a'}]}});
 assert.equal(response.statusCode,200);assert.equal(upstream.model,'model-a');assert.deepEqual(upstream.messages.map((m:any)=>m.role),['system','system','assistant','user']);assert.ok(upstream.messages[2].content==='[LP信息已脱敏]');assert.ok(upstream.messages[3].content.includes('[LP信息已脱敏]'));
 const detail=await store.getFundDetail(state.investors[0].fundId);detail!.investors.find(i=>i.id===state.investors[0].id)!.name='assistant';
 const again=await server.inject({method:'POST',url:'/api/ai/chat',headers:{cookie},payload:{prompt:'assistant',history:[{role:'assistant',content:'assistant'}]}});assert.equal(again.statusCode,200);assert.equal(upstream.messages[2].role,'assistant');assert.equal(upstream.messages[2].content,'[LP信息已脱敏]');
 await server.close();
});

test('known LP context hides whole audit prose and contact fields, while unrelated contact prose stays available',async()=>{
 const store=syntheticStore(),identity=(await store.readLpPrivacy()).identities[0],policy=await lpProjection(store);
 const phone='13000000000',email='fixture-lp@example.invalid';const prose=`${identity.name} 联系电话${phone}，邮箱${email}`;
 const projected=policy.project({audit:{note:prose},related:{investorId:identity.id,phone,email,nested:{phone,email},note:`Contact ${phone} ${email}`},ordinary:{note:`Support ${phone} ${email}`}}) as any;
 assert.equal(projected.audit.note,'[LP信息已脱敏]');assert.equal(projected.related.phone,'[LP信息已脱敏]');assert.equal(projected.related.email,'[LP信息已脱敏]');assert.equal(projected.related.nested.phone,'[LP信息已脱敏]');assert.equal(projected.related.note,'[LP信息已脱敏]');assert.equal(projected.ordinary.note,`Support ${phone} ${email}`);
});

test('AI sanitizes dynamic leaves once while evidence protocol keys and IDs matching LP names retain ordinary facts',async()=>{
 for(const name of ['material','a']) {
  const state=createSeedLedgerState();state.investors[0].name=name;const store=createMemoryLedgerStore(state);const fund=(await store.listFunds())[0];
  const id=name==='a'?'a':'ordinary-ai-source';const material={id,fundId:fund.id,projectId:null,name:'Ordinary source',type:'PDF',uploader:'Synthetic',time:'2026-11-01',source:'test',status:'ready',quotes:'',project:'',path:'',dataOrigin:'source_file'};
  store.listMaterials=()=>[material];store.searchMaterialTextChunks=()=>[{materialId:id,page:1,text:'Ordinary public fact',dataOrigin:'source_file',sourceBasis:[{id,recordType:'material',dataOrigin:'source_file'}]} as any];
  let upstream:any;const server=createTestServer({auth,ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic-key',QWEN_MODEL:'model-a'},fetchImpl:async(_url,init)=>{upstream=JSON.parse(init?.body??'{}');return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'Ordinary response'}}]})};}}});
  const cookie=await registeredCookie(server,user('viewer'),secret);const response=await server.inject({method:'POST',url:'/api/ai/chat',headers:{cookie},payload:{prompt:`${name} phone13000000000`,attachmentName:`${name} fixture-lp@example.invalid`,history:[{role:'assistant',content:`${name} phone13000000000`}],context:{id:name,role:`${name} fixture-lp@example.invalid`}}});
  assert.equal(response.statusCode,200);assert.equal(upstream.model,'model-a');assert.ok(upstream.messages[1].content.includes('Ordinary public fact'));assert.ok(upstream.messages[1].content.includes(`"materialId":"${id}"`));assert.ok(upstream.messages[1].content.includes('"recordType":"material"'));assert.equal(JSON.stringify(upstream).includes('13000000000'),false);assert.equal(JSON.stringify(upstream).includes('fixture-lp@example.invalid'),false);assert.equal(upstream.messages[2].role,'assistant');await server.close();
 }
});

test('immutable JSON strings and buffers preserve protocol-only archives byte for byte but withhold LP prose',async()=>{
 const state=createSeedLedgerState();state.investors[0].name='material';const store=createMemoryLedgerStore(state);
 const original=' {"materialId":"ordinary","recordType":"material","note":"Ordinary public fact"} \n';const sensitive=JSON.stringify({materialId:'ordinary',note:'material phone13000000000 fixture-lp@example.invalid'});
 const server=createTestServer({auth,ledgerStore:store});
 for(const mode of ['string','buffer'])for(const kind of ['ordinary','sensitive'])server.get(`/api/lp-test/raw-${mode}-${kind}`,async(_request,reply)=>reply.type('application/json').send(mode==='buffer'?Buffer.from(kind==='ordinary'?original:sensitive):kind==='ordinary'?original:sensitive));
 const cookie=await registeredCookie(server,user('viewer'),secret);
 for(const mode of ['string','buffer']){
  const ordinary=await server.inject({url:`/api/lp-test/raw-${mode}-ordinary`,headers:{cookie}});assert.equal(ordinary.statusCode,200);assert.equal(ordinary.body,original);
  const denied=await server.inject({url:`/api/lp-test/raw-${mode}-sensitive`,headers:{cookie}});assert.equal(denied.statusCode,403);assert.equal(denied.body.includes('13000000000'),false);
 }
 await server.close();
});

test('download header protocol tokens are preserved while actual filenames and visible location values are protected',async()=>{
 for(const name of ['attachment','inline','UTF-8','material']) {
  const state=createSeedLedgerState();state.investors[0].name=name;const store=createMemoryLedgerStore(state);const server=createTestServer({auth,ledgerStore:store});
  server.get('/api/lp-test/header-safe',async(_r,reply)=>reply.header('content-disposition',"attachment; filename*=UTF-8''ordinary.pdf").header('location','/api/materials/material/versions/a/file?name=ordinary').send('Ordinary public fact'));
  server.get('/api/lp-test/header-private',async(_r,reply)=>reply.header('content-disposition',`inline; filename*=UTF-8''${encodeURIComponent(name)}.pdf`).send('Ordinary public fact'));
  server.get('/api/lp-test/location-private',async(_r,reply)=>reply.header('location',`/api/materials/material/versions/a/file?name=${encodeURIComponent(name)}`).send('Ordinary public fact'));
  const cookie=await registeredCookie(server,user('viewer'),secret);assert.equal((await server.inject({url:'/api/lp-test/header-safe',headers:{cookie}})).statusCode,200);
  for(const url of ['/api/lp-test/header-private','/api/lp-test/location-private']){const response=await server.inject({url,headers:{cookie}});assert.equal(response.statusCode,403);assert.equal(response.headers['content-disposition'],undefined);assert.equal(response.headers.location,undefined);}
  await server.close();
 }
});

test('classified LP material IDs protect nameless historical snapshots and derived prose without hiding ordinary siblings',async()=>{
 const store=syntheticStore();store.readLpPrivacy=()=>({identities:[],materialIds:['classified-lp-material']});const policy=await lpProjection(store);
 const ref={materialId:'classified-lp-material',versionId:'v1',name:'Synthetic unregistered holder.txt',sha256:'a'.repeat(64),sizeBytes:40,downloadHref:'/api/materials/classified-lp-material/versions/v1/file'};
 const dto={fund:{id:'ordinary-fund',name:'Ordinary fund',status:'active'},materials:[ref,{materialId:'ordinary',name:'Public document',downloadHref:'/api/materials/ordinary/versions/v1/file'}],note:'Unregistered holder phone13000000000',report:{id:'report',status:'draft',sections:{summary:'fixture-lp@example.invalid'},sourceBasis:[{id:'classified-lp-material',recordType:'material',dataOrigin:'source_file'}]}};
 const {publicDiligence}=await import('../src/http/diligence.ts');
 const workflow=policy.project(publicDiligence({round:{id:'round',status:'pending',materials:[{...ref,packetBlobId:'private-blob'}],summary:'Unknown phone13000000000'},diligence:{findings:[{id:'finding',evidence:[ref],description:'fixture-lp@example.invalid',status:'open'}]}})) as any;
 assert.equal(workflow.round.summary,'[LP信息已脱敏]');assert.equal(workflow.round.status,'pending');assert.equal(workflow.round.materials[0].packetBlobId,undefined);assert.ok(Array.isArray(workflow.diligence.findings));assert.equal(workflow.diligence.findings[0].description,'[LP信息已脱敏]');assert.equal(workflow.diligence.findings[0].status,'open');
 const before=JSON.stringify(dto);const projected=policy.project(dto) as any;assert.equal(JSON.stringify(dto),before);assert.equal(projected.note,'[LP信息已脱敏]');assert.equal(projected.materials[0].downloadHref,undefined);assert.equal(projected.materials[0].name,'[LP信息已脱敏]');assert.equal(projected.materials[0].readIssue,'lp_privacy_forbidden');assert.equal(projected.materials[0].sha256,ref.sha256);assert.equal(projected.materials[0].versionId,'v1');assert.deepEqual(projected.fund,dto.fund);assert.deepEqual(projected.materials[1],dto.materials[1]);assert.deepEqual(projected.report.sections,{summary:'[LP信息已脱敏]'});assert.equal(projected.report.status,'draft');const client=policy.freeText({context:{...ref,text:'Unknown phone13000000000'}});assert.equal(JSON.stringify(client).includes('13000000000'),false);assert.equal(JSON.stringify(client).includes('Synthetic unregistered'),false);assert.equal(projected.report.sourceBasis[0].id,'classified-lp-material');
 const server=createTestServer({auth,ledgerStore:store});server.get('/api/lp-test/material-snapshot',async()=>dto);const raw=JSON.stringify(dto);server.get('/api/lp-test/material-raw',async(_r,reply)=>reply.type('application/json').send(raw));
 const viewer=await registeredCookie(server,user('viewer'),secret);const safe=await server.inject({url:'/api/lp-test/material-snapshot',headers:{cookie:viewer}});assert.equal(safe.statusCode,200);assert.equal(safe.body.includes('13000000000'),false);assert.equal(safe.body.includes('fixture-lp@example.invalid'),false);assert.equal((await server.inject({url:'/api/lp-test/material-raw',headers:{cookie:viewer}})).statusCode,403);
 const admin=await registeredCookie(server,user('admin'),secret);assert.equal((await server.inject({url:'/api/lp-test/material-raw',headers:{cookie:admin}})).body,raw);await server.close();
});

test('AI excludes classified nameless LP input before model composition while ordinary evidence remains',async()=>{
 const store=syntheticStore();store.readLpPrivacy=()=>({identities:[],materialIds:['classified-lp-material']});const fund=(await store.listFunds())[0];
 const base={fundId:fund.id,projectId:null,name:'Ordinary source',type:'PDF',uploader:'Synthetic',time:'2026-11-01',source:'test',status:'ready',quotes:'',project:'',path:'',dataOrigin:'source_file'};
 store.listMaterials=()=>[{...base,id:'classified-lp-material',primaryScope:'investor'}, {...base,id:'ordinary'}];store.searchMaterialTextChunks=()=>[{materialId:'classified-lp-material',page:1,text:'Unknown holder phone13000000000',dataOrigin:'source_file'},{materialId:'ordinary',page:1,text:'Public business fact',dataOrigin:'source_file'}] as any;
 let upstream='';const server=createTestServer({auth,ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic-key'},fetchImpl:async(_url,init)=>{upstream=init?.body??'';return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'Public reply'}}]})};}}});const cookie=await registeredCookie(server,user('viewer'),secret);
 const result=await server.inject({method:'POST',url:'/api/ai/chat',headers:{cookie},payload:{prompt:'Summarize facts',includeDemo:false,context:{materialId:'classified-lp-material',text:'phone13000000000'}}});assert.equal(result.statusCode,200);assert.equal(upstream.includes('13000000000'),false);assert.equal(upstream.includes('classified-lp-material'),false);assert.ok(upstream.includes('Public business fact'));await server.close();
});

test('privacy namespaces do not turn colliding project/fund IDs into LP materials or investors',async()=>{
 const store=syntheticStore();store.readLpPrivacy=()=>({identities:[{id:'shared-record',name:'Private holder'}],materialIds:['shared-record']});const policy=await lpProjection(store);
 const ordinary={project:{id:'shared-record',name:'Ordinary project',industry:'Technology',masterRevision:1,phone:'public hotline'},fund:{id:'shared-record',name:'Ordinary fund',status:'active'}};
 assert.deepEqual(policy.project(ordinary),ordinary);const typedOther={materials:[{recordType:'project',id:'shared-record',name:'Ordinary project'}],investors:[{recordType:'company',id:'shared-record',name:'Ordinary company',phone:'public hotline'}]};assert.deepEqual(policy.project(typedOther),typedOther);
 const sensitive=policy.project({materials:[{id:'shared-record',name:'Unknown LP file'}],investors:[{id:'shared-record',name:'Unknown holder',phone:'13000000000'}],sourceBasis:[{id:'shared-record',recordType:'material',dataOrigin:'source_file'}]}) as any;
 assert.equal(sensitive.materials[0].readIssue,'lp_privacy_forbidden');assert.equal(sensitive.investors[0].phone,'[LP信息已脱敏]');assert.equal(sensitive.sourceBasis[0].readIssue,'lp_privacy_forbidden');
});

test('version-only source references resolve real parent privacy and unknown parents stay explicitly restricted',async()=>{
 const store=syntheticStore();store.readLpPrivacy=()=>({identities:[],materialIds:['private-parent'],materialVersions:[{id:'private-v1',materialId:'private-parent'},{id:'public-v1',materialId:'public-parent'}]});const policy=await lpProjection(store);
 const projected=policy.project({reports:[{id:'r1',note:'Private holder phone13000000000',sourceBasis:[{id:'private-v1',recordType:'material_version',dataOrigin:'source_file'}]},{id:'r2',note:'Ordinary report',sourceBasis:[{id:'public-v1',recordType:'material_version',dataOrigin:'source_file'}]},{id:'r3',note:'Unresolved report',sourceBasis:[{id:'unknown-v1',recordType:'material_version',dataOrigin:'source_file'}]}]}) as any;
 assert.equal(projected.reports[0].note,'[LP信息已脱敏]');assert.equal(projected.reports[0].sourceBasis[0].readIssue,'lp_privacy_forbidden');assert.equal(projected.reports[1].note,'Ordinary report');assert.equal(projected.reports[1].sourceBasis[0].readIssue,undefined);assert.equal(projected.reports[2].note,'[资料关联待核实]');assert.equal(projected.reports[2].sourceBasis[0].name,'[资料关联待核实]');assert.equal(projected.reports[2].sourceBasis[0].readIssue,'material_privacy_unknown');const mixed=policy.project({note:'Unverified content',sections:[{body:'Unknown prose',status:'draft'}],sourceBasis:[{id:'unknown-v1',recordType:'material_version'},{id:'private-v1',recordType:'material_version'}]}) as any;assert.equal(mixed.note,'[LP信息已脱敏]');assert.equal(mixed.sections[0].body,'[LP信息已脱敏]');assert.equal(mixed.sections[0].status,'draft');const neutral=policy.project({sections:[{body:'Unknown prose',status:'draft'}],sourceBasis:[{id:'unknown-v1',recordType:'material_version'}]}) as any;assert.equal(neutral.sections[0].body,'[资料关联待核实]');assert.equal(neutral.sections[0].status,'draft');
});

test('real post-investment GET protects visit analysis and owned follow-ups, financial reasons and clause prose',async()=>{
 const store=syntheticStore();store.readLpPrivacy=()=>({identities:[],materialIds:['private-ref']});const project=(await store.listProjects())[0],actor=user('admin');const ref={materialId:'private-ref',versionId:'v1',name:'Unknown holder',sha256:'a'.repeat(64),sizeBytes:10,downloadHref:'/api/materials/private-ref/versions/v1/file'};
 const secretText='Unknown holder 13000000000 fixture-lp@example.invalid';
 await store.workflowTransaction(project.id,async s=>{s.postInvestment={revision:1,financials:[{id:'financial',version:1,dealId:'deal',owner:actor,time:'2026-11-01',reason:'',period:{kind:'month',value:'2026-11'},asOfDate:'2026-11-01',currency:'CNY',basis:secretText,source:secretText,revenue:'100.00',netProfit:null,netAssets:null,valuation:null,employees:null,missingReasons:{netProfit:secretText},evidence:[ref],reviewer:actor,status:'draft',decisions:[]}],visits:[{id:'visit',version:1,dealId:'deal',owner:actor,time:'2026-11-01',reason:'',date:'2026-11-01',analysis:secretText,evidence:[ref],followUps:[{title:secretText,owner:actor,dueDate:'2026-12-01',taskId:'followup-task'}]}],archives:[],clauses:[{id:'clause',version:1,dealId:'deal',owner:actor,time:'2026-11-01',reason:'',agreementId:'agreement',title:'Clause',quote:secretText,sourceLocation:secretText,obligation:secretText,threshold:secretText,triggerDate:'2026-12-01',signedMaterial:ref,status:'fulfilled'}]};});
 const server=createTestServer({auth,ledgerStore:store}),cookie=await registeredCookie(server,user('viewer'),secret);const response=await server.inject({url:`/api/projects/${project.id}/post-investment`,headers:{cookie}});assert.equal(response.statusCode,200);assert.equal(response.body.includes('13000000000'),false);const post=response.json().postInvestment;assert.equal(post.visits[0].analysis,'[LP信息已脱敏]');assert.equal(post.visits[0].followUps[0].title,'[LP信息已脱敏]');assert.equal(post.visits[0].followUps[0].taskId,'followup-task');assert.equal(post.visits[0].followUps[0].dueDate,'2026-12-01');assert.equal(post.financials[0].revenue,'100.00');assert.equal(post.financials[0].missingReasons.netProfit,'[LP信息已脱敏]');assert.equal(post.financials[0].currency,'CNY');assert.equal(post.clauses[0].threshold,'[LP信息已脱敏]');assert.equal(post.clauses[0].status,'fulfilled');await server.close();
});

test('evidence consumer DTO inventory protects owned prose containers and preserves financial/protocol leaves',async()=>{
 const store=syntheticStore();store.readLpPrivacy=()=>({identities:[],materialIds:['private-ref']});const policy=await lpProjection(store),sensitive='Unknown holder 13000000000 fixture-lp@example.invalid',evidence=[{materialId:'private-ref',versionId:'v1'}];
 const records=[
  {id:'workflow',note:sensitive,decisions:[{opinion:sensitive,decision:'approve',time:'2026-11-01'}],materials:evidence},
  {id:'deal',content:sensitive,template:sensitive,responsibility:{duties:sensitive,schedules:[{id:'schedule',title:sensitive,frequency:'monthly',firstDueDate:'2026-12-01',taskIds:['task']}]},conditions:[{id:'condition',title:sensitive}],sourceBasis:[{id:'private-ref',recordType:'material'}]},
  {id:'exit',priceReason:sensitive,pricingBasis:sensitive,counterparty:sensitive,strategy:sensitive,consideration:'10.25',documents:[{kind:'plan',location:sensitive,material:evidence[0]}]},
  {id:'cashflow',bankAccount:'13000000000',bankReference:sensitive,amount:'123.45',date:'2026-11-01',currency:'CNY',reversal:{reason:sensitive,type:'correction_of_registration',evidence}},
  {id:'return',derivationText:sensitive,terms:{basis:'gross',measure:'total',explanation:sensitive,tolerance:'0.001'},coverage:{fees:{status:'unknown',explanation:sensitive,evidence}},cashflows:[{kind:sensitive,amount:'100.25',date:'2026-11-01',direction:'outflow',currency:'CNY'}],evidence},
  {id:'asset',completionReview:sensitive,title:sensitive,description:sensitive,reason:sensitive,evidence},
 ];
 const projected=policy.project(records) as any[];assert.equal(JSON.stringify(projected).includes('13000000000'),false);assert.equal(JSON.stringify(projected).includes('fixture-lp@example.invalid'),false);assert.equal(projected[1].responsibility.schedules[0].frequency,'monthly');assert.deepEqual(projected[1].responsibility.schedules[0].taskIds,['task']);assert.equal(projected[2].consideration,'10.25');assert.equal(projected[2].documents[0].kind,'plan');assert.equal(projected[3].amount,'123.45');assert.equal(projected[4].terms.basis,'gross');assert.equal(projected[4].terms.tolerance,'0.001');assert.equal(projected[4].cashflows[0].amount,'100.25');assert.equal(projected[4].cashflows[0].direction,'outflow');
});

test('diligence supplement and sibling action tasks inherit only their typed same-project item/report dependency',async()=>{
 const store=syntheticStore();store.readLpPrivacy=()=>({identities:[],materialIds:['private-ref']});const policy=await lpProjection(store),prose='Unknown holder 13000000000';
 const payload={diligence:{id:'case',projectId:'project-1',items:[{id:'same-id',submissions:[{evidence:[{material:{materialId:'private-ref',versionId:'v1'}}]}]},{id:'ordinary',submissions:[]}],reports:[{id:'report',source:{items:[{evidence:[{materialId:'private-ref'}]}]}}],supplements:[{taskId:'task1',itemId:'same-id',opinion:prose,note:prose,status:'open'},{taskId:'task2',reportId:'report',opinion:prose,status:'open'},{taskId:'ordinary-task',itemId:'ordinary',opinion:'Ordinary follow-up',status:'open'}]},tasks:[{id:'task1',projectId:'project-1',kind:'diligence',note:prose,status:'进行中'},{id:'task1',projectId:'other-project',kind:'diligence',note:'Other project ordinary',status:'进行中'}],project:{id:'same-id',name:'Ordinary project'}};
 const result=policy.project(payload) as any;assert.equal(result.diligence.supplements[0].opinion,'[LP信息已脱敏]');assert.equal(result.diligence.supplements[0].note,'[LP信息已脱敏]');assert.equal(result.diligence.supplements[1].opinion,'[LP信息已脱敏]');assert.equal(result.diligence.supplements[2].opinion,'Ordinary follow-up');assert.equal(result.tasks[0].note,'[LP信息已脱敏]');assert.equal(result.tasks[0].status,'进行中');assert.equal(result.tasks[1].note,'Other project ordinary');assert.deepEqual(result.project,payload.project);
});

test('independent task GET inherits persistent diligence item/finding/report and supplement privacy',async()=>{
 const state=createSeedLedgerState();state.materials=[{id:'private-ref',primaryScope:'investor',fundId:state.funds[0].id,projectId:state.projects[0].id,name:'Unknown holder',type:'PDF',uploader:'Synthetic',time:'2026-11-01',source:'test',status:'ready',quotes:'',project:'',path:''}];const store=createMemoryLedgerStore(state),project=state.projects[0],ref={materialId:'private-ref',versionId:'v1'},prose='Unknown holder 13000000000';
 await store.workflowTransaction(project.id,async s=>{s.diligence={id:'case',projectId:project.id,ownerId:'owner',reviewers:[],revision:1,status:'active',note:'',createdBy:user('admin'),createdAt:'2026-11-01',items:[{id:'item',taskId:'item-task',submissions:[{evidence:[{material:ref}]}]}],findings:[{id:'finding',taskId:'finding-task',materialIds:['private-ref'],evidence:[ref]}],reports:[{id:'report',reviewTaskIds:['review-task'],source:{items:[{evidence:[ref]}]}}],supplements:[{taskId:'supplement-task',itemId:'item',opinion:prose,status:'open'},{taskId:'report-supplement',reportId:'report',opinion:prose,status:'open'}]} as any;
 for(const id of ['item-task','finding-task','review-task','supplement-task','report-supplement'])s.tasks.push({id,projectId:project.id,kind:'diligence',name:prose,note:prose,status:'进行中'} as any);s.tasks.push({id:'ordinary-task',projectId:project.id,kind:'diligence',name:'Ordinary task',note:'Public note',status:'进行中'} as any);});
 const server=createTestServer({auth,ledgerStore:store}),cookie=await registeredCookie(server,user('viewer'),secret);const response=await server.inject({url:`/api/tasks?projectId=${project.id}`,headers:{cookie}});assert.equal(response.statusCode,200);assert.equal(response.body.includes('13000000000'),false);const tasks=response.json().tasks;assert.equal(tasks.find((t:any)=>t.id==='finding-task').name,'[LP信息已脱敏]');assert.equal(tasks.find((t:any)=>t.id==='supplement-task').note,'[LP信息已脱敏]');assert.equal(tasks.find((t:any)=>t.id==='ordinary-task').note,'Public note');assert.equal(tasks.find((t:any)=>t.id==='item-task').status,'进行中');await server.close();
});

test('independent tasks inherit post/deal/recurring/approval/returns source records without touching unrelated manual tasks',async()=>{
 const state=createSeedLedgerState(),project=state.projects[0];state.materials=[{id:'private-ref',primaryScope:'investor',fundId:project.fundId,projectId:project.id,name:'Unknown holder',type:'PDF',uploader:'Synthetic',time:'2026-11-01',source:'test',status:'ready',quotes:'',project:'',path:''}];const store=createMemoryLedgerStore(state),ref={materialId:'private-ref',versionId:'v1'},prose='Unknown holder 13000000000';
 const kinds:Record<string,string>={visit:'manual',exit:'post_clause',report:'post_clause',missing:'post_clause',financial:'post_clause',clause:'post_clause',scheduleOld:'manual',scheduleNext:'manual',returns:'review',approval:'supplement'};
 await store.workflowTransaction(project.id,async s=>{s.postInvestment={revision:1,archives:[],financials:[{id:'f',reviewerTaskId:'financial',evidence:[ref]}],visits:[{id:'v',evidence:[ref],followUps:[{taskId:'visit',title:prose}]}],clauses:[{id:'c',warningTaskId:'clause',signedMaterial:ref}],reports:[{id:'r',taskIds:['report','missing'],evidence:[ref]}],exitPreparations:[{id:'e',reviewerTaskId:'exit',documents:[{material:ref}]}],returnBases:[{id:'b',taskIds:['returns'],evidence:[ref]}]} as any;s.deals=[{id:'d',closing:{evidence:[ref],responsibility:{schedules:[{taskId:'scheduleNext',taskIds:['scheduleOld','scheduleNext']}]}}}] as any;s.rounds=[{id:'round',projectId:project.id,materials:[ref]}] as any;
 for(const [id,kind] of Object.entries(kinds))s.tasks.push({id,projectId:project.id,kind,approvalRoundId:id==='approval'?'round':undefined,name:prose,note:prose,status:'进行中'} as any);s.tasks.push({id:'ordinary',projectId:project.id,kind:'manual',name:'Public task',note:'Public note',status:'进行中'} as any);});
 const server=createTestServer({auth,ledgerStore:store}),cookie=await registeredCookie(server,user('viewer'),secret);const response=await server.inject({url:`/api/tasks?projectId=${project.id}`,headers:{cookie}});assert.equal(response.statusCode,200);assert.equal(response.body.includes('13000000000'),false);for(const task of response.json().tasks)if(task.id in kinds){assert.equal(task.name,'[LP信息已脱敏]');assert.equal(task.note,'[LP信息已脱敏]');assert.equal(task.status,'进行中');}assert.equal(response.json().tasks.find((t:any)=>t.id==='ordinary').note,'Public note');await server.close();
});
