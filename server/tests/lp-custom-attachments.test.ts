import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {AgentRepository} from '../src/agent/repository.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {templateMaterial} from '../src/ledger/template-material.ts';
import {templateChangePreview} from '../src/ledger/template-change.ts';
const definition={title:'合成自定义LP附件',objectType:'lp',stage:'',fields:[],materials:[
 {id:'product-base',title:'合成产品基础附件',required:true,applicableTo:['product'],instructions:'经办人维护的收集要求，并非公司法规'},
 {id:'authorized-agent',title:'合成授权经办人证件',required:true,applicableTo:['product','institution'],condition:'本次确由授权经办人办理'},
 {id:'institution-only',title:'合成机构附件',required:true,applicableTo:['institution']},
 {id:'unknown-scope',title:'适用范围待核定附件',required:false},
]};
async function fixture(t:any){
 const root=await mkdtemp(join(tmpdir(),'lp-custom-attachments-')),store=createMemoryLedgerStore(),repo=new AgentRepository(),secret='lp-custom-attachments-fixture';
 const server=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'password',sessionSecret:secret}});
 t.after(async()=>{await server.close();await rm(root,{recursive:true,force:true});});
 const cookies:Record<string,string>={};for(const role of ['admin','investment_manager','viewer'])cookies[role]=await registeredCookie(server,{id:role==='admin'?'user-admin':'attachment-'+role,name:role,email:role+'@example.invalid',role:role as any},secret);
 const call=(method:any,url:string,payload?:unknown,role='admin')=>server.inject({method,url,payload,headers:{cookie:cookies[role]}});
 const agent=async(action:string,data:any,role='admin')=>call('POST','/api/agent-workspace/actions',{requestId:randomUUID(),expectedRevision:(await call('GET','/api/agent-workspace',undefined,role)).json().revision,action,data},role);
 const fund=(await store.listFunds())[0];
 const createLp=async(type='产品')=>{const r=await call('POST',`/api/funds/${fund.id}/investors`,{requestId:randomUUID(),name:'合成附件核验LP',type});assert.equal(r.statusCode,200,r.body);return r.json().investor;};
 return {root,store,repo,server,call,agent,fund,createLp};
}
test('template material scopes validate exactly and survive the existing template change preview',()=>{
 for(const applicableTo of [['unknown'],['product','product'],null,'product'])assert.throws(()=>templateMaterial({...definition.materials[0],applicableTo}));
 assert.throws(()=>templateMaterial({...definition.materials[0],required:'true'}));
 assert.deepEqual(templateChangePreview(definition,[]).data.materials[0].applicableTo,['product']);
 assert.equal(templateMaterial({id:'optional',title:'未知要求'}).required,false);
});
test('admin publication feeds real LP requirements with versioned snapshots, conditional opt-in, tasks and unchanged history',async t=>{
 const f=await fixture(t);
 assert.equal((await f.agent('save_template',definition,'investment_manager')).statusCode,403);
 let r=await f.agent('save_template',definition);assert.equal(r.statusCode,200,r.body);const draftId=r.json().result.id;
 assert(!(await f.call('GET','/api/fundraising/templates')).json().templates.some((t:any)=>t.id===draftId));
 assert.equal((await f.agent('publish_template',{id:draftId},'investment_manager')).statusCode,403);
 r=await f.agent('publish_template',{id:draftId});assert.equal(r.statusCode,200,r.body);const template=r.json().templates.find((t:any)=>t.id===draftId);
 assert.equal((await f.call('GET','/api/fundraising/templates')).json().templates.find((t:any)=>t.id===template.id).sourceType,'custom_template');
 const lp=await f.createLp(),base=`/api/funds/${f.fund.id}/investors/${lp.id}`,ownerId='attachment-investment_manager',dueDate='2026-11-01';let rev=lp.revision;
 const act=async(action:string,extra:any={})=>{const x=await f.call('POST',base+'/fundraising/actions',{requestId:randomUUID(),expectedRevision:rev,action,...extra},'investment_manager');if(x.statusCode===200)rev=x.json().revision;return x;};
 assert.equal((await act('import',{templateId:template.id,templateVersion:99,ownerId,dueDate})).statusCode,409);
 assert.equal((await act('import',{templateId:template.id,templateVersion:template.version,materialIds:['institution-only'],ownerId,dueDate})).statusCode,400);
 const payload={requestId:randomUUID(),expectedRevision:rev,action:'import',templateId:template.id,templateVersion:template.version,materialIds:[],excludedMaterialIds:['authorized-agent','unknown-scope'],ownerId,dueDate};
 r=await f.call('POST',base+'/fundraising/actions',payload,'investment_manager');assert.equal(r.statusCode,200,r.body);rev=r.json().revision;
 assert.equal(r.json().history.at(-1).payload.templateSnapshot.materials.length,4);assert.deepEqual(r.json().history.at(-1).payload.excludedMaterialIds,['authorized-agent','unknown-scope']);assert.equal(r.json().requirements.length,1);assert.equal(r.json().requirements[0].name,'合成产品基础附件');assert.equal(r.json().requirements[0].required,true);assert.equal(r.json().tasks[0].status,'已逾期');
 assert.deepEqual((await f.call('POST',base+'/fundraising/actions',payload,'investment_manager')).json(),r.json());
 r=await act('import',{templateId:template.id,templateVersion:template.version,materialIds:['authorized-agent','unknown-scope'],ownerId,dueDate});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().requirements.length,3);
 const originalSnapshot=structuredClone(r.json().requirements),baseItem=originalSnapshot.find((v:any)=>v.source.materialId==='product-base');
 assert.equal(baseItem.source.origin,'custom_template');assert.equal(baseItem.source.templateSnapshot.materials.length,1);assert.equal(baseItem.source.version,template.version);
 const guidance=r.json().suitability;assert(guidance.customRequirements.some((v:any)=>v.name==='合成产品基础附件'));assert(guidance.customRequirements.some((v:any)=>v.name==='合成授权经办人证件'&&v.condition==='本次确由授权经办人办理'));assert(!guidance.unresolved.some((v:string)=>v.includes('自定义配置')||v.includes('请人工核定')||v.includes('请先选择')));assert.equal(guidance.decision,'requires_human_review');
 assert.equal((await act('review',{decision:'approve',note:'无原件不能通过'})).statusCode,409);
 r=await act('updateRequirement',{itemId:baseItem.id,required:true,ownerId,dueDate:'2026-12-01',note:'已上传前仍需复核缺项'});assert.equal(r.statusCode,200,r.body);assert.match(r.json().tasks.find((v:any)=>v.id==='raising-material-'+baseItem.id).name,/复核缺项/);
 const upload=await f.server.inject({method:'POST',url:base+'/materials/upload?'+new URLSearchParams({requestId:randomUUID(),expectedRevision:String(rev),name:'合成核验凭证.txt',type:'LP材料'}),headers:{cookie:(await registeredCookie(f.server,{id:'user-admin',name:'管理员',email:'admin',role:'admin'},'lp-custom-attachments-fixture')),'content-type':'application/octet-stream'},payload:Buffer.from('合成测试凭证：用于验证附件提交与人工审核路径，不代表真实业务材料。')});
 assert.equal(upload.statusCode,200,upload.body);rev=upload.json().investor.revision;const proof={materialId:upload.json().material.id,versionId:upload.json().version.id};
 for(const item of originalSnapshot.filter((v:any)=>v.required)){r=await act('submit',{reviewerId:ownerId,itemId:item.id,proof});assert.equal(r.statusCode,200,r.body);}
 assert.equal((await act('review',{decision:'approve',note:'仍有补充说明不能通过'})).statusCode,409);
 r=await act('updateRequirement',{itemId:baseItem.id,required:true,ownerId,dueDate:'2026-12-01',note:''});assert.equal(r.statusCode,200,r.body);
 r=await act('review',{decision:'approve',note:'仅为隔离合成测试：已核对两个要求的指定版本及补充说明'});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().approved,true);assert(r.json().tasks.every((v:any)=>v.status==='已完成'));
 const forbidden=await f.call('POST',base+'/fundraising/actions',{requestId:randomUUID(),expectedRevision:rev,action:'import',templateId:template.id,templateVersion:template.version,ownerId,dueDate},'viewer');assert.equal(forbidden.statusCode,403);
 // Publishing or disabling affects subsequent imports only. Existing requirement snapshots stay unchanged.
 r=await f.agent('save_template',{...definition,id:template.id,version:template.version,title:'修改后的合成附件',materials:[{...definition.materials[0],title:'新版不同名称'}]});assert.equal(r.statusCode,200,r.body);
 const edited=r.json().result.id;r=await f.agent('publish_template',{id:edited});assert.equal(r.statusCode,200,r.body);const updated=r.json().templates.find((v:any)=>v.id===template.id);assert(updated.version>template.version);assert(r.json().templateHistory.some((v:any)=>v.id===template.id&&v.version===template.version));
 assert.equal((await act('import',{templateId:template.id,templateVersion:template.version,ownerId,dueDate})).statusCode,409);
 const current=(await f.call('GET',base+'/fundraising')).json();assert.deepEqual(current.requirements.map((v:any)=>v.source),originalSnapshot.map((v:any)=>v.source));
 r=await f.agent('toggle_template',{id:template.id,enabled:false});assert.equal(r.statusCode,200,r.body);
 assert(!(await f.call('GET','/api/fundraising/templates')).json().templates.some((v:any)=>v.id===template.id));
 assert.equal((await act('import',{templateId:template.id,templateVersion:updated.version,ownerId,dueDate})).statusCode,404);
 assert.deepEqual((await f.call('POST',base+'/fundraising/actions',payload,'investment_manager')).json().requirements.map((v:any)=>v.name),['合成产品基础附件']);
 assert.equal((await f.call('GET',base+'/fundraising')).json().requirements.length,3);
});
test('conditional-only templates never force unknown attachments; LP intake uses category and captured applicability',async t=>{
 const f=await fixture(t);let r=await f.agent('save_template',{...definition,materials:definition.materials.slice(1)});const id=r.json().result.id;r=await f.agent('publish_template',{id});assert.equal(r.statusCode,200,r.body);const template=r.json().templates.find((v:any)=>v.id===id),lp=await f.createLp();
 const body={requestId:randomUUID(),expectedRevision:lp.revision,action:'import',templateId:id,templateVersion:template.version,ownerId:'user-admin',dueDate:'2026-12-01',materialIds:[]};
 r=await f.call('POST',`/api/funds/${f.fund.id}/investors/${lp.id}/fundraising/actions`,body);assert.equal(r.statusCode,400,r.body);assert.equal(r.json().error,'template_applicability_confirmation_required');
 assert.equal((await f.call('GET',`/api/funds/${f.fund.id}/investors/${lp.id}/fundraising`)).json().requirements.length,0);
 r=await f.call('POST','/api/business-intake/drafts',{requestId:randomUUID(),objectType:'lp',profileKind:'product',fundId:f.fund.id});assert.equal(r.statusCode,200,r.body);
 const draft=r.json().draft,requirements=draft.fields.materialRequirements;
 assert(!requirements.some((v:any)=>v.title==='合成机构附件'));assert(requirements.find((v:any)=>v.title==='适用范围待核定附件').condition);assert(requirements.find((v:any)=>v.title==='合成授权经办人证件').condition);
 const before=structuredClone(draft.fields.materialRequirements);await f.agent('toggle_template',{id,enabled:false});
 r=await f.call('PATCH','/api/business-intake/drafts/'+draft.id,{requestId:randomUUID(),expectedVersion:draft.version,fields:{...draft.fields,name:'合成LP',type:'产品'}});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().draft.fields.materialRequirements,before);
});
