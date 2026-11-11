import type { ApiSessionUser as SessionUser } from './apiClient';
import type { ApprovalMaterial as MaterialSnapshot } from './apiClient';
import type { DealMaterialRef } from './dealTypes';
export type PostPeriodKind = 'day' | 'month' | 'quarter' | 'half' | 'year';
export type PostPeriod = {
    kind: PostPeriodKind;
    value: string;
};
export type PostBase = {
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
export type PostReport = PostBase & {
 readIssue?:string;title:string;period:PostPeriod;analysis:string;status:'draft'|'pending'|'approved'|'returned'|'rejected'|'archived';reviewer:SessionUser;evidence:MaterialSnapshot[];sourceHash:string;
 snapshot:{project:{id:string;name:string};capturedAt:string;financial:PostFinancial|null;visits:PostVisit[];archives:PostArchive[];clauses:PostClause[];fundIds:string[];
 risks:{id:string;projectId:string|null;title:string;time:string;level:string;source:string;summary:string;status:string;updatedAt:string}[];
 capitalRecords:{id:string;projectId:string|null;fundId:string;company:string;fund:string;received:string;date:string;rule:string;receivable:string;dueDate:string;status:string;source?:string;confirmationStatus?:string;updatedAt:string}[]};
 missing:{key:string;label:string;reason:string}[];taskIds:string[];
 decisions:{actor:SessionUser;decision:'approve'|'return'|'reject';opinion:string;acceptMissing:boolean;time:string}[];archived?:{actor:SessionUser;time:string};
};
export type PostInvestmentState = {
    exitPreparations?: import('./exitPreparation').ExitPreparation[];
    reports?: PostReport[];
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
} | {action:'save_report';recordId?:string;reason:string;report:{title:string;period:PostPeriod;analysis:string;evidence:DealMaterialRef[]}}
 | {action:'submit_report'|'archive_report';recordId:string}
 | {action:'review_report';recordId:string;decision:'approve'|'return'|'reject';opinion:string;acceptMissing:boolean}
 | {action:'save_exit';recordId?:string;reason:string;exit:import('./exitPreparation').ExitPreparationDraft}
 | {action:'submit_exit'|'archive_exit';recordId:string}
 | {action:'review_exit';recordId:string;decision:'approve'|'return'|'reject';opinion:string});
