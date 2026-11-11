import {customInput,validateCustom,type CustomData,type Schemas} from './custom-fields.ts';
import type { DataPurpose } from './source-policy.ts';
import { randomUUID } from 'node:crypto';
import type { AuditEvent, CreateProjectInput, Fund, LedgerStore, Project } from './store.ts';
export type Company = CustomData & {
    createdAt?:string;
    id: string;
    ownerId?: string | null;
    name: string;
    shortName: string;
    industry: string;
    revision: number;
    dataOrigin?: string;
  dataPurpose?: DataPurpose;
};
export type CompanyMetadata = Pick<Company, 'name' | 'shortName' | 'industry'> & CustomData;
export type MasterResult = {
    company?: Company;
    project?: Project;
    auditEvent: AuditEvent;
    created: boolean;
};
export type MasterState = {
    schemas:Schemas;
    legacyAudits?:AuditEvent[];
    companies: Company[];
    projects: Project[];
    funds: Fund[];
    receipts: Record<string, {
        fingerprint: string;
        result: MasterResult;
    }>;
    auditEvents: AuditEvent[];
};
export class MasterWriteError extends Error {
    code: string;
    status: number;
    fields: string[];
    latest?: Company | ProjectMaster;
    constructor(code: string, status = 400, fields: string[] = [], latest?: Company | ProjectMaster) { super(code); this.code = code; this.status = status; this.fields = fields; this.latest = latest; }
}
export type ProjectMaster = Pick<Project, 'id' | 'name' | 'shortName' | 'industry' | 'description' | 'companyId' | 'masterRevision'>;
export function projectMaster(p: Project): ProjectMaster { return { id: p.id, name: p.name, shortName: p.shortName, industry: p.industry, description: p.description, companyId: p.companyId ?? null, ...customInput(p as unknown as Record<string,unknown>), masterRevision: p.masterRevision ?? 1 }; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MasterWriteError('invalid_master_payload'); return value as Record<string, unknown>; }
function strings(body: Record<string, unknown>, limits: Record<string, number>, extra: string[] = []): Record<string, string> {
    const invalid = Object.keys(limits).filter(k => typeof body[k] !== 'string' || (body[k] as string).length > limits[k] || (body[k] as string).includes('\0'));
    invalid.push(...Object.keys(body).filter(k => !Object.hasOwn(limits, k) && !extra.includes(k)));
    if (invalid.length)
        throw new MasterWriteError('invalid_master_payload', 400, invalid);
    return Object.fromEntries(Object.keys(limits).map(k => [k, (body[k] as string).trim()]));
}
export function companyMetadata(value: unknown): CompanyMetadata {
    const input = {...strings(object(value), { name: 200, shortName: 100, industry: 200 },['customFields','schemaRevision']),...customInput(object(value))};
    const invalid = ['name', 'shortName'].filter(k => !(input as Record<string,unknown>)[k]);
    if (invalid.length)
        throw new MasterWriteError('invalid_master_payload', 400, invalid);
    return input as CompanyMetadata;
}
export function companyBinding(body: Record<string, unknown>): {
    companyId?: string;
    newCompany?: CompanyMetadata;
} {
    if (body.companyId !== undefined && body.newCompany !== undefined)
        throw new MasterWriteError('invalid_master_payload', 400, ['companyId', 'newCompany']);
    if (body.companyId !== undefined) {
        if (typeof body.companyId !== 'string' || !body.companyId.trim() || body.companyId.length > 200 || body.companyId.includes('\0'))
            throw new MasterWriteError('invalid_master_payload', 400, ['companyId']);
        return { companyId: body.companyId.trim() };
    }
    if (body.newCompany !== undefined)
        return { newCompany: companyMetadata(body.newCompany) };
    return {};
}
function request(body: Record<string, unknown>, update: boolean) {
    if (typeof body.requestId !== 'string' || !uuid.test(body.requestId))
        throw new MasterWriteError('invalid_master_payload', 400, ['requestId']);
    if (update && (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 1))
        throw new MasterWriteError('invalid_master_payload', 400, ['expectedRevision']);
    return { requestId: body.requestId.toLowerCase(), ...(update ? { expectedRevision: body.expectedRevision as number } : {}) };
}
function addCompany(s: MasterState, input: CompanyMetadata, ownerId?: string): Company {
    if (s.companies.some(c => c.name === input.name))
        throw new MasterWriteError('company_name_conflict', 409, ['name']);
    const company: Company = { id: `company-${randomUUID()}`, ...input, ...validateCustom(s.schemas.company,input), revision: 1, dataOrigin: 'user_input', ownerId: ownerId ?? null };
    s.companies.push(company);
    return company;
}
function bind(s: MasterState, current: string | null | undefined, input: {
    companyId?: string;
    newCompany?: CompanyMetadata;
}): string | null {
    if (!input.companyId && !input.newCompany)
        return current ?? null;
    if (current) {
        if (input.companyId === current)
            return current;
        throw new MasterWriteError('project_company_rebind_forbidden', 409, ['companyId']);
    }
    if (input.companyId) {
        if (!s.companies.some(c => c.id === input.companyId))
            throw new MasterWriteError('company_not_found', 404);
        return input.companyId;
    }
    return addCompany(s, input.newCompany!).id;
}
function audit(s: MasterState, actor: {
    id: string;
    name: string;
}, requestId: string, target: Company | Project, before: unknown, created: boolean, isCompany: boolean): AuditEvent {
    const event: AuditEvent = { id: `audit-${randomUUID()}`, module: isCompany ? '企业主档' : '项目账本', action: isCompany ? (created ? '新增企业' : '修改企业主档') : (created ? '新增项目' : '修改项目主档'), targetType: isCompany ? '企业' : '项目', targetId: target.id, targetName: target.name, actor: actor.name, time: new Date().toISOString(), detail: JSON.stringify({ actorId: actor.id, requestId, before, after: isCompany ? target : projectMaster(target as Project) }), source: '主档维护', dataOrigin: 'user_input' };
    s.auditEvents.push(event);
    return event;
}
export function writeCompany(store: LedgerStore, value: unknown, actor: {
    id: string;
    name: string;
}, id?: string) {
    const body = object(value), req = request(body, !!id);
    const input = strings(body, { requestId: 36, name: 200, shortName: 100, industry: 200 }, [...(id?['expectedRevision']:[]),'customFields','schemaRevision']);
    const meta = companyMetadata({ name: input.name, shortName: input.shortName, industry: input.industry });
    return write(store, req.requestId, JSON.stringify({ actorId: actor.id, kind: 'company', id: id ?? null, ...req, ...meta,...customInput(body) }), s => {
        const current = id ? s.companies.find(c => c.id === id) : undefined;
        if (id && !current)
            throw new MasterWriteError('company_not_found', 404);
        if (current && current.revision !== req.expectedRevision)
            throw new MasterWriteError('company_revision_conflict', 409, [], current);
        const before = current ? structuredClone(current) : null;
        if (current && s.companies.some(c => c.id !== id && c.name === meta.name))
            throw new MasterWriteError('company_name_conflict', 409, ['name']);
        const company = current ? Object.assign(current, meta, validateCustom(s.schemas.company,customInput(body),current), { revision: current.revision + 1 }) : addCompany(s, {...meta,...customInput(body)}, actor.id);
        return { company, auditEvent: audit(s, actor, req.requestId, company, before, !current, true), created: !current };
    });
}
export function writeProjectMaster(store: LedgerStore, id: string, value: unknown, actor: {
    id: string;
    name: string;
}) {
    const body = object(value), req = request(body, true);
    const fields = strings(body, { requestId: 36, name: 200, shortName: 100, industry: 200, description: 20000 }, ['expectedRevision', 'companyId', 'newCompany','customFields','schemaRevision']);
    const invalid = ['name', 'shortName', 'industry'].filter(k => !fields[k]);
    if (invalid.length)
        throw new MasterWriteError('invalid_master_payload', 400, invalid);
    const binding = companyBinding(body), meta = { name: fields.name, shortName: fields.shortName, industry: fields.industry, description: fields.description };
    return write(store, req.requestId, JSON.stringify({ actorId: actor.id, kind: 'project', id, ...req, ...meta, ...binding,...customInput(body) }), s => {
        const p = s.projects.find(p => p.id === id);
        if (!p)
            throw new MasterWriteError('project_not_found', 404);
        if ((p.masterRevision ?? 1) !== req.expectedRevision)
            throw new MasterWriteError('project_revision_conflict', 409, [], projectMaster(p));
        const before = projectMaster(p), companyId = bind(s, p.companyId, binding);
        if (binding.newCompany)
            audit(s, actor, req.requestId, s.companies.find(c => c.id === companyId)!, null, true, true);
        Object.assign(p, meta, validateCustom(s.schemas.project,customInput(body),p,p.stage), { companyId, masterRevision: (p.masterRevision ?? 1) + 1, updatedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) });
        return { project: p, auditEvent: audit(s, actor, req.requestId, p, before, false, false), created: false };
    });
}
export async function createBoundProject(store: LedgerStore, input: CreateProjectInput, actor: {
    id: string;
    name: string;
}) {
    const result = await write(store, input.requestId, JSON.stringify({ actorId: actor.id, kind: 'project-create', input }), s => {
        const id = `project-${input.requestId}`;
        const existingProject=s.projects.find(p=>p.id===id);
        if(existingProject){const legacy=s.legacyAudits?.find(e=>e.targetId===id&&e.action==='新增项目');if(legacy&&legacy.detail===JSON.stringify({actorId:actor.id,input}))return {project:existingProject,auditEvent:legacy,created:false};throw new MasterWriteError('project_request_conflict',409);}
        const fund = s.funds.find(f => f.id === input.fundId);
        if (!fund)
            throw new MasterWriteError('fund_not_found', 404);
        const companyId = bind(s, null, input);
        if (input.newCompany)
            audit(s, actor, input.requestId, s.companies.find(c => c.id === companyId)!, null, true, true);
        // An initial stage records workflow location; approvals, closing and cashflows require their own evidence.
        const p: Project = { ...validateCustom(s.schemas.project,input,undefined,input.stage??'初筛'), id, companyId, masterRevision: 1, fundId: fund.id, fund: fund.name, name: input.name, shortName: input.shortName, industry: input.industry, description: input.description, manager: input.manager || actor.name, managerLabel: input.manager || actor.name, ownerId: !input.manager || input.manager === actor.name || input.manager === (actor as {
                email?: string;
            }).email ? actor.id : null, collaborators: input.collaborators, sourceChannel: input.sourceChannel, status: '拟投', stage: input.stage??'初筛', risk: '低', amount: '未录入', latest: '项目已建档', todoCount: 0, updatedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }), thesis: '', nextAction: !input.stage||input.stage==='初筛'?'开展项目初筛':`核对${input.stage}阶段原件与历史依据，补录实际业务记录`, dataOrigin: 'user_input' };
        s.projects.push(p);
        return { project: p, auditEvent: audit(s, actor, input.requestId, p, null, true, false), created: true };
    }, true);
    return { ...result, project: result.project! };
}
function write(store: LedgerStore, requestId: string, fingerprint: string, action: (s: MasterState) => MasterResult, creation = false) {
    return store.masterTransaction(s => {
        const existing = s.receipts[requestId];
        if (existing) {
            if (existing.fingerprint !== fingerprint)
                throw new MasterWriteError(creation?'project_request_conflict':'master_request_conflict', 409);
            const result = structuredClone({ ...existing.result, created: false });
            if (creation && result.project)
                result.project = structuredClone(s.projects.find(p => p.id === result.project!.id) ?? result.project);
            return result;
        }
        const result = action(s);
        s.receipts[requestId] = { fingerprint, result: structuredClone(result) };
        return structuredClone(result);
    });
}
