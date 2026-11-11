import type {SourceBasis} from './source-policy.ts';
import type { DiligenceCase } from './diligence.ts';
import { randomUUID } from 'node:crypto';
import type { Role } from '../auth/rbac.ts';
import type { SessionUser } from '../auth/session.ts';
import type { AuditEvent, Project, ProjectTask } from './store.ts';
export type DirectoryUser = SessionUser & {
    canLogin: boolean;
};
export type StoredUser = SessionUser & {
    passwordHash: string | null;
    enabled?: boolean;
    revision?: number;
};
export type MeetingType = '立项会' | '总办会' | '投委会';
export const meetings: MeetingType[] = ['立项会', '总办会', '投委会'];
export const approvalEligible = (role: Role) => role === 'admin' || role === 'investment_manager';
export type MaterialSnapshot = {
    sourceBasis?:SourceBasis[];
    packetBlobId?: string;
    materialId: string;
    versionId: string | null;
    name: string;
    sha256: string;
    sizeBytes: number;
    downloadHref: string;
};
export type ApprovalRound = {
    id: string;
    projectId: string;
    meetingType: MeetingType;
    attempt: number;
    status: 'pending' | 'approved' | 'returned' | 'rejected';
    revision: number;
    ownerId: string;
    submittedBy: SessionUser;
    reviewers: SessionUser[];
    materials: MaterialSnapshot[];
    dueDate: string;
    note: string;
    createdAt: string;
    decisions: {
        actor: SessionUser;
        decision: 'approve' | 'return' | 'reject';
        opinion: string;
        time: string;
    }[];
};
export type Receipt = {
    fingerprint: string;
    result: any;
};
export type WorkflowState = {
    bankEventIdentities?: {fundId:string;bankAccount:string;bankReference:string;status:'posted'|'reversed'}[];
    exitPaymentIdentities?: import('./exit-settlement.ts').ExitPayment[];
    reportSources?: {risks: import('./store.ts').RiskRecord[]; capitalRecords: import('./store.ts').CapitalRecord[]};
    postInvestment?: import('./post-investment.ts').PostInvestmentState;
    diligence?: DiligenceCase | null;
    deals?: import('./deal.ts').DealBatch[];
    project: Project;
    tasks: ProjectTask[];
    rounds: ApprovalRound[];
    receipts: Record<string, Receipt>;
    auditEvents: AuditEvent[];
};
export type WorkflowStore = {
    listUsers(): Promise<StoredUser[]> | StoredUser[];
    insertUser(user: StoredUser): Promise<void> | void;
    workflowTransaction<T>(projectId: string, action: (state: WorkflowState) => Promise<T>, options?: {reportSources?: boolean; exitPaymentIdentities?: boolean; bankEventIdentities?: boolean}): Promise<T>;
    listPostInvestmentProjectIds(): string[] | Promise<string[]>;
    readExitStates(): Promise<{project: Project; deals: import('./deal.ts').DealBatch[]; postInvestment?: import('./post-investment.ts').PostInvestmentState}[]>;
    readApprovals(projectId: string): Promise<ApprovalRound[]> | ApprovalRound[];
};
export class WorkflowError extends Error {
    code: string;
    status: number;
    constructor(code: string, status = 400) {
        super(code);
        this.code = code;
        this.status = status;
    }
}
export function fail(code: string, status = 400): never {
    throw new WorkflowError(code, status);
}
export function object(value: unknown, keys: string[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        fail('invalid_payload');
    const b = value as Record<string, unknown>;
    if (Object.keys(b).some(k => !keys.includes(k)))
        fail('invalid_payload');
    return b;
}
export function string(value: unknown, required = true, max = 20000): string {
    if (typeof value !== 'string' || value.length > max || value.includes('\0') || (required && !value.trim()))
        fail('invalid_payload');
    return value.trim();
}
export function taskCreateFields(value:unknown){
    const b=object(value,['requestId','projectId','name','type','stage','ownerId','dueDate','status','priority','relation','note']);
    const input={name:string(b.name,true,500),type:string(b.type,true,200),stage:string(b.stage,true,200),dueDate:date(b.dueDate),priority:string(b.priority,true,20),relation:string(b.relation,false),note:string(b.note,false),status:b.status===undefined?'未开始':string(b.status)};
    if(input.status!=='未开始'||!['高','中','低'].includes(input.priority))fail('invalid_task_payload');
    return input;
}
export function requestId(v: unknown) {
    const id = string(v, true, 36).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))
        fail('invalid_request_id');
    return id;
}
export function date(v: unknown) {
    const s = string(v, true, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s + 'T00:00:00Z')) || new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s)
        fail('invalid_due_date');
    return s;
}
export function revision(v: unknown) {
    if (!Number.isSafeInteger(v) || Number(v) < 1)
        fail('invalid_revision');
    return Number(v);
}
export function audit(s: WorkflowState, actor: SessionUser, action: string, detail: unknown, targetId = s.project.id) {
    const event: AuditEvent = {
        id: randomUUID(), time: new Date().toISOString(), module: '审批与任务', action, targetType: targetId === s.project.id ? '项目' : '任务', targetId, targetName: s.project.name, actor: actor.name, detail: JSON.stringify({
            projectId: s.project.id, actorId: actor.id, detail
        }), source: '审批与任务', dataOrigin: 'user_input'
    };
    s.auditEvents.push(event);
    return event;
}
export async function idempotent<T>(s: WorkflowState, id: string, actor: SessionUser, input: unknown, action: () => Promise<T>): Promise<T & {
    created: boolean;
}> {
    const fingerprint = JSON.stringify({
        projectId: s.project.id, actorId: actor.id, input
    });
    const prior = s.receipts[id];
    if (prior) {
        if (prior.fingerprint !== fingerprint)
            fail('request_conflict', 409);
        return {
            ...structuredClone(prior.result), created: false
        };
    }
    const value=await action();
    s.project.todoCount=s.tasks.filter(task=>!['已完成','已取消'].includes(task.status)).length;
    const result = {
        ...value, created: true
    };
    s.receipts[id] = {
        fingerprint, result: structuredClone(result)
    };
    return result;
}
export function newTask(s: WorkflowState, owner: SessionUser, input: Partial<ProjectTask> & {
    name: string;
    dueDate: string;
}): ProjectTask {
    const t: ProjectTask = {
        id: randomUUID(), projectId: s.project.id, type: '审批任务', stage: s.project.stage, owner: owner.name, ownerId: owner.id, status: '未开始', priority: '中', relation: '审批', note: '', kind: 'manual', revision: 1, completedAt: null, updatedAt: new Date().toISOString(), dataOrigin: input.kind ? 'system_generated' : 'user_input', ...input
    };
    s.tasks.push(t);
    return t;
}
