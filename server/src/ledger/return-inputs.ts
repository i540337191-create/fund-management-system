import { canonicalHash, isoTime, type ReturnScope } from './return-basis.ts';
import { units, fixed } from './exit-settlement.ts';
import { date, type WorkflowState, type MaterialSnapshot } from './workflow.ts';
export type ReturnInputRow = {
    sourceType: 'investment_cashflow' | 'exit_payment';
    sourceId: string;
    date: string;
    amount: string | null;
    amountMinor: string | null;
    direction: 'outflow' | 'inflow';
    kind: string;
    currency: 'CNY' | 'unknown';
    recordedAt: string;
    included: boolean;
    reasonCodes: string[];
    evidence: MaterialSnapshot[];
    reversal?: {
        time: string;
        reason: string;
        evidence: MaterialSnapshot[];
    };
    sourceVersionHash: string;
};
export function returnInputs(s: Pick<WorkflowState, 'postInvestment'>, scope: ReturnScope, asOfDate: string, knownAt: string) {
    const p = s.postInvestment, executions = new Map((p?.exitExecutions ?? []).map(v => [v.id, v])), rows: ReturnInputRow[] = [], missing = new Set<string>();
    const facts = [...(p?.investmentCashflows ?? []).filter(v => v.dealId === scope.dealId && v.fundId === scope.fundId).map(v => ({ v, sourceType: 'investment_cashflow' as const, kind: v.kind, currency: v.currency as 'CNY' | 'unknown', direction: 'outflow' as const })), ...(p?.exitPayments ?? []).filter(v => executions.get(v.executionId)?.dealId === scope.dealId && v.fundId === scope.fundId).map(v => ({ v, sourceType: 'exit_payment' as const, kind: 'exit_receipt', currency: 'unknown' as const, direction: 'inflow' as const }))];
    for (const { v, sourceType, kind, currency, direction } of facts) {
        const reasons: string[] = [];
        let time: string | undefined, reverseTime: string | undefined;
        try {
            time = isoTime(v.time);
        }
        catch {
            reasons.push('history_incomplete');
        }
        const future = !!time && time > knownAt;
        if (!future) {
            if (v.projectId !== scope.projectId)
                reasons.push('history_incomplete');
            try {
                date(v.date);
            }
            catch {
                reasons.push('history_incomplete');
            }
            if (!['posted', 'reversed'].includes(v.status) || v.status === 'posted' && v.reversal)
                reasons.push('history_incomplete');
            if (v.status === 'reversed') {
                try {
                    reverseTime = isoTime(v.reversal?.time);
                    if (time && reverseTime < time)
                        reasons.push('history_incomplete');
                }
                catch {
                    reasons.push('history_incomplete');
                }
            }
        }
        if (v.date > asOfDate)
            reasons.push('after_as_of');
        if (future)
            reasons.push('not_known_at');
        const historicalReversal = !future && reverseTime && reverseTime <= knownAt ? v.reversal : undefined;
        if (historicalReversal)
            reasons.push('registration_corrected');
        let amount: string | null = null, minor: string | null = null;
        try {
            const value = units(v.amount);
            if (value <= 0n)
                throw new Error('invalid source amount');
            minor = value.toString();
            amount = fixed(value);
        }
        catch {
            if (!future)
                reasons.push('invalid_source_amount');
        }
        if (!future)
            for (const reason of reasons)
                if (['history_incomplete', 'invalid_source_amount'].includes(reason))
                    missing.add(reason);
        const included = !reasons.length;
        if (included && !v.evidence.length)
            missing.add('missing_source_evidence');
        if (included && currency === 'unknown')
            missing.add('unknown_currency');
        // The historical hash only contains facts known at this cutoff. Registration corrections are not bank refunds.
        const historicalFacts = { sourceType, sourceId: v.id, projectId: v.projectId, executionId: 'executionId' in v ? v.executionId : undefined, dealId: scope.dealId, fundId: v.fundId, date: v.date, amount, rawAmount: amount === null ? v.amount : undefined, kind, currency, direction, time: v.time, status: historicalReversal ? 'reversed' : 'posted', evidence: future ? [] : v.evidence, reversal: historicalReversal ? { time: historicalReversal.time, reason: historicalReversal.reason, evidence: historicalReversal.evidence } : undefined };
        rows.push({ sourceType, sourceId: v.id, date: v.date, amount, amountMinor: minor, direction, kind, currency, recordedAt: v.time, included, reasonCodes: included ? ['candidate_actual_bank_cashflow'] : [...new Set(reasons)], evidence: future ? [] : v.evidence, reversal: historicalReversal ? { time: historicalReversal.time, reason: historicalReversal.reason, evidence: historicalReversal.evidence } : undefined, sourceVersionHash: canonicalHash(historicalFacts) });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.sourceType.localeCompare(b.sourceType) || a.sourceId.localeCompare(b.sourceId));
    if (!rows.some(v => v.included && v.kind === 'investment_payment'))
        missing.add('missing_actual_investment_payments');
    if (!rows.some(v => v.included && v.kind === 'exit_receipt'))
        missing.add('missing_actual_receipts');
    for (const k of ['outflows', 'inflows', 'fees', 'taxes', 'currency', 'terminalValue'])
        missing.add('unreviewed_' + k);
    return { scope, asOfDate, knownAt, rows, sourceHash: canonicalHash({ scope, asOfDate, knownAt, rows: rows.filter(v => !v.reasonCodes.includes('not_known_at')).map(v => ({ sourceId: v.sourceId, sourceType: v.sourceType, sourceVersionHash: v.sourceVersionHash, included: v.included, reasonCodes: v.reasonCodes })) }), missingReasons: [...missing], coverageStatus: 'unreviewed' as string };
}
