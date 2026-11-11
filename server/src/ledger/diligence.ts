import type { SessionUser } from '../auth/session.ts';
import type { MaterialSnapshot } from './workflow.ts';
export type DiligenceDecision = {
    actor: SessionUser;
    decision: 'approve' | 'return' | 'reject';
    opinion: string;
    time: string;
};
export type DiligenceRequirement = {
    id: string;
    title: string;
};
export type DiligenceEvidence = {
    requirementId: string;
    material: MaterialSnapshot;
};
export type DiligenceSubmission = {
    id: string;
    version: number;
    summary: string;
    submittedBy: SessionUser;
    time: string;
    evidence: DiligenceEvidence[];
    status: 'pending' | 'approved' | 'returned';
    decisions: DiligenceDecision[];
};
export type DiligenceItem = {
    id: string;
    title: string;
    category: string;
    owner: SessionUser;
    dueDate: string;
    requirements: DiligenceRequirement[];
    taskId: string;
    status: 'draft' | 'pending' | 'approved' | 'returned';
    submissions: DiligenceSubmission[];
};
export type DiligenceFinding = {
    id: string;
    taskId: string;
    evidence: MaterialSnapshot[];
    description: string;
    severity: 'low' | 'medium' | 'high';
    owner: SessionUser;
    dueDate: string;
    itemIds: string[];
    materialIds: string[];
    blocksReport: boolean;
    status: 'open' | 'closed';
    history: {
        action: 'created' | 'resolved' | 'reopened';
        actor: SessionUser;
        note: string;
        time: string;
    }[];
};
export type DiligenceSections = {
    summary: string;
    workPerformed: string;
    findings: string;
    recommendation: string;
};
export type DiligenceSource = {
    items: DiligenceItem[];
    findings: DiligenceFinding[];
};
export type DiligenceReport = {
    id: string;
    origin: 'system_summary' | 'manual_edit';
    version: number;
    sections: DiligenceSections;
    reviewTaskIds: string[];
    sourceFingerprint: string;
    source: DiligenceSource;
    savedBy: SessionUser;
    time: string;
    submittedAt?: string;
    status: 'draft' | 'pending' | 'approved' | 'returned' | 'rejected';
    decisions: DiligenceDecision[];
};
export type DiligenceSupplement = {
    taskId: string;
    itemId?: string;
    reportId?: string;
    status: 'open' | 'completed';
    opinion: string;
    completedBy?: SessionUser;
    note?: string;
    completedAt?: string;
};
export type DiligenceCase = {
    id: string;
    projectId: string;
    ownerId: string;
    reviewers: SessionUser[];
    note: string;
    revision: number;
    status: 'active' | 'pending' | 'approved' | 'rejected';
    createdBy: SessionUser;
    createdAt: string;
    items: DiligenceItem[];
    findings: DiligenceFinding[];
    reports: DiligenceReport[];
    supplements: DiligenceSupplement[];
};
type ActionBase = {
    requestId: string;
    expectedRevision: number;
};
type ItemFields = {
    title: string;
    category: string;
    ownerId: string;
    dueDate: string;
    requirements: DiligenceRequirement[];
};
export type DiligenceAction = ActionBase & ({
    action: 'add_item';
} & ItemFields | {
    action: 'update_item';
    itemId: string;
} & ItemFields | {
    action: 'submit_item';
    itemId: string;
    summary: string;
    evidence: {
        requirementId: string;
        materialId: string;
    }[];
} | {
    action: 'reopen_item';
    itemId: string;
    note: string;
} | {
    action: 'review_item';
    itemId: string;
    decision: 'approve' | 'return';
    opinion: string;
} | {
    action: 'add_finding';
    description: string;
    severity: 'low' | 'medium' | 'high';
    ownerId: string;
    dueDate: string;
    itemIds: string[];
    materialIds: string[];
    blocksReport: boolean;
} | {
    action: 'resolve_finding' | 'reopen_finding';
    findingId: string;
    note: string;
} | {
    action: 'save_report';
    sections?: DiligenceSections;
} | {
    action: 'submit_report';
    reportId: string;
    dueDate: string;
} | {
    action: 'review_report';
    reportId: string;
    decision: 'approve' | 'return' | 'reject';
    opinion: string;
} | {
    action: 'complete_supplement';
    taskId: string;
    note: string;
});
