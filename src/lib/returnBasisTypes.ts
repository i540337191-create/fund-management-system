import type {ApiSessionUser,WorkflowUser} from './apiClient';
import type {ExitProof} from './exitSettlementTypes';
import type {DealMaterialRef} from './dealTypes';
export type ReturnScope = {
    type: 'project_fund_deal';
    projectId: string;
    dealId: string;
    fundId: string;
};
export type ReturnStatus = 'draft' | 'pending' | 'approved' | 'returned' | 'rejected';
export type ReturnDecision = {
    actor: ApiSessionUser;
    time: string;
    decision: 'approve' | 'return' | 'reject';
    opinion: string;
    authorizationEvidence: ExitProof[];
};
export type ReturnRecord = {
    id: string;
    groupId: string;
    version: number;
    scope: ReturnScope;
    status: ReturnStatus;
    author: ApiSessionUser;
    createdAt: string;
    revisionReason?: string;
    reviewer?: ApiSessionUser;
    submittedAt?: string;
    contentHash: string;
    evidence: ExitProof[];
    decisions: ReturnDecision[];
    taskIds: string[];
};
export const termChoices = {
    metricScope: ['project_fund_deal'], measure: ['total', 'realized'], basis: ['gross', 'net'], irrDefinition: ['annual_discounted_cashflow'], moicNumerator: ['distributions_plus_terminal', 'distributions_only'], moicDenominator: ['invested_capital', 'all_outflows'],
    currency: ['CNY'], fxRule: ['reject_non_cny'], dateField: ['bank_date'], timeZone: ['Asia/Shanghai'], dayCount: ['ACT_365_FIXED', 'ACT_360', 'ACT_ACT_ISDA'], asOfRule: ['economic_date_inclusive'], lateEntryRule: ['known_at_snapshot_restate_explicitly'], correctionRule: ['exclude_registration_at_reversal_known_time'],
    terminalPolicy: ['explicit_valuation_required', 'explicit_zero_with_evidence', 'not_applicable_with_evidence'], feePolicy: ['include_actual_cash', 'exclude_with_disclosure'], taxPolicy: ['include_actual_cash', 'exclude_with_disclosure'], netReceiptPolicy: ['net_receipt_once_no_duplicate_withholding'], roundingMode: ['half_up', 'half_even'], sameDayPolicy: ['aggregate_by_date'], noRootPolicy: ['null_no_root'], multipleRootPolicy: ['null_multiple_roots'], negativeRootPolicy: ['allow_above_minus_one', 'null_negative_root']
} as const;
export type ReturnTerms = Partial<Record<keyof typeof termChoices, string>> & {
    cashflowMapping?: Partial<Record<'investment_payment' | 'project_fee' | 'project_tax' | 'exit_receipt', 'outflow' | 'inflow' | 'exclude'>>;
    irrDecimals?: number;
    amountDecimals?: number;
    moicDecimals?: number;
    tolerance?: string;
    lowerRateBound?: string;
    upperRateBound?: string;
    maxIterations?: number;
    explanation?: string;
};
export type BasisVersion = ReturnRecord & {
    terms: ReturnTerms;
};
export type SampleCashflow = {
    date: string;
    amount: string;
    direction: 'outflow' | 'inflow';
    kind: string;
    currency: 'CNY';
};
export type IndependentSample = ReturnRecord & {
    basisId: string;
    basisVersion: number;
    basisContentHash: string;
    origin: 'finance_independent' | 'engineering_fixture';
    cashflows: SampleCashflow[];
    asOfDate?: string;
    terminalValue: null | {
        amount: string;
        date: string;
        currency: 'CNY';
        scope: string;
        evidence: ExitProof[];
    };
    expected: {
        irr: null | string;
        irrUnit: 'annual_fraction';
        moic: null | string;
        resultStatus: string;
        tolerance: string;
    };
    derivationText: string;
};
export const coverageKeys = ['outflows', 'inflows', 'fees', 'taxes', 'currency', 'terminalValue'] as const;
export type CoverageKey = typeof coverageKeys[number];
export type CoverageItem = {
    status: 'confirmed_complete' | 'confirmed_not_applicable' | 'unknown';
    explanation: string;
    evidence: ExitProof[];
};
export type CurrencyConfirmation = {
    sourceId: string;
    currency: 'CNY';
    evidence: ExitProof[];
};
export type ReturnTerminalValue = {
    amount: string;
    date: string;
    currency: 'CNY';
    scope: string;
    evidence: ExitProof[];
};
export type CashflowReview = ReturnRecord & {
    asOfDate: string;
    knownAt: string;
    sourceHash: string;
    coverage: Partial<Record<CoverageKey, CoverageItem>>;
    currencyConfirmations: CurrencyConfirmation[];
    terminalValue: ReturnTerminalValue | null;
};

