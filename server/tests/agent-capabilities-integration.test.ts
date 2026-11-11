import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import type {SessionUser} from '../src/auth/session.ts';
const secret='capabilities-integration-synthetic-secret';
const root=await mkdtemp(join(tmpdir(),'agent-capability-integration-')),modulePath=join(root,'harness.mjs'),prior=process.env.FUNDAPP_HARNESS_MODULE;
await writeFile(modulePath,'export async function runBusinessHarness(args){return globalThis.__capabilityIntegrationHarness(args)}');process.env.FUNDAPP_HARNESS_MODULE=modulePath;
const done=(body:string)=>JSON.parse(body.split('\n\n').find(f=>f.startsWith('event: done'))!.split('\ndata: ')[1]).conversation;
async function fixture(visionModel?:string){
 const storage=await mkdtemp(join(root,'storage-')),store=createMemoryLedgerStore();let external=0;
 const server=createTestServer({ledgerStore:store,materialStorageRoot:storage,auth:{mode:'password',sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'synthetic-admin-password'},ai:{env:{QWEN_API_KEY:'synthetic-key',QWEN_MODEL:'qwen3.7-max',QWEN_VISION_MODEL:visionModel??''},fetchImpl:async()=>{external++;throw Error('No external call permitted by integration fixture');}}});
 await server.ready();
 const actor=(role:SessionUser['role']):SessionUser=>({id:role==='admin'?'user-admin':'cap-integration-'+role,name:'验收'+role,email:role+'@example.invalid',role});
 const headers=async(role:SessionUser['role'])=>({cookie:await registeredCookie(server,actor(role),secret)});
 const turn=async(h:{cookie:string},run:(x:any)=>Promise<any>,selection:Record<string,unknown>={})=>{
  let harnessError:unknown;(globalThis as any).__capabilityIntegrationHarness=async(x:any)=>{try{return await run(x);}catch(error){harnessError=error;throw error;}};const created=await server.inject({method:'POST',url:'/api/ai/conversations',headers:h,payload:{requestId:randomUUID(),includeDemo:false}});assert.equal(created.statusCode,200,created.body);const c=created.json();
  const response=await server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/turns`,headers:h,payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt:'请核对业务模板截图及当前可用能力，不办理写入。',...selection}});assert.equal(response.statusCode,200,response.body);if(harnessError)throw harnessError;return {response,conversation:done(response.body),id:c.id};
 };
 return {server,store,storage,headers,actor,turn,get external(){return external;},close:()=>server.close()};
}
test('HTTP capabilities filters admin operations by registered actor and reports current image readiness without secrets',async()=>{
 const f=await fixture();try{
  const admin=(await f.server.inject({url:'/api/ai/capabilities',headers:await f.headers('admin')})).json(),viewerResponse=await f.server.inject({url:'/api/ai/capabilities',headers:await f.headers('viewer')}),viewer=viewerResponse.json();assert.equal(viewerResponse.statusCode,200,viewerResponse.body);
  assert(admin.workflowCatalog.some((m:any)=>m.module==='admin_accounts'));assert(!viewer.workflowCatalog.some((m:any)=>m.module==='admin_accounts'));assert(admin.workspaceActions.includes('apply_template'));assert(!viewer.workspaceActions.includes('apply_template'));
  assert.equal(admin.image.ready,false);assert.equal(admin.image.mode,'ocr_only');assert.equal(admin.image.reason,'vision_model_not_configured');assert(!JSON.stringify(admin).includes('synthetic-key'));assert.equal(f.external,0);
 }finally{await f.close();}
 const enabled=await fixture('qwen3-vl-plus');try{const res=await enabled.server.inject({url:'/api/ai/capabilities',headers:await enabled.headers('admin')});assert.equal(res.statusCode,200);assert.equal(res.json().image.ready,true);assert.equal(res.json().image.model,'qwen3-vl-plus');assert.equal(enabled.external,0);}finally{await enabled.close();}
});
test('workspace tool exposes safe disabled-plugin metadata but cannot read disabled source',async()=>{
 const f=await fixture();try{
  const h=await f.headers('admin');
  for(const [id,endpoint] of [['plugin-local-library','/synthetic-private-library-path'],['plugin-public-feed','https://example.invalid/?api_key=synthetic-secret']]){const state=(await f.server.inject({url:'/api/agent-workspace',headers:h})).json();const saved=await f.server.inject({method:'POST',url:'/api/agent-workspace/actions',headers:h,payload:{requestId:randomUUID(),expectedRevision:state.revision,action:'save_plugin',data:{id,endpoint,enabled:false}}});assert.equal(saved.statusCode,200,saved.body);}
  let checked=false;const result=await f.turn(h,async x=>{
   const workspace=await x.onTool('read_agent_workspace',{section:'plugins'}),disabled=workspace.plugins.find((p:any)=>p.id==='plugin-public-feed');assert(disabled);assert.equal(disabled.enabled,false);assert.equal(disabled.connected,false);assert(!Object.hasOwn(disabled,'endpoint'));assert(!Object.hasOwn(disabled,'apiKey'));assert(!Object.hasOwn(disabled,'headers'));assert.equal(disabled.endpointStatus,'地址需要重新配置');assert(!JSON.stringify(workspace).includes('synthetic-secret'));assert(!JSON.stringify(workspace).includes('/synthetic-private-library-path'));const local=workspace.plugins.find((p:any)=>p.id==='plugin-local-library');assert.equal(local.configured,true);assert(!Object.hasOwn(local,'endpoint'));assert.equal(workspace.capabilities.image.ready,false);assert(workspace.coverage.plugins.total>=3);const contract=workspace.workspaceActions.find((v:any)=>v.action==='apply_template');assert(contract.fields.includes('fields'));assert(contract.fields.includes('version'));assert(!contract.fields.includes('createdAt'));
   await assert.rejects(x.onTool('read_plugin',{pluginId:disabled.id}),/plugin_unavailable/);checked=true;return {text:'公开信源尚未启用，本次没有读取外部页面。',toolCalls:2};
  });assert(checked,result.response.body);assert.equal(result.conversation.messages.at(-1).status,'complete');assert.equal(f.external,0);
 }finally{await f.close();}
});
test('registered nonadmin image tool binds selected authorized version, returns OCR-only and keeps reply/history readable; material workflow routes to original versions',async()=>{
 const f=await fixture();try{
  const h=await f.headers('investment_manager'),actor=f.actor('investment_manager'),project=(await f.store.listProjects())[0],versionId=randomUUID(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5v8AAAAASUVORK5CYII=','base64'),sha256=createHash('sha256').update(png).digest('hex');
  const uploaded=await f.store.uploadMaterial({requestId:randomUUID(),name:'授权业务模板截图.png',type:'业务模板',projectId:project.id,versionId,sizeBytes:png.length,sha256,mimeType:'image/png',actor});await writeFile(join(f.storage,versionId),png);await mkdir(join(f.storage,'extracted-text'),{recursive:true});await writeFile(join(f.storage,'extracted-text',versionId+'-'+sha256+'.json'),JSON.stringify({versionId,sha256,status:'ready',pages:[{page:1,text:'截图中已识别文字：企业名称',method:'synthetic-ocr-fixture'}],updatedAt:new Date().toISOString()}));
  const materialId=uploaded.material.id;let checked=false;const result=await f.turn(h,async x=>{
   assert(x.tools.find((t:any)=>t.name==='read_workflow').parameters.targetId.enum.includes(materialId),'authorized material absent from target enum');
   await assert.rejects(x.onTool('inspect_selected_image',{materialId:'outside-selected-material',versionId,question:'标题在哪？'}),/image_not_selected/);
   await assert.rejects(x.onTool('inspect_selected_image',{materialId,versionId:randomUUID(),question:'标题在哪？'}),/image_version_changed/);
   const image=await x.onTool('inspect_selected_image',{materialId,versionId,question:'图片的标题与字段如何调整？'});assert.equal(image.status,'unavailable');assert.equal(image.visualRead,false);assert.equal(image.ocrStatus,'ready');assert.equal(image.ocr[0].text,'截图中已识别文字：企业名称');assert.equal(image.evidence.versionId,versionId);assert(!JSON.stringify(image).includes(png.toString('base64')));
   const versions=await x.onTool('read_workflow',{module:'material_versions',targetId:materialId});assert.equal(versions.targetId,materialId);assert.equal(versions.href,'/materials?materialId='+encodeURIComponent(materialId));assert(JSON.stringify(versions.data).includes(versionId));checked=true;return {text:'仅依据已识别文字核对企业名称；当前没有可用的截图视觉理解模型。',toolCalls:4};
  },{materialIds:[materialId],projectId:project.id});assert(checked,result.response.body);assert.equal(result.conversation.messages.at(-1).status,'complete',result.response.body);assert.match(result.conversation.messages.at(-1).content,/仅依据已识别文字/);
  const history=await f.server.inject({url:'/api/ai/conversations/'+result.id,headers:h});assert.equal(history.statusCode,200,history.body);assert.match(history.json().messages.at(-1).content,/仅依据已识别文字/);assert.equal(history.json().messages.at(-1).status,'complete');assert.equal(f.external,0);
 }finally{await f.close();}
});
test.after(async()=>{if(prior===undefined)delete process.env.FUNDAPP_HARNESS_MODULE;else process.env.FUNDAPP_HARNESS_MODULE=prior;delete (globalThis as any).__capabilityIntegrationHarness;await rm(root,{recursive:true,force:true});});
