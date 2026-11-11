import { hiddenSource, sourceOf, confirmedSource } from './source-policy.ts';
import type { SourceRecord } from './source-policy.ts';
import type { SessionUser } from '../auth/session.ts';
import { fail, string, type MaterialSnapshot, type WorkflowState } from './workflow.ts';
import { shanghaiDay } from './post-investment.ts';
export type ExitHistory = {
    actor: SessionUser;
    time: string;
    reason: string;
    evidence: MaterialSnapshot[];
};
export type ExitExecution = SourceRecord & {
    id: string;
    projectId: string;
    dealId: string;
    planId: string;
    planVersion: number;
    title: string;
    date: string;
    actor: SessionUser;
    time: string;
    note: string;
    allocations: {
        fundId: string;
        portion: string;
        consideration: string;
    }[];
    signedAgreement: MaterialSnapshot;
    evidence: MaterialSnapshot[];
    status: 'recorded' | 'cancelled';
    cancellation?: ExitHistory;
};
export type ExitPayment = SourceRecord & {
    currency?: 'CNY';
    id: string;
    projectId: string;
    executionId: string;
    fundId: string;
    date: string;
    amount: string;
    principal: string;
    income: string;
    bankAccount: string;
    bankReference: string;
    actor: SessionUser;
    time: string;
    note: string;
    evidence: MaterialSnapshot[];
    status: 'posted' | 'reversed';
    reversal?: ExitHistory;
};
export function fixed(v: bigint, scale = 2) { const b = 10n ** BigInt(scale); return `${v / b}.${String(v % b).padStart(scale, '0')}`; }
export function units(v: unknown, scale = 2) { const s = string(v, true, 30); if (!new RegExp(`^(0|[1-9]\\d{0,17})(\\.\\d{1,${scale}})?$`).test(s))
    fail('invalid_decimal'); const [w, f = ''] = s.split('.'); return BigInt(w) * 10n ** BigInt(scale) + BigInt(f.padEnd(scale, '0')); }
export const bankIdentity = (v: unknown) => string(v, true, 300).replace(/\s/g, '').toUpperCase();
export function closingDay(value: string) { if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return value; if (!Number.isFinite(Date.parse(value)))
    fail('closed_date_invalid', 409); return shanghaiDay(new Date(value)); }
export function settlementPositions(s: Pick<WorkflowState, 'project' | 'deals' | 'postInvestment'>) {
    const p = s.postInvestment, executions = (p?.exitExecutions ?? []).filter(v => v.status === 'recorded'), payments = (p?.exitPayments ?? []).filter(v => v.status === 'posted');
    return (s.deals ?? []).filter(d => d.status === 'closed' && d.closing).flatMap(d => { const terms = d.terms.find(t => t.id === d.closing!.termsId); return (terms?.allocations ?? []).map(a => { let disposed = 0n, contracted = 0n, received = 0n; for (const e of executions.filter(e => e.dealId === d.id)) {
        for (const x of e.allocations.filter(x => x.fundId === a.fundId)) {
            disposed += units(x.portion, 4);
            contracted += units(x.consideration);
        }
        received += payments.filter(v => v.executionId === e.id && v.fundId === a.fundId).reduce((n, v) => n + units(v.amount), 0n);
    } return { projectId: s.project.id, dealId: d.id, fundId: a.fundId, disposedPortion: fixed(disposed, 4), remainingPortion: fixed(1000000n - disposed, 4), contracted: fixed(contracted), received: fixed(received), outstanding: fixed(contracted - received) }; }); });
}
export function settlementEvidence(p: {
    exitExecutions?: ExitExecution[];
    exitPayments?: ExitPayment[];
}) { return [...(p.exitExecutions ?? []).flatMap(e => [e.signedAgreement, ...e.evidence, ...e.cancellation?.evidence ?? []]), ...(p.exitPayments ?? []).flatMap(v => [...v.evidence, ...v.reversal?.evidence ?? []])]; }

export function sourceSettlementPositions(s: Pick<WorkflowState, 'project'|'deals'|'postInvestment'>, includeDemo: boolean): (Omit<ReturnType<typeof settlementPositions>[number],'remainingPortion'|'outstanding'> & {remainingPortion:string|null;outstanding:string|null;sourceIssue?:string})[] {
 if(includeDemo)return settlementPositions(s);
 const p=s.postInvestment,executions=p?.exitExecutions??[],payments=p?.exitPayments??[];
 return (s.deals??[]).filter(d=>d.status==='closed'&&d.closing).flatMap(d=>{
  const terms=d.terms.find(t=>t.id===d.closing!.termsId);
  return (terms?.allocations??[]).flatMap(a=>{
   const related=executions.filter(e=>e.dealId===d.id&&e.allocations.some(x=>x.fundId===a.fundId));
   const paid=payments.filter(v=>v.fundId===a.fundId&&related.some(e=>e.id===v.executionId));
   if(hiddenSource(d)&&hiddenSource(terms!)&&![...related,...paid].some(v=>!hiddenSource(v)))return [];
   const active=related.filter(e=>e.status==='recorded'),valid=active.filter(confirmedSource);
   let disposed=0n,contracted=0n,received=0n;
   for(const e of valid)for(const x of e.allocations.filter(x=>x.fundId===a.fundId)){disposed+=units(x.portion,4);contracted+=units(x.consideration);}
   for(const v of paid)if(v.status==='posted'&&v.currency==='CNY'&&confirmedSource(v)&&active.some(e=>e.id===v.executionId))received+=units(v.amount);
   const unverified=active.some(e=>!confirmedSource(e))||!terms||!confirmedSource(terms)||paid.some(v=>v.status==='posted'&&(!confirmedSource(v)||v.currency!=='CNY'));
   return [{projectId:s.project.id,dealId:d.id,fundId:a.fundId,disposedPortion:fixed(disposed,4),remainingPortion:unverified?null:fixed(1000000n-disposed,4),contracted:fixed(contracted),received:fixed(received),outstanding:unverified?null:fixed(contracted-received),...(unverified?{sourceIssue:'unverified_source_amounts_excluded'}:{})}];
  });
 });
}
