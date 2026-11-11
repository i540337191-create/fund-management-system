import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {LedgerStore} from '../../server/src/ledger/store.ts';

// Only call with a newly created in-memory store and its isolated visual server.
export async function preparePostVisualFixture(store:LedgerStore,server:any,options:{cookie:string;isolatedInMemory:true}) {
 assert.equal(options.isolatedInMemory,true);
 const project=(await store.listProjects())[0],fund=(await store.listFunds())[0];
 assert.ok(project&&fund,'seed fund and project required');
 const projectId=project.id,dealId='b-visual-closed',agreementId='b-visual-agreement';
 const actor={id:'user-admin',name:'隔离视觉管理员',email:'admin@example.local',role:'admin' as const};
 await store.workflowTransaction(projectId,async s=>{
  assert.equal(s.deals?.length??0,0,'fixture requires unused project; never overwrite workflow');
  s.project.ownerId=actor.id;
 });
 const call=async(method:string,url:string,payload?:unknown,headers={})=>server.inject({method,url,payload,headers:{cookie:options.cookie,...headers}});
 const originalBytes=Buffer.from('隔离视觉测试原件\n非正式业务资料。\n2026年第三季度归档、走访及履约说明。\n','utf8');
 const upload=await call('POST','/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name:'隔离视觉原件.txt',type:'法务资料',projectId}),originalBytes,{'content-type':'application/octet-stream'});
 assert.equal(upload.statusCode,201,upload.body);
 const uploaded=upload.json(),material={materialId:uploaded.material.id,versionId:uploaded.version.id};
 const version=(await store.listMaterialVersions(material.materialId))[0];
 const sourceHref=`/api/materials/${material.materialId}/versions/${material.versionId}/file`;
 const source=await call('GET',sourceHref);assert.equal(source.statusCode,200,source.body);assert.deepEqual(source.rawPayload,originalBytes);
 await store.workflowTransaction(projectId,async s=>{
  s.deals=[{id:dealId,projectId,ownerId:actor.id,title:'隔离视觉交割批次（内存样本）',revision:1,status:'closed',reviewers:[actor],createdBy:actor,createdAt:'2026-10-01',terms:[{id:'b-visual-terms',version:1,amount:'100.00',valuation:'1000.00',share:'10.0000',date:'2026-10-01',status:'approved',reason:'隔离视觉初始要素',savedBy:actor,time:'2026-10-01T00:00:00Z',decisions:[],requiredAgreements:['隔离视觉签署协议'],conditions:[],allocations:[{fundId:fund.id,amount:'100.00'}]}],agreements:[{id:agreementId,title:'隔离视觉签署协议',version:1,template:'隔离视觉模板',content:'隔离视觉协议，仅用于界面核验',generatedBy:actor,time:'2026-10-01T00:00:00Z',termsId:'b-visual-terms',signed:{actor,time:'2026-10-01T00:00:00Z',note:'隔离视觉签署留存',evidence:[],material:{...material,name:version.name,sha256:version.sha256,sizeBytes:version.sizeBytes,packetBlobId:version.blobId,downloadHref:sourceHref}}}],confirmations:[],closing:{actor,time:'2026-10-01',evidence:[],note:'内存视觉样本，不代表正式交割',termsId:'b-visual-terms',responsibility:{owner:actor,duties:'隔离视觉跟进',schedules:[]}}}];
 });
 const url=`/api/projects/${projectId}/post-investment`;
 const read=async()=>{const r=await call('GET',url);assert.equal(r.statusCode,200,r.body);return r.json().postInvestment;};
 const act=async(body:object)=>{const before=await read(),r=await call('POST',`${url}/actions`,{requestId:randomUUID(),expectedRevision:before.revision,dealId,...body});assert.equal(r.statusCode,200,r.body);return read();};
 const visit={date:'2026-09-30',ownerId:actor.id,analysis:'内存视觉走访原始记录',evidence:[material],followUps:[{title:'隔离样本走访行动',ownerId:actor.id,dueDate:'2026-12-01'}]};
 let state=await act({action:'save_visit',reason:'隔离样本初次记录',visit});
 await act({action:'save_visit',recordId:state.visits[0].id,reason:'隔离样本补充记录',visit:{...visit,analysis:'内存视觉走访修订版，保留历史版本'}});
 await act({action:'archive',period:{kind:'quarter',value:'2026-Q3'},category:'经营',note:'隔离视觉期间归档，不是正式业务',materials:[material]});
 const clause={agreementId,title:'隔离视觉信息报送条款',quote:'每季度提交经营资料',sourceLocation:'隔离样本原件第1页',obligation:'提交季度经营资料',threshold:'人工录入的隔离样本，非违约认定',triggerDate:'2026-10-01',ownerId:actor.id};
 state=await act({action:'save_clause',reason:'隔离样本初始条款',clause});
 const clauseId=state.clauses[0].id;
 state=await act({action:'save_clause',recordId:clauseId,reason:'隔离样本修订义务说明',clause:{...clause,obligation:'提交季度经营资料及说明'}});
 assert.equal(state.archives.length,1);assert.equal(state.visits.length,2);assert.equal(state.clauses.length,2);
 const current=state.clauses.at(-1);assert.ok(current.warningTaskId);
 const proof=await call('GET',state.archives[0].materials[0].downloadHref);assert.equal(proof.statusCode,200,proof.body);assert.deepEqual(proof.rawPayload,originalBytes);
 return {projectId,dealId,agreementId,archiveId:state.archives[0].id,clauseId,taskId:current.warningTaskId,material,basis:'in-memory visual fixture only; not persistence or production evidence'};
}
