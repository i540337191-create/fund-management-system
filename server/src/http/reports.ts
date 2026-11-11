import {ReportReadinessError,assertReportReady} from '../ledger/report-readiness.ts';
import {templateSourceReadable} from '../agent/template-source.ts';
import type {AgentRepository} from '../agent/repository.ts';
import {generateDocument,documentMime,type BusinessDocument} from '../ledger/document-output.ts';
import {resolveRequestUser} from '../auth/authorize.ts';
import {lpProjection,canReadLp} from '../ledger/lp-privacy.ts';
import { parseIncludeDemo,readSourceRows,readSourcePolicy } from '../ledger/source-policy.ts';
import { WorkflowError } from "../ledger/workflow.ts";
import type { FastifyInstance } from "fastify";
import { requirePermission } from "../auth/authorize.ts";
import { resolveAuthConfig, type AuthConfigInput } from "../auth/session.ts";
import type { LedgerStore, Report, ReportExport } from "../ledger/store.ts";

type CreateReportBody = Partial<Omit<Report, "id" | "fundId" | "projectId">> &
  Partial<Pick<Report, "id" | "fundId" | "projectId">>;

type RouteOptions = {
  agentRepository?:AgentRepository;
  onProjectedDocument?:(request:import("fastify").FastifyRequest)=>void;
  auth?: AuthConfigInput;
};

