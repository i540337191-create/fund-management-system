import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {materialScopeInput,writeMaterialScope} from '../src/ledger/material-scope.ts';
import {registerMaterialScopeRoutes} from '../src/http/material-scope.ts';
import type {SessionUser} from '../src/auth/session.ts';
const actor:SessionUser={id:'user-admin',name:'管理员',role:'admin',email:'scope@example.invalid'};
const setup=async()=>{const seed=createSeedLedgerState();seed.materials=[{id:'scope-material',projectId:seed.projects[0].id,fundId:seed.funds[0].id,name:'归档工程样例.pdf',type:'经营材料',uploader:'工程验收',time:'2026-11-02',source:'工程验收',status:'待复核',quotes:'0',project:seed.projects[0].name,path:'工程验收',currentVersionId:'original-version',originalFilePath:'api/materials/scope-material/versions/original-version/file',sha256:'f'.repeat(64),scopeRevision:1}];const store=createMemoryLedgerStore(seed),projects=await store.listProjects(),s=await store.lpTransaction(s=>structuredClone(s));const material=s.materials[0],investor=s.investors[0];return {store,s,material,investor,visible:{projects,fundIds:new Set(s.funds.map(f=>f.id)),materialIds:new Set(s.materials.map(m=>m.id))}};};
function input(m:any,more:Record<string,unknown>={}){return materialScopeInput({requestId:randomUUID(),expectedVersionId:m.currentVersionId??null,expectedScopeRevision:m.scopeRevision??1,projectIds:[],fundIds:[m.fundId],investorIds:[],confirmAccessChange:true,...more});}
test('human confirmation, valid revision, nonempty scope, strict IDs and no implicit fund expansion',async()=>{
 const {s,material,visible}=await setup();
 for(const patch of [{confirmAccessChange:false},{expectedScopeRevision:0},{projectIds:[],fundIds:[],investorIds:[]},{fundIds:['duplicate','duplicate']},{surprise:true}])assert.throws(()=>input(material,patch));
 const p=visible.projects[0];assert.throws(()=>writeMaterialScope(s,material.id,input(material,{projectIds:[p.id],fundIds:[]}),actor,visible),(e:any)=>e.code==='project_fund_scope_mismatch');
 assert.throws(()=>writeMaterialScope(s,material.id,input(material,{fundIds:['nonexistent']}),actor,visible),(e:any)=>e.code==='fund_not_found');
});
test('scope change preserves bytes/version, advances scope CAS, retries once and audits once',async()=>{
 const {s,material,visible}=await setup(),version=material.currentVersionId,original=material.originalFilePath,sha=material.sha256,b=input(material,{fundIds:[s.funds[0].id]});
 const first=writeMaterialScope(s,material.id,b,actor,visible),second=writeMaterialScope(s,material.id,b,actor,visible);
 assert.deepEqual(second,first);assert.equal(s.auditEvents.length,1);assert.equal(first.material.scopeRevision,2);assert.equal(first.material.currentVersionId,version);assert.equal(first.material.originalFilePath,original);assert.equal(first.material.sha256,sha);
 assert.throws(()=>writeMaterialScope(s,material.id,{...b,requestId:randomUUID()},actor,visible),(e:any)=>e.code==='material_scope_revision_conflict');
 assert.throws(()=>writeMaterialScope(s,material.id,{...b,fundIds:[s.funds[1]?.id??'other']},actor,visible));
 const snapshot=structuredClone(material);assert.throws(()=>writeMaterialScope(s,material.id,input(material,{expectedVersionId:'stale'}),actor,visible),(e:any)=>e.code==='material_version_conflict');assert.deepEqual(material,snapshot);
});
test('LP classification is sticky, LP does not grant post-investment files or finance archive authority',async()=>{
 const {s,material,investor,visible}=await setup();
 const lp=input(material,{fundIds:[investor.fundId],investorIds:[investor.id]});
 assert.throws(()=>writeMaterialScope(s,material.id,lp,{...actor,role:'post_investment'},visible),(e:any)=>e.code==='forbidden');
 assert.throws(()=>writeMaterialScope(s,material.id,lp,{...actor,role:'finance'},visible),(e:any)=>e.code==='forbidden');
 const saved=writeMaterialScope(s,material.id,lp,actor,visible);assert.equal(saved.material.lpSensitive,true);assert.equal(saved.material.primaryScope,'investor');
 const removed=writeMaterialScope(s,material.id,input(saved.material,{fundIds:[investor.fundId]}),actor,visible);assert.equal(removed.material.lpSensitive,true);assert.deepEqual(removed.material.relationships?.investors,[]);
 assert.throws(()=>writeMaterialScope(s,material.id,input(removed.material,{fundIds:[investor.fundId]}),{...actor,role:'post_investment'},visible),(e:any)=>e.code==='forbidden');
});
test('hidden material or target objects cannot be acquired through a raw LP transaction',async()=>{
 const {s,material,visible}=await setup();
 assert.throws(()=>writeMaterialScope(s,material.id,input(material,{fundIds:[s.funds[0].id]}),actor,{...visible,materialIds:new Set()}),(e:any)=>e.status===404);
 assert.throws(()=>writeMaterialScope(s,material.id,input(material,{fundIds:[s.funds[0].id]}),actor,{...visible,fundIds:new Set()}),(e:any)=>e.status===404);
});
test('HTTP scope edits persist through memory transaction; unauthenticated request fails before mutation',async()=>{
 const {store,material,s}=await setup(),app=Fastify();registerMaterialScopeRoutes(app,store,{auth:{mode:'local-bypass'}});
 const b=input(material,{fundIds:[s.funds[0].id]}),r=await app.inject({method:'POST',url:`/api/materials/${material.id}/scope`,payload:b});assert.equal(r.statusCode,200,r.body);
 const saved=(await store.listMaterials()).find(m=>m.id===material.id)!;assert.equal(saved.scopeRevision,2);assert.equal(saved.currentVersionId,material.currentVersionId);await app.close();
 const anonymous=Fastify();registerMaterialScopeRoutes(anonymous,store,{auth:{mode:'password'}});const denied=await anonymous.inject({method:'POST',url:`/api/materials/${material.id}/scope`,payload:b});assert.equal(denied.statusCode,401);await anonymous.close();
});
