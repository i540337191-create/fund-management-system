import type {FastifyInstance} from 'fastify';
import type {LedgerStore} from '../ledger/store.ts';
import {resolveAuthConfig,type AuthConfigInput} from '../auth/session.ts';
import {resolveRequestUser} from '../auth/authorize.ts';
import {currentAccountActor} from '../auth/registered-session.ts';
import {canReadMaterial} from './material-files.ts';
import {WorkflowError,fail} from '../ledger/workflow.ts';
import {materialScopeInput,materialScopePermission,writeMaterialScope} from '../ledger/material-scope.ts';
export function registerMaterialScopeRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput}={}){
 const auth=resolveAuthConfig(options.auth);
 server.post('/api/materials/:id/scope',async(request,reply)=>{
  try{
   const actor=resolveRequestUser(request,auth);if(!actor)fail('unauthorized',401);materialScopePermission(actor);
   const input=materialScopeInput(request.body),id=(request.params as {id:string}).id;
   const [projects,funds,materials]=await Promise.all([store.listProjects(),store.listFunds(),store.listMaterials()]);
   const materialIds=new Set(materials.filter(m=>canReadMaterial(actor,m)).map(m=>m.id));
   return await store.lpTransaction(s=>writeMaterialScope(s,id,input,currentAccountActor(s,request,auth),{projects,fundIds:new Set(funds.map(f=>f.id)),materialIds}));
  }catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});request.log.error(e);return reply.code(500).send({error:'material_scope_failed'});}
 });
}
