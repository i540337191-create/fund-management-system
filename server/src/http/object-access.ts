import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {LedgerStore} from '../ledger/store.ts';
import {resolveRequestUser} from '../auth/authorize.ts';
import {currentAccountActor} from '../auth/registered-session.ts';
import {resolveAuthConfig,type AuthConfigInput} from '../auth/session.ts';
import {object,fail,WorkflowError} from '../ledger/workflow.ts';
export function registerObjectAccessRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput}){
 const auth=resolveAuthConfig(options.auth);
 server.get('/api/object-access',async(request,reply)=>{
  if(resolveRequestUser(request,auth)?.role!=='admin')return reply.code(403).send({error:'forbidden'});
  const [data,funds,projects,materials,users]=await Promise.all([store.accessTransaction(s=>{if(currentAccountActor(s,request,auth).role!=='admin')fail('forbidden',403);return s.data;}),store.listFunds(),store.listProjects(),store.listMaterials(),store.listUsers()]);
  return {data,materials:materials.map(m=>({id:m.id,name:m.name,projectId:m.projectId,fundId:m.fundId,relationships:m.relationships,inheritance:{projectIds:[...new Set([m.projectId,...(m.relationships?.projects??[]).map(p=>p.id)].filter(Boolean))],fundIds:[...new Set([m.fundId,...(m.relationships?.funds??[]).map(f=>f.id)].filter(Boolean))],companyIds:(m.relationships?.companies??[]).map(c=>c.id)},mode:data.materials?.[m.id]?'restricted':'inherit',revision:data.materials?.[m.id]?.revision??data.materialRevisions?.[m.id]??0})),funds:funds.map(f=>({id:f.id,name:f.name,ownerId:f.managerId})),projects:projects.map(p=>({id:p.id,name:p.name,fundId:p.fundId,ownerId:p.ownerId})),users:users.filter(u=>u.enabled!==false).map(u=>({id:u.id,name:u.name,role:u.role}))};
 });
 server.put('/api/object-access/:kind/:id',async(request,reply)=>{try{
  const a=resolveRequestUser(request,auth);if(a?.role!=='admin')fail('forbidden',403);
  const {kind,id}=request.params as {kind:string;id:string};if(!['funds','projects','materials'].includes(kind))fail('invalid_access_kind');
  const records=kind==='funds'?await store.listFunds():kind==='projects'?await store.listProjects():await store.listMaterials();if(!records.some(r=>r.id===id))fail('object_not_found',404);
  const b=object(request.body,['visibility','memberIds','expectedRevision']);if(!(kind==='materials'?['members','inherit']:['members','public',...(kind==='projects'?['inherit']:[])]).includes(String(b.visibility)))fail('invalid_visibility');
  if(!Array.isArray(b.memberIds)||b.memberIds.length>200||b.memberIds.some(v=>typeof v!=='string'))fail('invalid_members');
  return await store.accessTransaction(s=>{const actor=currentAccountActor(s,request,auth);if(actor.role!=='admin')fail('forbidden',403);
   const data=s.data;if(kind==='materials')data.materials??={};
   const rules=data[kind as 'funds'|'projects'|'materials']!,prior=rules[id],currentRevision=prior?.revision??(kind==='materials'?data.materialRevisions?.[id]:kind==='projects'?data.projectRevisions?.[id]:undefined)??0;
   if(!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<0)fail('invalid_revision');
   if(b.expectedRevision!==currentRevision)fail('access_revision_conflict',409);
   const ids=[...new Set(b.memberIds as string[])];if(b.visibility==='inherit'&&ids.length)fail('invalid_members');if(ids.some(id=>!s.users.some(u=>u.id===id&&u.enabled!==false)&&id!=='user-admin'))fail('member_not_available');
   const nextRevision=currentRevision+1;
   const rule=b.visibility==='inherit'?{visibility:'inherit' as const,memberIds:[],revision:nextRevision}:{visibility:b.visibility as 'members'|'public',memberIds:ids,revision:nextRevision};
   if(rule.visibility==='inherit'){delete rules[id];(kind==='materials'?(data.materialRevisions??={}):(data.projectRevisions??={}))[id]=nextRevision;}else rules[id]=rule;
   s.auditEvents.push({id:randomUUID(),module:'对象权限',action:'调整可见范围',targetType:kind==='funds'?'基金':kind==='projects'?'项目':'资料',targetId:id,targetName:records.find(r=>r.id===id)!.name,actor:actor.name,time:new Date().toISOString(),detail:JSON.stringify({actorId:actor.id,before:prior??null,after:rule}),source:'权限管理',dataOrigin:'user_input'});return {rule};
  });
 }catch(error){if(error instanceof WorkflowError)return reply.code(error.status).send({error:error.code});throw error;}});
}
