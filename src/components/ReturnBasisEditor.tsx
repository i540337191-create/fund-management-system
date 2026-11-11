import {confirmAction} from './SystemConfirmation';
import {NoticeHelp} from './NoticeHelp';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createApiClient, type ApiMaterialVersion } from '../lib/apiClient';
import type { DealMaterialRef } from '../lib/dealTypes';
import { exitSettlementError, type ExitProof } from '../lib/exitSettlementTypes';
import { coverageKeys, type BasisVersion, type CashflowReview, type CoverageKey, type IndependentSample, type ReturnAction, type ReturnKind, type ReturnRecordView, type ReturnTerms, type ReturnView, type ReviewDraft, type SampleDraft, type termChoices } from '../lib/returnBasisTypes';
import { cashflowKindLabels, coverageLabels, knownAtLocal, returnChoiceLabels, returnKindLabels, returnReason, returnStatusLabels, returnTermLabels } from '../lib/returnBasisView';
import { WorkflowDialog } from './MaterialFileDialogs';
export type ReturnEditorRecordView = ReturnRecordView<BasisVersion> | ReturnRecordView<IndependentSample> | ReturnRecordView<CashflowReview>;
export type ReturnEditorProps = {
    edit: {
        mode: 'write' | 'submit' | 'decide';
        kind: ReturnKind;
        record?: ReturnEditorRecordView;
    };
    view: ReturnView;
    query: {
        dealId: string;
        fundId: string;
        asOfDate: string;
        knownAt: string;
    };
    files: {
        key: string;
        version: ApiMaterialVersion;
    }[];
    onClose: () => void;
    onSaved: () => Promise<void>;
};
type WithoutRequest<T> = T extends unknown ? Omit<T, 'requestId'> : never;
type ActionBody = WithoutRequest<ReturnAction>;
type ProofChoice = ReturnEditorProps['files'][number];
type TerminalState = {
    enabled: boolean;
    amount: string;
    date: string;
    currency: string;
    scope: string;
    proofs: string[];
    reuse: boolean;
};
type CoverageState = {
    status: string;
    explanation: string;
    proofs: string[];
    reuse: boolean;
};
type FlowState = {
    key: string;
    date: string;
    amount: string;
    direction: string;
    kind: string;
    currency: string;
};
type ConfirmationState = {
    confirmed: boolean;
    proofs: string[];
    reuse: boolean;
};
const api = createApiClient();
const button = 'min-h-10 rounded-md border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--hover)] disabled:opacity-50';
const field = 'mt-1 block min-h-10 w-full rounded-md border border-[var(--line)] bg-[var(--inset)] p-2 text-sm';
const box = 'rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4';
const allRecords = (v: ReturnView): ReturnEditorRecordView[] => [...v.bases, ...v.samples, ...v.reviews];
const kindOf = (v: ReturnEditorRecordView): ReturnKind => 'terms' in v ? 'basis' : 'basisId' in v ? 'sample' : 'review';
const sameScope = (v: ReturnEditorRecordView, q: ReturnEditorProps['query']) => v.scope.dealId === q.dealId && v.scope.fundId === q.fundId;
const identity = (v: ReturnEditorRecordView) => ({ recordId: v.id, version: v.version, contentHash: v.contentHash });
const keyOf = (ref: {
    materialId: string;
    versionId?: string | null;
}) => JSON.stringify({ materialId: ref.materialId, versionId: ref.versionId });
const availableProofs = (proofs: ExitProof[], files: ProofChoice[]) => proofs.filter(p => !p.readIssue && p.downloadHref && files.some(f => f.key === keyOf(p) && f.version.sha256 === p.sha256 && !f.version.historical)).map(keyOf);
const nestedProofs = (r?: ReturnEditorRecordView): ExitProof[] => !r ? [] : [...r.evidence, ...('terminalValue' in r ? r.terminalValue?.evidence ?? [] : []), ...('coverage' in r ? [...Object.values(r.coverage).flatMap(c => c?.evidence ?? []), ...r.currencyConfirmations.flatMap(c => c.evidence)] : [])];
function failure(error: unknown) { const code = (error as {
    code?: string;
})?.code; const labels: Record<string, string> = { return_sample_calculation_mismatch: '人工独立期望值与当前收益口径复算不一致，请核对样例金额、日期、终值及容差。', incomplete_return_record: '依据仍不完整。请核对原件、规则、独立推导和逐项完整性说明。', return_review_already_exists: '此范围及双时点已有核验记录。请读取最新版本后明确改为修订。', return_basis_already_exists: '此范围已有收益口径。请读取最新版本后明确改为修订。', return_source_conflict: '来源现金流已变化。请读取最新留存记录并重新核对，输入仍保留。', return_version_conflict: '所选版本已变化。请读取最新版本并核对，输入仍保留。', return_review_cutoffs_immutable: '修订核验不能改变原经济截止日或系统已知时点。', return_authorization_evidence_required: '通过审核须选择授权依据原件并填写意见。', ineligible_return_reviewer: '审核人已失效或不具备当前财务审核资格。', return_self_review_forbidden: '作者不能自审；具备本资源财务权限的项目负责人可依既定规则独立放行。' }; return code && labels[code] || exitSettlementError(error); }
function Proofs({ title, files, value, onChange, reuse, onReuse,projectId }: {
    projectId?:string;
    title: string;
    files: ProofChoice[];
    value: string[];
    onChange: (v: string[]) => void;
    reuse?: boolean;
    onReuse?: (v: boolean) => void;
}) { return <fieldset className="space-y-2"><legend className="text-sm font-medium">{title}</legend>{onReuse ? <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(reuse)} onChange={e => onReuse(e.target.checked)}/>本项明确复用下方选择的“本次依据原件”</label> : null}<div className="max-h-48 overflow-y-auto rounded-md border border-[var(--line)] p-2">{files.length ? files.map(f => <label key={f.key} className="flex min-h-10 items-start gap-2 py-2 text-sm"><input type="checkbox" className="mt-1" checked={value.includes(f.key)} onChange={e => onChange(e.target.checked ? [...value, f.key] : value.filter(k => k !== f.key))}/><span className="min-w-0 break-words">{f.version.name} · V{f.version.version}<span className="block text-xs text-[var(--secondary)]">原件校验标识 </span></span></label>) : <p className="text-sm text-[var(--secondary)]">当前没有可选原件。可保存允许缺项的草稿。<NoticeHelp message="送审前需上传关联原件" projectId={projectId}/></p>}</div></fieldset>; }
function ReadProofs({ proofs }: {
    proofs: ExitProof[];
}) { return proofs.length ? <ul className="space-y-1">{proofs.map((p, i) => <li key={`${p.materialId}-${p.versionId}-${i}`} className="break-words text-sm">{p.readIssue || !p.downloadHref ? <span>原件受限或校验失败 · {p.name}</span> : <a className="text-gold underline" href={p.downloadHref} target="_blank" rel="noreferrer">{p.name}</a>}</li>)}</ul> : <p className="text-sm text-[var(--secondary)]">未附原件</p>; }
function Section({ title, children }: {
    title: string;
    children: ReactNode;
}) { return <fieldset className={`${box} space-y-4`}><legend className="px-1 text-sm font-semibold">{title}</legend>{children}</fieldset>; }
function Facts({ record }: {
    record: ReturnEditorRecordView;
}) { return <details className={box}><summary className="cursor-pointer text-sm font-medium">{returnKindLabels[kindOf(record)]} V{record.version} · {returnStatusLabels[record.status]} · {record.latest ? '当前版本' : '历史留存'}</summary><div className="mt-3 space-y-3 text-sm"><p>{record.author.name} · {knownAtLocal(record.createdAt).replace('T', ' ')}</p>{record.missingReasons.length ? <ul className="list-inside list-disc">{record.missingReasons.map(r => <li key={r}>{returnReason(r)}</li>)}</ul> : null}{'terms' in record ? <dl className="space-y-2">{Object.entries(record.terms).map(([k, v]) => <div key={k}><dt className="text-[var(--secondary)]">{returnTermLabels[k as keyof typeof returnTermLabels] ?? ({ explanation: '规则来源与限制', tolerance: '校验容差', cashflowMapping: '现金流类别映射', irrDecimals: 'IRR小数位', amountDecimals: '金额小数位', moicDecimals: 'MOIC小数位' } as Record<string, string>)[k] ?? k}</dt><dd className="whitespace-pre-wrap">{k === 'cashflowMapping' && v && typeof v === 'object' ? Object.entries(v).map(([kind, d]) => `${cashflowKindLabels[kind as keyof typeof cashflowKindLabels] ?? kind}：${d === 'outflow' ? '支出' : d === 'inflow' ? '实收' : '披露后排除'}`).join('；') : returnChoiceLabels[String(v)] ?? String(v)}</dd></div>)}</dl> : 'basisId' in record ? <><p>绑定口径V{record.basisVersion} · {record.origin === 'finance_independent' ? '人工独立财务来源' : '工程自造来源'}</p><p>预期IRR（年化比例）{record.expected.irr ?? '未提供'} · MOIC {record.expected.moic ?? '未提供'} · 容差 {record.expected.tolerance || '未提供'}</p><p className="whitespace-pre-wrap">{record.derivationText || '尚无人工推导'}</p><ul>{record.cashflows.map((row, i) => <li key={i}>{row.date} · {row.direction === 'outflow' ? '支出' : '实收'} {row.amount} CNY · {cashflowKindLabels[row.kind as keyof typeof cashflowKindLabels] ?? row.kind}</li>)}</ul><p>样例终值：{record.terminalValue?.amount ?? '未提供'} · 截止日 {record.asOfDate || '未提供'}</p></> : <><p>经济截止日 {record.asOfDate} · 系统已知时点 {knownAtLocal(record.knownAt).replace('T', ' ')}</p>{coverageKeys.map(key => <div key={key}><p>{coverageLabels[key]} · {record.coverage[key]?.status === 'confirmed_complete' ? '已核齐' : record.coverage[key]?.status === 'confirmed_not_applicable' ? '有凭证不适用' : '未知'}</p><p className="whitespace-pre-wrap">{record.coverage[key]?.explanation || '未填写说明'}</p><ReadProofs proofs={record.coverage[key]?.evidence ?? []}/></div>)}<p>实际终值：{record.terminalValue?.amount ?? '未提供，不按零处理'}</p>{record.currencyConfirmations.map(c => <div key={c.sourceId}><p>来源  · 人民币确认</p><ReadProofs proofs={c.evidence}/></div>)}</>}<ReadProofs proofs={record.evidence}/>{'terminalValue' in record && record.terminalValue ? <ReadProofs proofs={record.terminalValue.evidence}/> : null}{record.decisions.map((d, i) => <div key={i}><p>{d.actor.name} · {{ approve: '通过', return: '退回', reject: '否决' }[d.decision]} · {d.opinion}</p><ReadProofs proofs={d.authorizationEvidence}/></div>)}<p className="break-all text-xs text-[var(--secondary)]"></p></div></details>; }
export function ReturnEditor({ edit, view, query, files, onClose, onSaved }: ReturnEditorProps) {
    const original = edit.record, basisRecord = original && 'terms' in original ? original : undefined, sampleRecord = original && 'basisId' in original ? original : undefined, reviewRecord = original && 'coverage' in original ? original : undefined;
    const [current, setCurrent] = useState(view), [source, setSource] = useState(original), [revision, setRevision] = useState(view.revision), [fresh, setFresh] = useState<ReturnView | null>(null), [conflict, setConflict] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [committed, setCommitted] = useState(false);
    const [terms, setTerms] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(basisRecord?.terms ?? {}).filter(([k]) => k !== 'cashflowMapping').map(([k, v]) => [k, String(v)])));
    const [mapping, setMapping] = useState<Record<string, string>>({ ...basisRecord?.terms.cashflowMapping });
    const [evidence, setEvidence] = useState(() => availableProofs(original?.evidence ?? [], files)), [revisionReason, setRevisionReason] = useState('');
    const [basisId, setBasisId] = useState(sampleRecord?.basisId ?? ''), [origin, setOrigin] = useState<string>(sampleRecord?.origin ?? ''), [flows, setFlows] = useState<FlowState[]>(() => sampleRecord?.cashflows.map(row => ({ ...row, key: crypto.randomUUID() })) ?? []), [sampleDate, setSampleDate] = useState(sampleRecord?.asOfDate ?? ''), [derivation, setDerivation] = useState(sampleRecord?.derivationText ?? '');
    const [expected, setExpected] = useState({ irr: sampleRecord?.expected.irr ?? '', moic: sampleRecord?.expected.moic ?? '', resultStatus: sampleRecord?.expected.resultStatus ?? '', tolerance: sampleRecord?.expected.tolerance ?? '' });
    const initialTerminal = sampleRecord?.terminalValue ?? reviewRecord?.terminalValue;
    const [terminal, setTerminal] = useState<TerminalState>(() => ({ enabled: Boolean(initialTerminal), amount: initialTerminal?.amount ?? '', date: initialTerminal?.date ?? (edit.kind === 'review' ? query.asOfDate : ''), currency: initialTerminal?.currency ?? '', scope: initialTerminal?.scope ?? '', proofs: availableProofs(initialTerminal?.evidence ?? [], files), reuse: false }));
    const [coverage, setCoverage] = useState<Record<CoverageKey, CoverageState>>(() => Object.fromEntries(coverageKeys.map(k => [k, { status: reviewRecord?.coverage[k]?.status ?? 'unknown', explanation: reviewRecord?.coverage[k]?.explanation ?? '', proofs: availableProofs(reviewRecord?.coverage[k]?.evidence ?? [], files), reuse: false }])) as Record<CoverageKey, CoverageState>);
    const [confirmations, setConfirmations] = useState<Record<string, ConfirmationState>>(() => Object.fromEntries((reviewRecord?.currencyConfirmations ?? []).map(c => [c.sourceId, { confirmed: true, proofs: availableProofs(c.evidence, files), reuse: false }])));
    const [sourceHash, setSourceHash] = useState(view.inputs?.sourceHash ?? reviewRecord?.sourceHash ?? '');
    const [reviewerId, setReviewerId] = useState(''), [dueDate, setDueDate] = useState(''), [decision, setDecision] = useState(''), [opinion, setOpinion] = useState(''), [authorization, setAuthorization] = useState<string[]>([]);
    const dirty = useRef(false);
    const close = async () => { if (!busy && (!dirty.current || Boolean(committed) || await confirmAction('收益依据有未保存修改或保存结果待核对，是否关闭？'))) onClose(); };
    const active = useRef(true), working = useRef(false), pending = useRef<{
        fingerprint: string;
        payload: ReturnAction;
    } | null>(null);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const changed = () => { pending.current = null; setError(''); setNotice(''); };
    const updateTerm = (key: string, value: string) => { setTerms(v => ({ ...v, [key]: value })); changed(); };
    const termInput = (label: string, key: string, options?: {
        type?: string;
        multi?: boolean;
    }) => <label className="block text-sm">{label}{options?.multi ? <textarea rows={3} className={field} value={terms[key] ?? ''} onChange={e => updateTerm(key, e.target.value)}/> : <input className={field} type={options?.type ?? 'text'} inputMode={options?.type === 'number' ? 'numeric' : undefined} value={terms[key] ?? ''} onChange={e => updateTerm(key, e.target.value)}/>}</label>;
    const updateCoverage = (key: CoverageKey, patch: Partial<CoverageState>) => { setCoverage(v => ({ ...v, [key]: { ...v[key], ...patch } })); changed(); };
    const updateTerminal = (patch: Partial<TerminalState>) => { setTerminal(v => ({ ...v, ...patch })); changed(); };
    const updateConfirmation = (id: string, patch: Partial<ConfirmationState>) => { setConfirmations(v => ({ ...v, [id]: { ...(v[id] ?? { confirmed: false, proofs: [], reuse: false }), ...patch } })); changed(); };
    const updateFlow = (key: string, patch: Partial<FlowState>) => { setFlows(v => v.map(row => row.key === key ? { ...row, ...patch } : row)); changed(); };
    const selectedBasis = current.bases.find(b => b.id === basisId), scopeBases = current.bases.filter(b => sameScope(b, query));
    const unknownRows = current.inputs?.rows.filter(row => row.included && row.currency === 'unknown' && row.sourceType === 'exit_payment') ?? [];
    const dropped = nestedProofs(original).filter(p => !availableProofs([p], files).length).length;
    const usableKeys = (keys: string[]) => [...new Set(keys)].filter(key => files.some(f => f.key === key && !f.version.historical));
    const refs = (keys: string[]): DealMaterialRef[] => { if (new Set(keys).size !== usableKeys(keys).length)
        throw Error('选中的原件已不在当前可用目录，请重新核对选择；本次未静默移除原件。'); return usableKeys(keys).map(key => { const parsed = JSON.parse(key) as DealMaterialRef; const file = files.find(f => f.key === key)!; if (parsed.materialId !== file.version.materialId || parsed.versionId !== file.version.id)
        throw Error('原件目录与选择不一致，请关闭后刷新原件。'); return { materialId: parsed.materialId, versionId: parsed.versionId }; }); };
    const itemProofs = (keys: string[], reuse: boolean) => refs([...keys, ...(reuse ? evidence : [])]);
    const terminalPayload = (): ReviewDraft['terminalValue'] => { if (!terminal.enabled)
        return null; if (!terminal.amount.trim() || !terminal.date || terminal.currency !== 'CNY' || !terminal.scope.trim())
        throw Error('填写终值时，请明确金额、日期、人民币币种及实际范围；未取得终值可取消填写，不会按零处理。'); return { amount: terminal.amount.trim(), date: terminal.date, currency: 'CNY', scope: terminal.scope.trim(), evidence: itemProofs(terminal.proofs, terminal.reuse) }; };
    const getPayload = (): ActionBody => {
        const base = { expectedRevision: revision };
        if (edit.mode === 'submit') {
            if (!source || !reviewerId || !dueDate)
                throw Error('请明确选择本版本审核人及审核截止日。');
            return { ...base, action: `submit_${edit.kind}`, ...identity(source), reviewerId, dueDate };
        }
        if (edit.mode === 'decide') {
            if (!source || !['approve', 'return', 'reject'].includes(decision) || !opinion.trim())
                throw Error('请明确审核决定并填写意见。');
            if (decision === 'approve' && !refs(authorization).length)
                throw Error('通过审核须选择实际授权依据及结论原件。');
            return { ...base, action: `decide_${edit.kind}`, ...identity(source!), decision: decision as 'approve' | 'return' | 'reject', opinion: opinion.trim(), authorizationEvidence: refs(authorization) };
        }
        const common = { ...base, evidence: refs(evidence), ...(source ? { ...identity(source), ...(revisionReason.trim() ? { revisionReason: revisionReason.trim() } : {}) } : { dealId: query.dealId, fundId: query.fundId }) };
        if (source?.status === 'rejected' && !revisionReason.trim())
            throw Error('否决后的修订须明确填写修订原因，原否决保留。');
        if (edit.kind === 'basis') {
            const parsed: ReturnTerms = {};
            for (const key of Object.keys(current.termChoices) as (keyof typeof termChoices)[])
                if (terms[key])
                    parsed[key] = terms[key];
            const kinds = Object.keys(cashflowKindLabels) as (keyof NonNullable<ReturnTerms['cashflowMapping']>)[];
            const mapped = Object.fromEntries(kinds.filter(k => mapping[k]).map(k => [k, mapping[k]]));
            if (Object.keys(mapped).length)
                parsed.cashflowMapping = mapped;
            for (const key of ['irrDecimals', 'amountDecimals', 'moicDecimals', 'maxIterations'] as const) {
                const value = terms[key]?.trim();
                if (value) {
                    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
                        throw Error('小数位和可选迭代次数须填写有效整数，未定可留空。');
                    parsed[key] = Number(value);
                }
            }
            for (const key of ['tolerance', 'lowerRateBound', 'upperRateBound', 'explanation'] as const)
                if (terms[key]?.trim())
                    parsed[key] = terms[key].trim();
            return { ...common, action: source ? 'revise_basis' : 'create_basis', terms: parsed } as ActionBody;
        }
        if (edit.kind === 'sample') {
            if (!selectedBasis || !sameScope(selectedBasis, query))
                throw Error('请选择本范围内要绑定的精确口径版本。');
            if (origin !== 'finance_independent' && origin !== 'engineering_fixture')
                throw Error('请明确选择人工独立财务来源或工程自造来源。');
            const cashflows = flows.map(row => { if (!row.date || !row.amount.trim() || !row.kind || !['inflow', 'outflow'].includes(row.direction) || row.currency !== 'CNY')
                throw Error('逐笔现金流须明确日期、金额、方向、类别和币种；空行可移除后保存草稿。'); return { date: row.date, amount: row.amount.trim(), direction: row.direction as 'inflow' | 'outflow', kind: row.kind, currency: 'CNY' as const }; });
            const sample: SampleDraft = { basisId: selectedBasis.id, basisVersion: selectedBasis.version, basisContentHash: selectedBasis.contentHash, origin, cashflows, ...(sampleDate ? { asOfDate: sampleDate } : {}), terminalValue: terminalPayload(), expected: { irr: expected.irr.trim() || null, irrUnit: 'annual_fraction', moic: expected.moic.trim() || null, resultStatus: expected.resultStatus, tolerance: expected.tolerance.trim() }, derivationText: derivation };
            // The API permits an incomplete draft; omit empty tolerance so it remains a missing fact rather than an invalid decimal.
            const draftSample = { ...sample, expected: { ...sample.expected, ...(!sample.expected.tolerance ? { tolerance: undefined } : {}) } };
            return { ...common, action: source ? 'revise_sample' : 'create_sample', sample: draftSample } as ActionBody;
        }
        if (!current.inputs || current.inputs.scope.dealId !== query.dealId || current.inputs.scope.fundId !== query.fundId || current.inputs.asOfDate !== query.asOfDate || current.inputs.knownAt !== new Date(query.knownAt).toISOString() || !sourceHash)
            throw Error('请先读取此范围及双时点的完整来源输入。');
        const review: ReviewDraft = { asOfDate: query.asOfDate, knownAt: query.knownAt, sourceHash, coverage: Object.fromEntries(coverageKeys.map(k => [k, { status: coverage[k].status as 'unknown' | 'confirmed_complete' | 'confirmed_not_applicable', explanation: coverage[k].explanation, evidence: itemProofs(coverage[k].proofs, coverage[k].reuse) }])), currencyConfirmations: unknownRows.filter(row => confirmations[row.sourceId]?.confirmed).map(row => ({ sourceId: row.sourceId, currency: 'CNY', evidence: itemProofs(confirmations[row.sourceId].proofs, confirmations[row.sourceId].reuse) })), terminalValue: terminalPayload() };
        return { ...common, action: source ? 'revise_review' : 'create_review', review } as ActionBody;
    };
    const refreshConflict = async () => { if (working.current)
        return; working.current = true; setBusy(true); try {
        const next = await api.getReturnBasis(view.project.id, query);
        if (active.current) {
            setFresh(next);
            setError('已读取最新完整版本；本次输入保留，请核对下方资料并明确采纳。');
        }
    }
    catch (e) {
        if (active.current)
            setError(failure(e) + ' 最新版本读取未完成，请重试读取。');
    }
    finally {
        working.current = false;
        if (active.current)
            setBusy(false);
    } };
    const freshExact = source && fresh ? allRecords(fresh).find(r => r.id === source.id && r.version === source.version && r.contentHash === source.contentHash) : undefined;
    const freshCandidate = fresh && edit.mode === 'write' ? (source ? allRecords(fresh).find(r => kindOf(r) === edit.kind && r.groupId === source.groupId && r.latest) : edit.kind === 'basis' ? fresh.bases.find(r => sameScope(r, query) && r.latest) : edit.kind === 'review' ? fresh.reviews.find(r => sameScope(r, query) && r.asOfDate === query.asOfDate && r.knownAt === new Date(query.knownAt).toISOString() && r.latest) : undefined) : undefined;
    const exactCanContinue = Boolean(freshExact?.latest && (edit.mode === 'submit' ? freshExact.status === 'draft' : freshExact?.status === 'pending'));
    const mayAdopt = Boolean(fresh && (edit.mode === 'write' ? (!source || freshCandidate) && (!freshCandidate || freshCandidate.author.id === fresh.currentUser.id || fresh.project.ownerId === fresh.currentUser.id) : exactCanContinue));
    const adopt = () => { if (!fresh || !mayAdopt)
        return; setRevision(fresh.revision); setCurrent(fresh); if (edit.mode === 'write') {
        if (freshCandidate)
            setSource(freshCandidate);
        if (edit.kind === 'review')
            setSourceHash(fresh.inputs?.sourceHash ?? '');
    } setFresh(null); setConflict(false); changed(); setNotice(edit.mode === 'write' ? '已明确采用最新账本修订及来源身份；填写内容保留，请重新核对后保存新版本。' : '已明确采用最新账本修订；被送审或审核的版本身份保持原样。'); };
    const save = async () => { if (working.current || conflict)
        return; let attempted = false; working.current = true; setBusy(true); setError(''); try {
        if (!committed) {
            const payload = getPayload(), fingerprint = JSON.stringify(payload);
            if (!pending.current || pending.current.fingerprint !== fingerprint)
                pending.current = { fingerprint, payload: { ...payload, requestId: crypto.randomUUID() } as ReturnAction };
            attempted = true;
            await api.actOnReturnBasis(view.project.id, pending.current.payload);
            if (!active.current)
                return;
            setCommitted(true);
        }
        try {
            await onSaved();
        }
        catch {
            if (active.current) {
                setCommitted(true);
                setError('本次操作已确认保存，来源刷新未完成。请重试完成刷新；不会重新提交办理。');
            }
        }
    }
    catch (e) {
        if (active.current) {
            setError(!attempted && e instanceof Error ? e.message : failure(e));
            if ((e as {
                status?: number;
            }).status === 409) {
                setConflict(true);
                try {
                    const next = await api.getReturnBasis(view.project.id, query);
                    if (active.current)
                        setFresh(next);
                }
                catch {
                    if (active.current)
                        setNotice('最新版本读取失败，表单仍保留。请重试读取后核对。');
                }
            }
        }
    }
    finally {
        working.current = false;
        if (active.current)
            setBusy(false);
    } };
    const terminalEditor = <Section title={edit.kind === 'sample' ? '样例终值（独立输入）' : '本范围实际终值'}><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={terminal.enabled} onChange={e => updateTerminal({ enabled: e.target.checked })}/>我已取得明确终值，填写金额、范围和原件</label><p className="text-sm text-[var(--secondary)]">未填写表示尚未提供，不按0处理。零终值也须明确填写0并附原件；部分或全部退出均不自动推导残值。</p>{terminal.enabled ? <><div className="grid gap-3 md:grid-cols-2"><label className="text-sm">终值金额（元，允许明确0）<input className={field} inputMode="decimal" value={terminal.amount} onChange={e => updateTerminal({ amount: e.target.value })}/></label><label className="text-sm">终值日期<input className={field} type="date" value={terminal.date} onChange={e => updateTerminal({ date: e.target.value })}/></label><label className="text-sm">终值币种<select className={field} value={terminal.currency} onChange={e => updateTerminal({ currency: e.target.value })}><option value="">请选择原币种</option><option value="CNY">人民币 CNY</option></select></label><label className="text-sm">终值对应的实际持仓范围<input className={field} value={terminal.scope} onChange={e => updateTerminal({ scope: e.target.value })}/></label></div><Proofs projectId={view.project.id} title="终值原件版本" files={files} value={terminal.proofs} onChange={proofs => updateTerminal({ proofs })} reuse={terminal.reuse} onReuse={reuse => updateTerminal({ reuse })}/></> : null}</Section>;
    return <WorkflowDialog title={`${edit.mode === 'write' ? (source ? '修订' : '登记') : edit.mode === 'submit' ? '送审' : '审核'}${returnKindLabels[edit.kind]}`} busy={busy} onClose={close}><form onChangeCapture={() => { dirty.current = true; }} className="space-y-5" onSubmit={e => { e.preventDefault(); void save(); }}><p className="text-sm text-[var(--secondary)]">{view.project.name} · 交易  · 基金 。核对并保存本次收益依据及审核记录。</p>{source ? <p className="break-all text-xs text-[var(--secondary)]">本次来源 V{source.version}</p> : null}{dropped && edit.mode === 'write' ? <p role="status" className={box}>旧版本有 {dropped} 份引用当前不可用或不可读，未夹带进本次修订。旧档案仍保留，请重新选择可用原件。</p> : null}<fieldset disabled={busy || committed} className="min-w-0 space-y-5">{edit.mode === 'write' ? <>{source ? <label className="block text-sm">修订原因{source.status === 'rejected' ? '（否决后必填）' : '（按需填写）'}<textarea className={field} rows={3} value={revisionReason} onChange={e => { setRevisionReason(e.target.value); changed(); }}/></label> : null}{edit.kind === 'basis' ? <><Section title="指标定义与日期政策"><div className="grid gap-3 md:grid-cols-2">{(Object.keys(current.termChoices) as (keyof typeof termChoices)[]).map(key => <label key={key} className="text-sm">{returnTermLabels[key]}<select className={field} value={terms[key] ?? ''} onChange={e => updateTerm(key, e.target.value)}><option value="">未明确，保留缺项</option>{current.termChoices[key].map(choice => <option key={choice} value={choice}>{returnChoiceLabels[choice] ?? choice}</option>)}</select></label>)}</div><p className="text-sm text-[var(--secondary)]">以上选择均须按真实依据明确；页面不会自动采用365日、零费用或零残值。</p></Section><Section title="现金流类别与金额规则"><div className="grid gap-3 md:grid-cols-2">{Object.entries(cashflowKindLabels).map(([kind, label]) => <label key={kind} className="text-sm">{label}的纳入方向<select className={field} value={mapping[kind] ?? ''} onChange={e => { setMapping(v => ({ ...v, [kind]: e.target.value })); changed(); }}><option value="">未明确</option>{kind !== 'exit_receipt' ? <option value="outflow">实际支出</option> : <option value="inflow">实际实收</option>}{['project_fee', 'project_tax'].includes(kind) ? <option value="exclude">排除并明确披露</option> : null}</select></label>)}{termInput('IRR显示小数位', 'irrDecimals', { type: 'number' })}{termInput('金额显示小数位', 'amountDecimals', { type: 'number' })}{termInput('MOIC显示小数位', 'moicDecimals', { type: 'number' })}{termInput('结果校验容差', 'tolerance')}</div>{termInput('规则来源、指标定义及适用限制', 'explanation', { multi: true })}<details><summary className="cursor-pointer text-sm">可选数值边界记录</summary><p className="my-2 text-xs text-[var(--secondary)]">仅保留明确提出的边界，不是财务送审必填，也不证明收益率根唯一。</p><div className="grid gap-3 md:grid-cols-2">{termInput('收益率下界（可留空）', 'lowerRateBound')}{termInput('收益率上界（可留空）', 'upperRateBound')}{termInput('迭代次数上限（可留空）', 'maxIterations', { type: 'number' })}</div></details></Section></> : edit.kind === 'sample' ? <><Section title="独立算例来源与精确口径"><label className="block text-sm">绑定口径版本<select className={field} value={basisId} onChange={e => { setBasisId(e.target.value); changed(); }}><option value="">请选择本范围的精确版本</option>{scopeBases.map(b => <option value={b.id} key={b.id}>V{b.version} · {returnStatusLabels[b.status]} · {b.latest ? ' · 当前版本' : ' · 历史版本'}</option>)}</select></label>{selectedBasis ? <p className="break-all text-xs text-[var(--secondary)]">新口径不能沿用旧样例批准。</p> : null}<label className="block text-sm">期望结果的独立来源<select className={field} value={origin} onChange={e => { setOrigin(e.target.value); changed(); }}><option value="">请选择来源</option><option value="finance_independent">人工独立财务算例，附推导与原件</option><option value="engineering_fixture">工程自造算例，不能替代财务独立验收</option></select></label><label className="block text-sm">样例经济截止日<input type="date" className={field} value={sampleDate} onChange={e => { setSampleDate(e.target.value); changed(); }}/></label></Section><Section title="逐笔样例现金流"><p className="text-sm text-[var(--secondary)]">由独立算例逐笔录入，人工提供期望值及独立推导。</p>{flows.map((row, index) => <div className={`${box} space-y-3`} key={row.key}><div className="flex items-center justify-between"><p className="text-sm font-medium">现金流 {index + 1}</p><button data-ui="secondary" type="button" className={button} onClick={() => { setFlows(v => v.filter(r => r.key !== row.key)); changed(); }}>移除此笔</button></div><div className="grid gap-3 md:grid-cols-2"><label className="text-sm">实际日期<input className={field} type="date" value={row.date} onChange={e => updateFlow(row.key, { date: e.target.value })}/></label><label className="text-sm">金额（元）<input className={field} inputMode="decimal" value={row.amount} onChange={e => updateFlow(row.key, { amount: e.target.value })}/></label><label className="text-sm">方向<select className={field} value={row.direction} onChange={e => updateFlow(row.key, { direction: e.target.value })}><option value="">请选择方向</option><option value="outflow">支出</option><option value="inflow">实收</option></select></label><label className="text-sm">现金流类别<select className={field} value={row.kind} onChange={e => updateFlow(row.key, { kind: e.target.value })}><option value="">请选择类别</option>{Object.entries(cashflowKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="text-sm">原币种<select className={field} value={row.currency} onChange={e => updateFlow(row.key, { currency: e.target.value })}><option value="">请选择币种</option><option value="CNY">人民币 CNY</option></select></label></div></div>)}<button data-ui="secondary" type="button" className={button} onClick={() => { setFlows(v => [...v, { key: crypto.randomUUID(), date: '', amount: '', direction: '', kind: '', currency: '' }]); changed(); }}>添加一笔现金流</button></Section><Section title="人工期望结果与独立推导"><div className="grid gap-3 md:grid-cols-2"><label className="text-sm">预期IRR（年化比例，留空为未提供）<input className={field} inputMode="decimal" value={expected.irr} onChange={e => { setExpected(v => ({ ...v, irr: e.target.value })); changed(); }}/><span className="text-xs text-[var(--secondary)]">例如10%应填0.1；不把未提供当作0。</span></label><label className="text-sm">预期MOIC（倍数，留空为未提供）<input className={field} inputMode="decimal" value={expected.moic} onChange={e => { setExpected(v => ({ ...v, moic: e.target.value })); changed(); }}/></label><label className="text-sm">预期结果状态<select className={field} value={expected.resultStatus} onChange={e => { setExpected(v => ({ ...v, resultStatus: e.target.value })); changed(); }}><option value="">未明确</option>{Object.entries({ ok: '有明确结果', no_root: '无解', multiple_roots: '多解', same_day: '同日情形', negative_root: '负解', missing_valuation: '缺少终值', not_applicable: '不适用' }).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label className="text-sm">独立期望容差<input className={field} inputMode="decimal" value={expected.tolerance} onChange={e => { setExpected(v => ({ ...v, tolerance: e.target.value })); changed(); }}/></label></div><label className="block text-sm">人工独立推导、出处与限制<textarea rows={5} className={field} value={derivation} onChange={e => { setDerivation(e.target.value); changed(); }}/></label></Section>{terminalEditor}</> : <><Section title="本次核验的固定范围与双截点"><p className="text-sm">经济截止日 {query.asOfDate} · 系统已知时点（北京时间）{knownAtLocal(query.knownAt).replace('T', ' ')}</p>{reviewRecord && reviewRecord.sourceHash !== sourceHash ? <p role="status" className="text-sm">原核验来源已变化。本次将保存新版本，请逐项重新核对；原批准与否决保留。</p> : null}<p className="text-sm text-[var(--secondary)]">一条付款或合同金额相等不能证明历史完整。费用、税费、币种和终值各自说明并附原件。</p></Section>{coverageKeys.map(key => <Section key={key} title={coverageLabels[key]}><label className="block text-sm">{coverageLabels[key]}核验结论<select className={field} value={coverage[key].status} onChange={e => updateCoverage(key, { status: e.target.value })}><option value="unknown">未知，尚未核验</option><option value="confirmed_complete">已核齐，附范围说明与原件</option><option value="confirmed_not_applicable">有凭证证明不适用</option></select></label><label className="block text-sm">本项范围、完整性与缺项说明<textarea rows={3} className={field} value={coverage[key].explanation} onChange={e => updateCoverage(key, { explanation: e.target.value })}/></label><Proofs projectId={view.project.id} title={`${coverageLabels[key]}原件`} files={files} value={coverage[key].proofs} onChange={proofs => updateCoverage(key, { proofs })} reuse={coverage[key].reuse} onReuse={reuse => updateCoverage(key, { reuse })}/></Section>)}<Section title="历史未知币种逐笔核验">{unknownRows.length ? unknownRows.map(row => { const item = confirmations[row.sourceId] ?? { confirmed: false, proofs: [], reuse: false }; return <div className="space-y-3 border-b border-[var(--line)] pb-4 last:border-0" key={row.sourceId}><p className="break-all text-sm">{row.date} · 退出净实收 {row.amount ?? '待核对'} 元</p><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={item.confirmed} onChange={e => updateConfirmation(row.sourceId, { confirmed: e.target.checked })}/>已按原件核验此笔为人民币 CNY</label>{item.confirmed ? <Proofs projectId={view.project.id} title="此笔币种确认原件" files={files} value={item.proofs} onChange={proofs => updateConfirmation(row.sourceId, { proofs })} reuse={item.reuse} onReuse={reuse => updateConfirmation(row.sourceId, { reuse })}/> : null}</div>; }) : <p className="text-sm">本次候选输入没有需逐笔确认的未知币种；这不自动确认整体币种完整性。</p>}</Section>{terminalEditor}</>}<Section title="本次依据原件"><Proofs projectId={view.project.id} title="选择本次依据原件的具体版本" files={files} value={evidence} onChange={v => { setEvidence(v); changed(); }}/><p className="text-xs text-[var(--secondary)]">各核验项、币种确认和终值须单独选择原件，或在对应项明确勾选复用。</p></Section></> : <><Section title="本次所指的完整来源版本">{source ? <Facts record={source}/> : <p role="alert">缺少明确来源版本。<NoticeHelp message="来源版本需要重新核对"/></p>}</Section>{edit.mode === 'submit' ? <Section title="送审此精确版本"><label className="block text-sm">实际可登录财务审核人<select className={field} value={reviewerId} onChange={e => { setReviewerId(e.target.value); changed(); }}><option value="">请选择审核人</option>{current.reviewers.filter(u => u.canLogin && (!source || u.id !== source.author.id || u.id === current.project.ownerId)).map(u => <option value={u.id} key={u.id}>{u.name} · {u.role === 'admin' ? '管理员' : '财务'} · {u.email}</option>)}</select></label><label className="block text-sm">审核截止日<input className={field} type="date" value={dueDate} onChange={e => { setDueDate(e.target.value); changed(); }}/></label><p className="text-sm text-[var(--secondary)]">角色和登录资格不替代真实财务授权。送审后生成绑定此业务版本的实际审核任务。</p></Section> : <Section title="记录本次审核决定"><label className="block text-sm">审核决定<select className={field} value={decision} onChange={e => { setDecision(e.target.value); changed(); }}><option value="">请选择明确决定</option><option value="approve">通过此版本</option><option value="return">退回修订，保留本次意见</option><option value="reject">否决此版本，保留否决记录</option></select></label><label className="block text-sm">审核意见与授权核对说明<textarea rows={4} className={field} value={opinion} onChange={e => { setOpinion(e.target.value); changed(); }}/></label><Proofs projectId={view.project.id} title="授权依据与结论原件（通过必选）" files={files} value={authorization} onChange={v => { setAuthorization(v); changed(); }}/><p className="text-sm text-[var(--secondary)]">流程通过不表示平台已核实真实授权效力，收益结果须同时满足全部核验条件。</p></Section>}</>}</fieldset>{error ? <p role="alert" className="whitespace-pre-wrap text-sm">{error}<NoticeHelp message={error}/></p> : null}{notice ? <p role="status" className="text-sm">{notice}</p> : null}{conflict ? <section className={`${box} space-y-3`} aria-label="最新来源核对"><p className="font-medium">本次输入已保留，尚未自动采用最新版本</p>{fresh ? <><p className="text-sm">账本已更新，请核对最新记录</p>{allRecords(fresh).filter(r => sameScope(r, query)).map(r => <Facts key={r.id} record={r}/>)}{fresh.inputs ? <details><summary className="cursor-pointer text-sm">最新双截点现金流输入</summary><p className="my-2 text-sm">{fresh.inputs.asOfDate} · {knownAtLocal(fresh.inputs.knownAt).replace('T', ' ')}</p><ul className="space-y-2 text-sm">{fresh.inputs.rows.map(row => <li className="break-words" key={`${row.sourceType}-${row.sourceId}`}>{row.date} · {row.amount ?? '待核对'} · {cashflowKindLabels[row.kind as keyof typeof cashflowKindLabels] ?? row.kind} · {row.currency === 'CNY' ? '人民币' : '币种未知'} · {row.reasonCodes.map(returnReason).join('；')}<ReadProofs proofs={row.evidence}/></li>)}</ul><p className="my-2 break-all text-xs"></p></details> : null}{edit.mode !== 'write' && !exactCanContinue ? <p role="alert" className="text-sm">原送审或审核版本已不再处于可办理状态。不会切换到另一版本，请重新核对明确来源。<NoticeHelp message="来源版本需要重新核对"/></p> : null}<button data-ui="secondary" type="button" className={button} disabled={busy || !mayAdopt} onClick={adopt}>{edit.mode === 'write' ? `已核对最新来源，保留填写并${freshCandidate ? '采用V' + freshCandidate.version + '为修订来源' : '采用最新账本修订'}` : '已核对最新账本修订，保持原审核版本身份'}</button></> : <button data-ui="info" type="button" className={button} disabled={busy} onClick={() => void refreshConflict()}>重新读取最新完整版本</button>}</section> : null}<div className="flex flex-wrap gap-3"><button data-ui="primary" type="submit" className={`${button} bg-gold text-[#181a20]`} disabled={busy || conflict || (!source && edit.mode !== 'write')}>{busy ? '保存与刷新中…' : committed ? '完成来源刷新' : edit.mode === 'write' ? '保存草稿新版本' : edit.mode === 'submit' ? '送审此精确版本' : '保存此版本审核决定'}</button><button data-ui="secondary" type="button" className={button} disabled={busy} onClick={close}>{committed ? '关闭' : '取消'}</button></div></form></WorkflowDialog>;
}