export type ReturnRecordView<T extends ReturnRecord=ReturnRecord> = T & {latest:boolean;missingReasons:string[];isApplicable?:boolean};
export type ReturnInputRow={sourceType:'investment_cashflow'|'exit_payment';sourceId:string;date:string;amount:string|null;amountMinor:string|null;direction:'outflow'|'inflow';kind:string;currency:'CNY'|'unknown';recordedAt:string;included:boolean;reasonCodes:string[];evidence:ExitProof[];reversal?:{time:string;reason:string;evidence:ExitProof[]};sourceVersionHash:string};
export type ReturnInputs={scope:ReturnScope;asOfDate:string;knownAt:string;rows:ReturnInputRow[];sourceHash:string;missingReasons:string[];coverageStatus:string;effectiveInput:{rows:(ReturnInputRow&{sourceCurrency:'CNY'|'unknown';currencyConfirmation?:CurrencyConfirmation})[];terminalValue:ReturnTerminalValue|null;reviewId:string|null;reviewVersion:number|null;reviewContentHash:string|null}};
export type ReturnTaskLink={taskId:string;sourceType:'return_basis'|'return_sample'|'cashflow_review';sourceId:string;sourceVersion:number;contentHash:string;dealId:string;fundId:string;section:'returns'};
export type ReturnView={project:{id:string;name:string;ownerId:string|null};revision:number;currentUser:ApiSessionUser;mayDraft:boolean;mayReview:boolean;scopes:ReturnScope[];reviewers:WorkflowUser[];termChoices:Record<keyof typeof termChoices,readonly string[]>;bases:ReturnRecordView<BasisVersion>[];samples:ReturnRecordView<IndependentSample>[];reviews:ReturnRecordView<CashflowReview>[];inputs:ReturnInputs|null;metrics:{irr:{value:string|null;status:string;reasonCodes:string[]};moic:{value:string|null;status:string;reasonCodes:string[]}};publicationStatus:{status:'not_published'|'published';reasonCodes:string[];technicalApprovalOnly:boolean};taskLinks:ReturnTaskLink[]};
export type ReturnKind='basis'|'sample'|'review';
type Ref=DealMaterialRef;
type TerminalDraft=Omit<ReturnTerminalValue,'evidence'>&{evidence:Ref[]};
export type SampleDraft=Omit<IndependentSample,keyof ReturnRecord|'terminalValue'>&{terminalValue:TerminalDraft|null};
export type ReviewDraft={asOfDate:string;knownAt:string;sourceHash:string;coverage:Partial<Record<CoverageKey,Omit<CoverageItem,'evidence'>&{evidence:Ref[]}>>;currencyConfirmations:{sourceId:string;currency:'CNY';evidence:Ref[]}[];terminalValue:TerminalDraft|null};
type Identity={recordId:string;version:number;contentHash:string};
type ScopeInput={dealId:string;fundId:string};
type Base={requestId:string;expectedRevision:number};
export type ReturnAction=Base&(
 (ScopeInput&{action:'create_basis';terms:ReturnTerms;evidence:Ref[]})|
 (Identity&{action:'revise_basis';terms:ReturnTerms;evidence:Ref[];revisionReason?:string})|
 (ScopeInput&{action:'create_sample';sample:SampleDraft;evidence:Ref[]})|
 (Identity&{action:'revise_sample';sample:SampleDraft;evidence:Ref[];revisionReason?:string})|
 (ScopeInput&{action:'create_review';review:ReviewDraft;evidence:Ref[]})|
 (Identity&{action:'revise_review';review:ReviewDraft;evidence:Ref[];revisionReason?:string})|
 (Identity&{action:`submit_${ReturnKind}`;reviewerId:string;dueDate:string})|
 (Identity&{action:`decide_${ReturnKind}`;decision:'approve'|'return'|'reject';opinion:string;authorizationEvidence:Ref[]})
);
