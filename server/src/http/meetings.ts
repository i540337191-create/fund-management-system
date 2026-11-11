import {resolve} from 'node:path';
import {meetingDocument} from '../ledger/meeting-file.ts';
import {generateDocument,documentMime} from '../ledger/document-output.ts';
import {canReadMaterial} from './material-files.ts';
import {object,revision,requestId} from '../ledger/workflow.ts';
import {meetingInput,meetingScheduleInput} from '../ledger/meeting-input.ts';
import {WorkflowError} from '../ledger/workflow.ts';
import type { FastifyInstance } from "fastify";
import { requirePermission, resolveRequestUser } from "../auth/authorize.ts";
import { resolveAuthConfig, type AuthConfigInput } from "../auth/session.ts";
import type { LedgerStore } from "../ledger/store.ts";

type RouteOptions = {
  auth?: AuthConfigInput;
  projectRoot?: string;
  storageRoot?: string;
};

export function registerMeetingRoutes(server: FastifyInstance, store: LedgerStore, options: RouteOptions = {}) {
  const auth = resolveAuthConfig(options.auth);

  server.post('/api/meetings',async(request,reply)=>{
    const denied=requirePermission(request,reply,auth,'meeting:write');if(denied)return denied;
    try{const input=meetingInput(request.body),project=(await store.listProjects()).find(p=>p.id===input.projectId);if(!project)return reply.code(404).send({error:'project_not_found'});
      return {meeting:await store.createMeeting({...input,project:project.name,dataOrigin:'user_input'},resolveRequestUser(request,auth)!)};
    }catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}
  });
  server.patch('/api/meetings/:id',async(request,reply)=>{const denied=requirePermission(request,reply,auth,'meeting:write');if(denied)return denied;try{const current=(await store.listMeetings()).find(m=>m.id===(request.params as {id:string}).id);if(current?.status==='已归档')throw new WorkflowError('archived_meeting_readonly',409);if(!request.body||typeof request.body!=='object'||Array.isArray(request.body))throw new WorkflowError('invalid_meeting_payload',400);const {expectedRevision,...body}=request.body as Record<string,unknown>,input=meetingInput(body),project=(await store.listProjects()).find(p=>p.id===input.projectId);if(!project)return reply.code(404).send({error:'project_not_found'});if(body.scheduleStatus===undefined){const previous=(await store.listMeetings()).find(m=>m.id===(request.params as {id:string}).id);if(previous)Object.assign(input,{scheduleStatus:previous.scheduleStatus??'unknown',startsAt:previous.startsAt,endsAt:previous.endsAt});}return {meeting:await store.updateMeeting((request.params as {id:string}).id,{...input,project:project.name,dataOrigin:'user_input'},revision(expectedRevision),resolveRequestUser(request,auth)!)};}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}});
  server.patch('/api/meetings/:id/schedule',async(request,reply)=>{const denied=requirePermission(request,reply,auth,'meeting:write');if(denied)return denied;try{const b=object(request.body,['expectedRevision','scheduleStatus','startsAt','endsAt']);const id=(request.params as {id:string}).id,current=(await store.listMeetings()).find(m=>m.id===id);if(!current)throw new WorkflowError('meeting_not_found',404);const schedule=meetingScheduleInput(b);return {meeting:await store.updateMeeting(id,{...current,...schedule},revision(b.expectedRevision),resolveRequestUser(request,auth)!)};}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}});
  server.get("/api/meetings", async(request,reply) => {const deleted=(request.query as {deleted?:string}).deleted;if(deleted!==undefined&&!['true','false'].includes(deleted))return reply.code(400).send({error:'invalid_deleted_filter'});return {meetings:await store.listMeetings(deleted==='true')};});
  for(const action of ['delete','restore'] as const)server.post(`/api/meetings/:id/${action}`,async(request,reply)=>{
    const denied=requirePermission(request,reply,auth,'meeting:write');if(denied)return denied;
    try{const b=object(request.body,['requestId','expectedRevision']);return {meeting:await store.setMeetingDeleted((request.params as {id:string}).id,action==='delete',{requestId:requestId(b.requestId),expectedRevision:revision(b.expectedRevision)},resolveRequestUser(request,auth)!)};}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}
  });

  server.get('/api/meetings/:id/document',async(request,reply)=>{
    const id=(request.params as {id:string}).id;
    const meeting=(await store.listMeetings()).find(m=>m.id===id&&m.status==='已归档');
    const material=(await store.listMaterials()).find(m=>m.id===`material-meeting-${id}`);
    if(!meeting||!material)return reply.code(404).send({error:'meeting_archive_unavailable'});
    if(!canReadMaterial(resolveRequestUser(request,auth),material))return reply.code(403).send({error:'forbidden'});
    if(material.currentVersionId)return reply.redirect(`/api/materials/${encodeURIComponent(material.id)}/versions/${encodeURIComponent(material.currentVersionId)}/file`);
    if(material.originalFilePath)return reply.code(409).send({error:'meeting_original_registered'});
    try{
      const bytes=await generateDocument(meetingDocument(meeting,true),'docx');
      return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('X-Document-Provenance','generated-from-stored-meeting').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(`${meeting.title}（留存记录生成副本）.docx`).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`).type(documentMime.docx).send(bytes);
    }catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}
  });

  server.post("/api/meetings/:id/confirm", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "meeting:write");
    if (authError) return authError;

    const { id } = request.params as { id: string };
    let result;
    try{const body=object(request.body??{},['expectedRevision']);result=await store.confirmMeeting(id,resolveRequestUser(request,auth)!,body.expectedRevision===undefined?undefined:revision(body.expectedRevision),options.storageRoot??process.env.MATERIAL_STORAGE_ROOT??resolve(options.projectRoot??resolve(import.meta.dirname,'../../..'),'private-material-storage'));}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}
    if (!result) return reply.code(404).send({ error: "meeting_not_found" });
    return result;
  });
}
