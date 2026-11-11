import type { SourceRecord } from './source-policy.ts';
import type { SessionUser } from '../auth/session.ts';
import type { MaterialSnapshot } from './workflow.ts';
import type { DealMaterialRef } from './deal.ts';
export type PostPeriodKind = 'day' | 'month' | 'quarter' | 'half' | 'year';
export type PostPeriod = {
    kind: PostPeriodKind;
    value: string;
};
export type PostBase = SourceRecord & {
    id: string;
    version: number;
    dealId: string;
    owner: SessionUser;
    time: string;
    reason: string;
};
export type PostFinancialInput = {
    period: PostPeriod;
    asOfDate: string;
    currency: 'CNY';
    basis: string;
    revenue: string | null;
    netProfit: string | null;
    netAssets: string | null;
    valuation: string | null;
    employees: number | null;
    missingReasons: Partial<Record<'revenue' | 'netProfit' | 'netAssets' | 'valuation' | 'employees', string>>;
    source: string;
    evidence: DealMaterialRef[];
    reviewerId: string;
};
export type PostFinancial = PostBase & Omit<PostFinancialInput, 'evidence' | 'reviewerId'> & {
    evidence: MaterialSnapshot[];
    reviewer: SessionUser;
    status: 'draft' | 'pending' | 'approved' | 'returned' | 'rejected';
    reviewerTaskId?: string;
    decisions: {
        actor: SessionUser;
        decision: 'approve' | 'return' | 'reject';
        opinion: string;
        time: string;
    }[];
};
export type PostVisitInput = {
    date: string;
    ownerId: string;
    analysis: string;
    evidence: DealMaterialRef[];
    followUps: {
        title: string;
        ownerId: string;
        dueDate: string;
    }[];
};
export type PostVisit = PostBase & Omit<PostVisitInput, 'ownerId' | 'evidence' | 'followUps'> & {
    evidence: MaterialSnapshot[];
    followUps: {
        title: string;
        owner: SessionUser;
        dueDate: string;
        taskId: string;
    }[];
};
export type PostArchive = PostBase & {
    period: PostPeriod;
    category: string;
    note: string;
    materials: MaterialSnapshot[];
    allocations: {
        dealId: string;
        termsId: string;
        fundId: string;
        amount: string;
    }[];
};
export type PostClauseInput = {
    agreementId: string;
    title: string;
    quote: string;
    sourceLocation: string;
    obligation: string;
    threshold: string;
    triggerDate: string;
    ownerId: string;
};
export type PostClause = PostBase & Omit<PostClauseInput, 'ownerId'> & {
    signedMaterial: MaterialSnapshot;
    status: 'active' | 'fulfilled' | 'cancelled';
    warningTaskId?: string;
    warningIssue?: {code:'owner_unavailable';message:string};
    resolution?: {
        reason: string;
        evidence: MaterialSnapshot[];
        actor: SessionUser;
        time: string;
    };
};
export type PostInvestmentState = {
    manualRisks?:import('./manual-risks.ts').ManualRisk[];
    returnBases?: import('./return-basis.ts').BasisVersion[];
    returnSamples?: import('./return-basis.ts').IndependentSample[];
    cashflowReviews?: import('./return-basis.ts').CashflowReview[];
    investmentCashflows?: import('./investment-cashflows.ts').InvestmentCashflow[];
    exitArchives?: import('./asset-history.ts').ExitArchive[];
    exitClaims?: import('./asset-history.ts').ExitClaim[];
    exitExecutions?: import('./exit-settlement.ts').ExitExecution[];
    exitPayments?: import('./exit-settlement.ts').ExitPayment[];
    exitPreparations?: import('./exit-preparation.ts').ExitPreparation[];
    reports?: import('./post-report.ts').PostReport[];
    revision: number;
    financials: PostFinancial[];
    visits: PostVisit[];
    archives: PostArchive[];
    clauses: PostClause[];
};
export type PostInvestmentView = {
    postInvestment: PostInvestmentState;
    closedDeals: {
        id: string;
        title: string;
        owner: SessionUser;
        agreements: {
            id: string;
            title: string;
            signedMaterial: MaterialSnapshot;
        }[];
    }[];
    currentUser: SessionUser;
};
export type PostInvestmentAction = {
    requestId: string;
    expectedRevision: number;
    dealId: string;
} & ({
    action: 'save_financial';
    recordId?: string;
    reason: string;
    financial: PostFinancialInput;
} | {
    action: 'submit_financial';
    recordId: string;
} | {
    action: 'review_financial';
    recordId: string;
    decision: 'approve' | 'return' | 'reject';
    opinion: string;
} | {
    action: 'save_visit';
    recordId?: string;
    reason: string;
    visit: PostVisitInput;
} | {
    action: 'archive';
    period: PostPeriod;
    category: string;
    note: string;
    materials: DealMaterialRef[];
} | {
    action: 'save_clause';
    recordId?: string;
    reason: string;
    clause: PostClauseInput;
} | {
    action: 'resolve_clause';
    recordId: string;
    status: 'fulfilled' | 'cancelled';
    reason: string;
    evidence: DealMaterialRef[];
} | {
    action: 'reconcile';
});
export const emptyPostInvestment = (): PostInvestmentState => ({ revision: 1, financials: [], visits: [], archives: [], clauses: [] });
import { audit, date, fail, newTask, type WorkflowState } from './workflow.ts';
export function shanghaiDay(now = new Date()): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function sixMonthsBefore(value: string): string {
    const day = date(value), [y, m, d] = day.split('-').map(Number), first = new Date(Date.UTC(y, m - 7, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}
export function canonicalPeriod(input: unknown): PostPeriod {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        fail('invalid_period');
    const b = input as Record<string, unknown>;
    if (Object.keys(b).some(k => !['kind', 'value'].includes(k)) || typeof b.value !== 'string')
        fail('invalid_period');
    const v = b.value, kind = b.kind;
    if (kind === 'day')
        date(v);
    else if (kind === 'month') {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))
            fail('invalid_period');
    }
    else if (kind === 'quarter') {
        if (!/^\d{4}-Q[1-4]$/.test(v))
            fail('invalid_period');
    }
    else if (kind === 'half') {
        if (!/^\d{4}-H[12]$/.test(v))
            fail('invalid_period');
    }
    else if (kind === 'year') {
        if (!/^\d{4}$/.test(v))
            fail('invalid_period');
    }
    else
        fail('invalid_period');
    if (Number(v.slice(0, 4)) < 1900 || Number(v.slice(0, 4)) > 9999)
        fail('invalid_period');
    return { kind, value: v } as PostPeriod;
}
export function periodContains(p: PostPeriod, value: string): boolean {
    const d = date(value), month = Number(d.slice(5, 7));
    return p.kind === 'day' ? p.value === d : p.kind === 'month' ? p.value === d.slice(0, 7) : p.kind === 'year' ? p.value === d.slice(0, 4) : p.kind === 'quarter' ? p.value === `${d.slice(0, 4)}-Q${Math.ceil(month / 3)}` : p.value === `${d.slice(0, 4)}-H${Math.ceil(month / 6)}`;
}
export function latestVersions<T extends {
    id: string;
}>(values: T[]): T[] { return values.filter((v, i) => !values.slice(i + 1).some(x => x.id === v.id)); }
export function reconcilePostClauses(s: WorkflowState, today: string, eligibleOwnerIds?: ReadonlySet<string>): boolean {
    date(today);
    const post = s.postInvestment;
    if (!post)
        return false;
    let changed = false;
    for (const c of latestVersions(post.clauses)) {
        if (c.status !== 'active' || sixMonthsBefore(c.triggerDate) > today || c.warningTaskId)
            continue;
        if (eligibleOwnerIds && !eligibleOwnerIds.has(c.owner.id)) {
            if (!c.warningIssue) {
                c.warningIssue = {code:'owner_unavailable',message:'责任人无法登录或不具备投后操作角色，恢复后将自动重试'};
                changed = true;
                const event = audit(s, {id:'system-post-investment',name:'投后预警后台',email:'system@internal.local',role:'admin'}, '投后条款预警受阻', {clauseId:c.id,version:c.version,responsibleOwnerId:c.owner.id,issue:c.warningIssue});
                event.module='投后管理';event.source='后台自动核对';
            }
            continue;
        }
        delete c.warningIssue;
        const task = newTask(s, c.owner, { name: `条款预警：${c.title}`, dueDate: c.triggerDate, kind: 'post_clause', type: '条款预警', relation: `投后条款 ${c.id} v${c.version}`, priority: '高', note: `提前六个日历月提醒；用户约定：${c.obligation}；阈值：${c.threshold}` });
        c.warningTaskId = task.id;
        changed = true;
        const event = audit(s, { id: 'system-post-investment', name: '投后预警后台', email: 'system@internal.local', role: 'admin' }, '投后条款预警', { clauseId: c.id, version: c.version, taskId: task.id, today, responsibleOwnerId: c.owner.id, trigger: 'server_reconciliation' });
        event.module = '投后管理';
        event.source = '后台自动核对';
    }
    if (changed) {
        post.revision++;
        s.project.todoCount = s.tasks.filter(t => !['已完成', '已取消'].includes(t.status)).length;
    }
    return changed;
}
