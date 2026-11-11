import type {FastifyInstance} from 'fastify';
import {resolveRequestUser} from '../auth/authorize.ts';
import {resolveAuthConfig,type AuthConfigInput} from '../auth/session.ts';
import type {LedgerStore} from '../ledger/store.ts';
import {CustomFieldError,customInput,customView,writeSchema,type ObjectType} from '../ledger/custom-fields.ts';
export function registerCustomFieldRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput}={}){
 const auth=resolveAuthConfig(options.auth);

 for(const method of ['GET','PUT'] as const)server.route({method,url:'/api/custom-field-schemas/:objectType',handler:async(request,reply)=>{
  const kind=(request.params as {objectType:ObjectType}).objectType;
  if(!['company','project','fund'].includes(kind))return reply.code(400).send({error:'invalid_object_type'});
  if(method==='GET')return store.masterTransaction(s=>({schema:s.schemas[kind]}));
  try{return await writeSchema(store,kind,request.body,resolveRequestUser(request,auth)!);}catch(e){if(e instanceof CustomFieldError)return reply.code(e.status).send({error:e.code,fields:e.fields,...(e.latest?{latest:e.latest}:{})});throw e;}
 }});
 server.get('/api/custom-field-export/:objectType',async(request,reply)=>{
  const kind=(request.params as {objectType:ObjectType}).objectType;if(!['company','project','fund'].includes(kind))return reply.code(400).send({error:'invalid_object_type'});
  return store.masterTransaction(async s=>{
   const records=await (kind==='company'?store.listCompanies():kind==='project'?store.listProjects():store.listFunds());
   return {objectType:kind,capturedAt:new Date().toISOString(),schema:s.schemas[kind],records:records.map(v=>enrich(v,s,kind))};
  });
 });
 // Only custom metadata is refreshed; existing route projections and visible object sets stay authoritative.
 server.addHook('preSerialization',async(request,reply,payload)=>{
  if(request.method!=='GET'||reply.statusCode!==200||!payload||typeof payload!=='object'||!/^\/api\/(companies|projects|funds)(\/[^/?]+)?$/.test(request.url.split('?')[0]))return payload;
  const data={...(payload as Record<string,unknown>)};
  await store.masterTransaction(s=>{for(const kind of ['company','project','fund'] as const){const plural=kind==='company'?'companies':kind+'s';
   if(Array.isArray(data[plural]))data[plural]=data[plural].map((v:{id:string})=>enrich(v,s,kind));
   const dto=data[kind];if(dto&&typeof dto==='object'&&'id' in dto&&typeof dto.id==='string')data[kind]=enrich(dto as {id:string},s,kind);
  }});
  return data;
 });
}

function enrich<T extends {id:string}>(dto:T,state:import('../ledger/company-project-master.ts').MasterState,kind:ObjectType){
 const records=kind==='company'?state.companies:kind==='project'?state.projects:state.funds;
 const record=records.find(r=>r.id===dto.id);
 return record?{...dto,...customView(state.schemas[kind],customInput(record as unknown as Record<string,unknown>))}:dto;
}