export function registerReportRoutes(server: FastifyInstance, store: LedgerStore, options: RouteOptions = {}) {
  const auth = resolveAuthConfig(options.auth);
  const safeReport=async(request:import('fastify').FastifyRequest,report:Report)=>{const actor=resolveRequestUser(request,auth);if(report.templateSnapshot&&(!actor||!templateSourceReadable(report.templateSnapshot,await store.listMaterials(),actor))){const {templateSnapshot:_,...safe}=report;return safe as Report;}return report;};

  server.get("/api/reports", async (request,reply) => {
    let includeDemo:boolean;try{includeDemo=parseIncludeDemo((request.query as {includeDemo?:unknown}).includeDemo);}catch{return reply.code(400).send({error:"invalid_include_demo"});}
    const [reports, exportRecords] = await Promise.all([store.listReports(), store.listReportExports()]);
    return { reports:await Promise.all(readSourceRows(reports,includeDemo).map(r=>safeReport(request,r))), exportRecords:readSourceRows(exportRecords,includeDemo),sourcePolicy:readSourcePolicy(includeDemo) };
  });

  server.post("/api/reports", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "report:write");
    if (authError) return authError;

    const body = request.body as CreateReportBody;
    if(body && (Object.hasOwn(body,"dataPurpose") || Object.hasOwn(body,"dataOrigin") || Object.hasOwn(body,"sourceBasis") || Object.hasOwn(body,"templateSnapshot") || Object.hasOwn(body,"templateRef"))) return reply.code(400).send({error:"invalid_report_payload"});
    const error = validateCreateReportBody(body);
    if (error) {
      return reply.code(400).send({ error });
    }

    try {
      const result = await store.createReport({...body,owner:resolveRequestUser(request,auth)!.name,createdById:resolveRequestUser(request,auth)!.id,dataOrigin:"user_input"} as Omit<Report, "id" | "fundId" | "projectId"> & Partial<Pick<Report, "id" | "fundId" | "projectId">>);
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof WorkflowError) return reply.code(error.status).send({ error: error.code });
      throw error;
    }
  });

  server.post("/api/reports/:id/approve", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "report:write");
    if (authError) return authError;

    const { id } = request.params as { id: string };
    const body=request.body as {expectedUpdatedAt?:unknown};
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='expectedUpdatedAt')||typeof body.expectedUpdatedAt!=='string'||!body.expectedUpdatedAt.trim()||body.expectedUpdatedAt.length>100)return reply.code(400).send({error:'invalid_report_revision'});
    const pending=(await store.listReports()).find(r=>r.id===id);if(!pending)return reply.code(404).send({error:'report_not_found'});
    try{const result=await store.approveReport(id,resolveRequestUser(request,auth)!,body.expectedUpdatedAt);if(!result)return reply.code(404).send({error:'report_not_found'});return {...result,report:await safeReport(request,result.report)};}
    catch(error){if(error instanceof WorkflowError)return reply.code(error.status).send({error:error.code,...(error instanceof ReportReadinessError?{fields:error.fields}:{})});throw error;}
  });

  server.patch('/api/reports/:id/content',async(request,reply)=>{
    const authError=requirePermission(request,reply,auth,'report:write');if(authError)return authError;
    const b=request.body as {sections?:Report['sections'];expectedUpdatedAt?:string;templateRef?:{id:string;version:number}};
    if(!b||Object.keys(b).some(k=>!['sections','expectedUpdatedAt','templateRef'].includes(k))||typeof b.expectedUpdatedAt!=='string'||!b.expectedUpdatedAt||!Array.isArray(b.sections)||!b.sections.length||b.sections.length>100||b.sections.some(v=>!v||Object.keys(v).some(k=>!['title','text'].includes(k))||typeof v.title!=='string'||!v.title.trim()||v.title.length>500||typeof v.text!=='string'||!v.text.trim()||v.text.length>100000))return reply.code(400).send({error:'invalid_report_content'});
    let snapshot:Report['templateSnapshot'];
    if(b.templateRef!==undefined){const ref=b.templateRef;if(!ref||Object.keys(ref).some(k=>!['id','version'].includes(k))||typeof ref.id!=='string'||!Number.isSafeInteger(ref.version))return reply.code(400).send({error:'invalid_template_reference'});snapshot=await options.agentRepository?.transaction(s=>[...s.templates,...s.templateHistory].find(t=>t.id===ref.id&&t.version===ref.version&&t.status==='published'));const actor=resolveRequestUser(request,auth)!;if(!snapshot||(snapshot.scope==='personal'&&snapshot.ownerId!==actor.id)||!templateSourceReadable(snapshot,await store.listMaterials(),actor))return reply.code(409).send({error:'template_version_conflict'});}
    try{const report=await store.saveReportContent((request.params as {id:string}).id,b.sections,b.expectedUpdatedAt,resolveRequestUser(request,auth)!,snapshot);if(!report)return reply.code(404).send({error:'report_not_found'});return {report:await safeReport(request,report)};}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}
  });
  server.post("/api/reports/:id/export", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "report:write");
    if (authError) return authError;

    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { format?: ReportExport["format"] };
    if(body.format!==undefined&&!['PDF','DOCX'].includes(body.format))return reply.code(400).send({error:'invalid_report_format'});
    const report=(await store.listReports()).find(v=>v.id===id);
    if(!report)return reply.code(404).send({error:'report_not_found'});
    try{assertReportReady(report);if(report.status!=='已完成')throw new WorkflowError('report_not_approved',409);await generateDocument(await visibleDocument(request,report),(body.format??'PDF').toLowerCase());}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code,...(e instanceof ReportReadinessError?{fields:e.fields}:{})});throw e;}
    let result;try{result=await store.exportReport(id,body.format??"PDF",resolveRequestUser(request,auth)!);}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code,...(e instanceof ReportReadinessError?{fields:e.fields}:{})});throw e;}
    if (!result) {
      return reply.code(404).send({ error: "report_not_found" });
    }
    return reply.code(201).send({...result,report:await safeReport(request,result.report)});
  });
  async function visibleDocument(request:any,report:Report,subtitle?:string):Promise<BusinessDocument>{
    const doc={title:report.name,subtitle:subtitle??`${report.target} · ${report.type} · ${report.status} · ${report.owner}`,sections:report.sections!};
    return canReadLp(resolveRequestUser(request,auth))?doc:(await lpProjection(store)).project({...doc,sourceBasis:report.sourceBasis}) as BusinessDocument;
  }
  server.get('/api/reports/exports/:exportId/file',async(request,reply)=>{
    if(!resolveRequestUser(request,auth))return reply.code(401).send({error:'unauthorized'});
    const {exportId}=request.params as {exportId:string};const entry=(await store.listReportExports()).find(v=>v.id===exportId);
    if(!entry)return reply.code(404).send({error:'report_export_not_found'});
    const report=(await store.listReports()).find(v=>v.id===entry.reportId);
    if(!report||!entry.sectionsSnapshot?.length)return reply.code(409).send({error:'report_content_required'});
    try{
      const format=entry.format.toLowerCase() as 'docx'|'pdf';
      const bytes=await generateDocument(await visibleDocument(request,{...report,name:entry.reportName,sections:entry.sectionsSnapshot,sourceBasis:entry.sourceBasis??report.sourceBasis},entry.watermark),format);
      options.onProjectedDocument?.(request);
      reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(entry.reportName+'.'+format)}`);
      return reply.type(documentMime[format]).send(bytes);
    }catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}
  });

}

function validateCreateReportBody(body: CreateReportBody) {
  if(body?.status!==undefined&&!['草稿','待审核','生成中'].includes(body.status))return 'invalid_report_status';
  if(body?.sections!==undefined&&(!Array.isArray(body.sections)||body.sections.length>100||body.sections.some(v=>!v||Object.keys(v).some(k=>!['title','text'].includes(k))||typeof v.title!=='string'||!v.title.trim()||v.title.length>500||typeof v.text!=='string'||!v.text.trim()||v.text.length>100000)))return 'invalid_report_content';
  const required: (keyof CreateReportBody)[] = ["name", "target", "type", "status", "owner", "updatedAt"];
  if (["projectId", "fundId", "targetId"].some(key => body?.[key as keyof CreateReportBody] !== undefined && body?.[key as keyof CreateReportBody] !== null && (typeof body[key as keyof CreateReportBody] !== "string" || !String(body[key as keyof CreateReportBody]).trim()))) return "invalid_report_target";
  if (body?.targetType !== undefined && !["project", "fund"].includes(body.targetType)) return "invalid_report_target";
  return required.find((key) => typeof body?.[key] !== "string") ? "invalid_report_payload" : null;
}
