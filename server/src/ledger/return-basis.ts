import type { SourceRecord } from './source-policy.ts';
import { createHash } from 'node:crypto';
import type { SessionUser } from '../auth/session.ts';
import { date, fail, object, string, type MaterialSnapshot } from './workflow.ts';
export type ReturnScope = {
    type: 'project_fund_deal';
    projectId: string;
    dealId: string;
    fundId: string;
};
export type ReturnStatus = 'draft' | 'pending' | 'approved' | 'returned' | 'rejected';
export type ReturnDecision = {
    actor: SessionUser;
    time: string;
    decision: 'approve' | 'return' | 'reject';
    opinion: string;
    authorizationEvidence: MaterialSnapshot[];
};
export type ReturnRecord = SourceRecord & {
    id: string;
    groupId: string;
    version: number;
    scope: ReturnScope;
    status: ReturnStatus;
    author: SessionUser;
    createdAt: string;
    revisionReason?: string;
    reviewer?: SessionUser;
    submittedAt?: string;
    contentHash: string;
    evidence: MaterialSnapshot[];
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
        evidence: MaterialSnapshot[];
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
    evidence: MaterialSnapshot[];
};
export type CurrencyConfirmation = {
    sourceId: string;
    currency: 'CNY';
    evidence: MaterialSnapshot[];
};
export type ReturnTerminalValue = {
    amount: string;
    date: string;
    currency: 'CNY';
    scope: string;
    evidence: MaterialSnapshot[];
};
export type CashflowReview = ReturnRecord & {
    asOfDate: string;
    knownAt: string;
    sourceHash: string;
    coverage: Partial<Record<CoverageKey, CoverageItem>>;
    currencyConfirmations: CurrencyConfirmation[];
    terminalValue: ReturnTerminalValue | null;
};
export function canonicalHash(v: unknown): string { const sort = (x: any): any => Array.isArray(x) ? x.map(sort) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().filter(k => !['packetBlobId', 'downloadHref', 'readIssue'].includes(k)).map(k => [k, sort(x[k])])) : x; return createHash('sha256').update(JSON.stringify(sort(v))).digest('hex'); }
export function recordHash(v: ReturnRecord) { const { id, groupId, version, scope, evidence } = v; return canonicalHash({ id, groupId, version, scope, evidence, revisionReason: v.revisionReason, ...('terms' in v ? { terms: (v as BasisVersion).terms } : 'basisId' in v ? { basisId: (v as IndependentSample).basisId, basisVersion: (v as IndependentSample).basisVersion, basisContentHash: (v as IndependentSample).basisContentHash, origin: (v as IndependentSample).origin, cashflows: (v as IndependentSample).cashflows, asOfDate: (v as IndependentSample).asOfDate, terminalValue: (v as IndependentSample).terminalValue, expected: (v as IndependentSample).expected, derivationText: (v as IndependentSample).derivationText } : { asOfDate: (v as CashflowReview).asOfDate, knownAt: (v as CashflowReview).knownAt, sourceHash: (v as CashflowReview).sourceHash, coverage: (v as CashflowReview).coverage, currencyConfirmations: (v as CashflowReview).currencyConfirmations, terminalValue: (v as CashflowReview).terminalValue }) }); }
export function parseTerms(v: unknown): ReturnTerms {
    const b = object(v, [...Object.keys(termChoices), 'cashflowMapping', 'irrDecimals', 'amountDecimals', 'moicDecimals', 'tolerance', 'lowerRateBound', 'upperRateBound', 'maxIterations', 'explanation']);
    for (const [k, choices] of Object.entries(termChoices))
        if (b[k] !== undefined && !(choices as readonly unknown[]).includes(b[k]))
            fail('unsupported_return_term');
    if (b.cashflowMapping !== undefined) {
        const m = object(b.cashflowMapping, ['investment_payment', 'project_fee', 'project_tax', 'exit_receipt']);
        if (Object.values(m).some(v => !['outflow', 'inflow', 'exclude'].includes(String(v))))
            fail('invalid_cashflow_mapping');
        if (m.investment_payment && m.investment_payment !== 'outflow' || m.exit_receipt && m.exit_receipt !== 'inflow' || m.project_fee === 'inflow' || m.project_tax === 'inflow')
            fail('invalid_cashflow_mapping');
    }
    for (const k of ['irrDecimals', 'amountDecimals', 'moicDecimals'])
        if (b[k] !== undefined && (!Number.isInteger(b[k]) || Number(b[k]) < 0 || Number(b[k]) > 12))
            fail('invalid_rounding');
    for (const k of ['tolerance', 'lowerRateBound', 'upperRateBound'])
        if (b[k] !== undefined)
            decimal(b[k], k !== 'lowerRateBound');
    if (b.maxIterations !== undefined && (!Number.isInteger(b.maxIterations) || Number(b.maxIterations) < 1 || Number(b.maxIterations) > 100000))
        fail('invalid_iteration_bound');
    if (b.explanation !== undefined)
        string(b.explanation);
    return structuredClone(b) as ReturnTerms;
}
export function decimal(v: unknown, nonnegative = false) {
    const s = string(v, true, 50);
    if (!/^-?(0|[1-9]\d{0,17})(\.\d{1,18})?$/.test(s) || nonnegative && s.startsWith('-'))
        fail('invalid_return_decimal');
    return s;
}
export function compareDecimal(a: string, b: string) { const parts = (s: string) => { const negative = s.startsWith('-'), [w, f = ''] = (negative ? s.slice(1) : s).split('.'); return { negative, w, f }; }, x = parts(a), y = parts(b), scale = Math.max(x.f.length, y.f.length), value = (v: ReturnType<typeof parts>) => (v.negative ? -1n : 1n) * BigInt(v.w + v.f.padEnd(scale, '0')); const n = value(x) - value(y); return n < 0n ? -1 : n > 0n ? 1 : 0; }
export function termsMissing(t: ReturnTerms) {
    const m = Object.keys(termChoices).filter(k => !t[k as keyof ReturnTerms]).map(k => 'terms.' + k);
    for (const k of ['investment_payment', 'project_fee', 'project_tax', 'exit_receipt'])
        if (!t.cashflowMapping?.[k as keyof NonNullable<ReturnTerms['cashflowMapping']>])
            m.push('terms.cashflowMapping.' + k);
    for (const k of ['irrDecimals', 'amountDecimals', 'moicDecimals', 'tolerance', 'explanation'])
        if (t[k as keyof ReturnTerms] === undefined || t[k as keyof ReturnTerms] === '')
            m.push('terms.' + k);
    if (t.measure === 'realized' && t.moicNumerator && t.moicNumerator !== 'distributions_only' || t.measure === 'total' && t.moicNumerator && t.moicNumerator !== 'distributions_plus_terminal' || t.terminalPolicy === 'not_applicable_with_evidence' && (t.measure !== 'realized' || t.moicNumerator !== 'distributions_only'))
        m.push('terms.inconsistent_terminal_policy');
    if (t.lowerRateBound !== undefined && compareDecimal(t.lowerRateBound, '-1') <= 0)
        m.push('terms.lowerRateBound_above_minus_one');
    if (t.upperRateBound !== undefined && t.lowerRateBound !== undefined && compareDecimal(t.upperRateBound, t.lowerRateBound) <= 0)
        m.push('terms.invalid_rate_bounds');
    if (t.tolerance !== undefined && compareDecimal(t.tolerance, '0') <= 0)
        m.push('terms.positive_tolerance_required');
    return m;
}
export function isoTime(v: unknown) {
    const s = string(v, true, 35);
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(s) || !Number.isFinite(Date.parse(s)))
        fail('invalid_known_at');
    date(s.slice(0, 10));
    if (s.slice(11, 19) >= '24:00:00' || Number(s.slice(14, 16)) > 59 || Number(s.slice(17, 19)) > 59)
        fail('invalid_known_at');
    return new Date(s).toISOString();
}
export function allowsNoTerminalValue(b?: BasisVersion) { return b?.status === 'approved' && recordHash(b) === b.contentHash && b.terms.measure === 'realized' && b.terms.terminalPolicy === 'not_applicable_with_evidence' && b.terms.moicNumerator === 'distributions_only'; }
export function terminalValueMissing(b: BasisVersion | undefined, value: ReturnTerminalValue | null, asOfDate: string | undefined) {
    const missing: string[] = [];
    if (value === null)
        return allowsNoTerminalValue(b) ? missing : ['missing_valuation'];
    if (!value.evidence?.length)
        missing.push('terminal_evidence');
    if (value.date !== asOfDate)
        missing.push('terminal_evidence_date');
    if (value.currency !== 'CNY')
        missing.push('terminal_currency');
    if (typeof value.scope !== 'string' || !value.scope.trim())
        missing.push('terminal_scope');
    if (typeof value.amount !== 'string' || !/^(0|[1-9]\d{0,17})(\.\d{1,2})?$/.test(value.amount))
        missing.push('terminal_invalid_amount');
    else if (b?.terms.terminalPolicy === 'explicit_zero_with_evidence' && compareDecimal(value.amount, '0') !== 0)
        missing.push('terminal_policy_requires_zero');
    return missing;
}
export function sampleMissing(v: IndependentSample, b?: BasisVersion) {
    const m: string[] = [];
    if (!b || b.id !== v.basisId || b.version !== v.basisVersion || b.contentHash !== v.basisContentHash)
        m.push('basis_version_mismatch');
    if (!v.cashflows.length)
        m.push('sample.cashflows');
    if (!v.asOfDate)
        m.push('sample.asOfDate');
    if (v.cashflows.some(c => v.asOfDate && c.date > v.asOfDate))
        m.push('sample.cashflow_after_as_of');
    if (!v.derivationText.trim())
        m.push('sample.independent_derivation');
    if (!v.evidence.length)
        m.push('evidence');
    if (!v.expected.resultStatus || !v.expected.tolerance || compareDecimal(v.expected.tolerance, '0') <= 0)
        m.push('sample.expected');
    if (!['ok', 'no_root', 'multiple_roots', 'same_day', 'negative_root', 'missing_valuation', 'not_applicable'].includes(v.expected.resultStatus))
        m.push('sample.expected_status');
    if (v.expected.resultStatus === 'ok' && (v.expected.irr === null || v.expected.moic === null))
        m.push('sample.expected_values');
    if (v.expected.resultStatus !== 'ok' && v.expected.irr !== null)
        m.push('sample.expected_status_value_mismatch');
    if (v.expected.irr !== null && compareDecimal(v.expected.irr, '-1') <= 0)
        m.push('sample.invalid_irr');
    m.push(...terminalValueMissing(b, v.terminalValue, v.asOfDate).map(reason => reason === 'missing_valuation' ? 'sample.terminal_value' : reason));
    return m;
}
export function coverageMissing(v: CashflowReview) { return coverageKeys.filter(k => !v.coverage[k] || v.coverage[k]!.status === 'unknown' || !v.coverage[k]!.explanation.trim() || !v.coverage[k]!.evidence.length).map(k => 'coverage.' + k); }
