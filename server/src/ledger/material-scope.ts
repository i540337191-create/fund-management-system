import {randomUUID} from 'node:crypto';
import type {SessionUser} from '../auth/session.ts';
import {canRole} from '../auth/rbac.ts';
import {canReadLp,isLpMaterial} from './lp-privacy.ts';
import type {LpState} from './lp-ledger.ts';
import type {Project,Material,MaterialRelation,AuditEvent} from './store.ts';
import {object,string,requestId,fail} from './workflow.ts';
export type MaterialScopeInput={requestId:string;expectedVersionId:string|null;expectedScopeRevision:number;projectIds:string[];fundIds:string[];investorIds:string[];confirmAccessChange:true};
function ids(value:unknown){if(!Array.isArray(value)||value.length>100||value.some(v=>typeof v!=='string'||!v.trim()||v.length>300)||new Set(value).size!==value.length)fail('invalid_scope_ids');return value as string[];}
export function materialScopeInput(value:unknown):MaterialScopeInput{
 const b=object(value,['requestId','expectedVersionId','expectedScopeRevision','projectIds','fundIds','investorIds','confirmAccessChange']);
 const rid=requestId(b.requestId);if(b.confirmAccessChange!==true)fail('scope_confirmation_required');
 if(!Number.isSafeInteger(b.expectedScopeRevision)||Number(b.expectedScopeRevision)<1)fail('invalid_scope_revision');
 const version=b.expectedVersionId===null?null:string(b.expectedVersionId,true,300);
 const projectIds=ids(b.projectIds),fundIds=ids(b.fundIds),investorIds=ids(b.investorIds);
 if(!projectIds.length&&!fundIds.length&&!investorIds.length)fail('material_scope_required');
 return {requestId:rid,expectedVersionId:version,expectedScopeRevision:Number(b.expectedScopeRevision),projectIds,fundIds,investorIds,confirmAccessChange:true};
}
export function materialScopePermission(actor:SessionUser){if(!canRole(actor.role,'material:write')&&!canRole(actor.role,'fund:write'))fail('forbidden',403);}
export function writeMaterialScope(s:LpState,id:string,b:MaterialScopeInput,actor:SessionUser,visible:{projects:Project[];fundIds:Set<string>;materialIds:Set<string>}){
 materialScopePermission(actor);
 if(!visible.materialIds.has(id))fail('material_not_found',404);
 const material=s.materials.find(m=>m.id===id);if(!material)fail('material_not_found',404);
 if((isLpMaterial(material)||b.investorIds.length)&&!canReadLp(actor))fail('forbidden',403);
 const projects=b.projectIds.map(id=>{const p=visible.projects.find(p=>p.id===id);if(!p)fail('project_not_found',404);if(!b.fundIds.includes(p.fundId))fail('project_fund_scope_mismatch',409);return p;});
 const funds=b.fundIds.map(id=>{const f=s.funds.find(f=>f.id===id);if(!f||!visible.fundIds.has(id))fail('fund_not_found',404);return f;});
 const investors=b.investorIds.map(id=>{const i=s.investors.find(i=>i.id===id);if(!i||!visible.fundIds.has(i.fundId))fail('investor_not_found',404);if(!b.fundIds.includes(i.fundId))fail('investor_fund_scope_mismatch',409);return i;});
 const fingerprint=JSON.stringify({kind:'material_scope',id,actorId:actor.id,...b});
 const prior=s.data.requests[b.requestId];if(prior){if(prior.fingerprint!==fingerprint)fail('material_scope_request_conflict',409);return structuredClone(prior.result) as {material:Material;auditEvent:AuditEvent};}
 if((material.currentVersionId??null)!==b.expectedVersionId)fail('material_version_conflict',409);
 if((material.scopeRevision??1)!==b.expectedScopeRevision)fail('material_scope_revision_conflict',409);
 const before={projectId:material.projectId,fundId:material.fundId,primaryScope:material.primaryScope,relationships:structuredClone(material.relationships),scopeRevision:material.scopeRevision??1};
 const relations=(values:{id:string;name:string}[]):MaterialRelation[]=>values.map((v,i)=>({id:v.id,name:v.name,relationType:'linked',isPrimary:i===0}));
 Object.assign(material,{projectId:projects[0]?.id??null,fundId:funds[0]?.id??null,project:projects[0]?.name??'',primaryScope:projects.length?'project':investors.length?'investor':'fund',scopeRevision:(material.scopeRevision??1)+1,relationships:{projects:relations(projects),funds:relations(funds),investors:relations(investors),companies:material.relationships?.companies??[]}});
 if(investors.length)material.lpSensitive=true;
 const event:AuditEvent={id:`audit-${randomUUID()}`,module:'资料库',action:'确认材料归属与可见范围',targetType:'资料',targetId:material.id,targetName:material.name,actor:actor.name,time:new Date().toISOString(),detail:JSON.stringify({requestId:b.requestId,actorId:actor.id,versionId:material.currentVersionId??null,accessChangeConfirmed:true,before,after:{projectId:material.projectId,fundId:material.fundId,primaryScope:material.primaryScope,scopeRevision:material.scopeRevision,relationships:material.relationships}}),source:'人工归档确认',dataOrigin:'user_input'};
 s.auditEvents.push(event);const result={material:structuredClone(material),auditEvent:event};s.data.requests[b.requestId]={fingerprint,result:structuredClone(result)};return result;
}
