import { termsMissing, type ReturnTerms, type IndependentSample, type ReturnTerminalValue } from './return-basis.ts';
import { date } from './workflow.ts';
export type EngineCashflow = { date: string; amount: string | null; direction: string; kind: string; currency: string };
export type ReturnCalculation = { irr: string | null; moic: string | null; status: string; reasonCodes: string[]; amounts?: { invested: string; outflows: string; distributions: string; terminal: string } };
const day = (s: string) => Date.parse(s + 'T00:00:00Z') / 86400000;
export function returnYearFraction(from: string, to: string, convention: string) {
    if (convention !== 'ACT_ACT_ISDA') return (day(to) - day(from)) / (convention === 'ACT_360' ? 360 : 365);
    let start = day(from), result = 0, year = Number(from.slice(0, 4));
    const finish = day(to);
    while (start < finish) {
        const boundary = new Date(start * 86400000);
        boundary.setUTCFullYear(year + 1, 0, 1);
        const stop = Math.min(boundary.getTime() / 86400000, finish);
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        result += (stop - start) / (leap ? 366 : 365);
        start = stop; year++;
    }
    return result;
}
function roundedRatio(n: bigint, d: bigint, places: number, mode: string) {
    const negative = n < 0n; n = negative ? -n : n;
    const scaled = n * 10n ** BigInt(places), q = scaled / d, remainder = scaled % d;
    const up = remainder * 2n > d || remainder * 2n === d && (mode === 'half_up' || q % 2n === 1n);
    const value = String(q + (up ? 1n : 0n)).padStart(places + 1, '0');
    return (negative && BigInt(value) !== 0n ? '-' : '') + (places ? value.slice(0, -places) + '.' + value.slice(-places) : value);
}
function amountUnits(s: string) {
    if (!/^(0|[1-9]\d{0,17})(\.\d{1,18})?$/.test(s)) throw new Error('invalid_cashflow_amount');
    const [w, f = ''] = s.split('.');
    return BigInt(w + f.padEnd(18, '0')); 
}
type Term = { c: number; t: number };
// Log-rate transforms discounted cashflows into an exponential sum. Its derivative's roots partition every monotone interval, including touching roots.
function roots(terms: Term[], lo: number, hi: number, tolerance: number, maxIterations: number): number[] {
    if (terms.length < 2) return [];
    if (terms.length === 2) {
        if (terms[0].c * terms[1].c >= 0) return [];
        const root = Math.log(-terms[1].c / terms[0].c) / (terms[1].t - terms[0].t);
        return root >= lo && root <= hi ? [root] : [];
    }
    const shift = terms[0].t, normalized = terms.map(v => ({ c: v.c, t: v.t - shift }));
    const scale = Math.max(...normalized.map(v => Math.abs(v.c)));
    for (const v of normalized) v.c /= scale;
    const evaluate = (x: number) => {
        const powers = normalized.map(v => Math.log(Math.abs(v.c)) - v.t * x), max = Math.max(...powers);
        return powers.reduce((sum, power, i) => sum + Math.sign(normalized[i].c) * Math.exp(power - max), 0);
    };
    const critical = roots(normalized.slice(1).map(v => ({ c: -v.t * v.c, t: v.t })), lo, hi, tolerance, maxIterations);
    const points = [lo, ...critical, hi], result: number[] = [];
    for (let i = 0; i < points.length; i++) {
        let left = points[i], a = evaluate(left);
        if (Math.abs(a) <= 32 * Number.EPSILON * terms.length) throw new Error('ambiguous_root');
        if (i === points.length - 1) break;
        let right = points[i + 1], b = evaluate(right);
        if (a * b >= 0 || Math.abs(b) <= 32 * Number.EPSILON * terms.length) continue;
        let converged = false;
        for (let iteration = 0; iteration < maxIterations; iteration++) {
            const middle = (left + right) / 2, value = evaluate(middle);
            if (right - left <= tolerance || middle === left || middle === right) { converged = true; break; }
            if (value === 0) { left = middle; right = middle; converged = true; break; }
            if (a * value < 0) { right = middle; b = value; } else { left = middle; a = value; }
        }
        if (!converged) throw new Error('iteration_limit');
        result.push((left + right) / 2);
    }
    return result.sort((a, b) => a - b).filter((v, i, all) => !i || Math.abs(v - all[i - 1]) > tolerance * 4);
}
export function calculateReturns(terms: ReturnTerms, cashflows: EngineCashflow[], terminal: ReturnTerminalValue | null, asOfDate: string): ReturnCalculation {
    let moic: string | null = null, amounts: ReturnCalculation['amounts'];
    const result = (status: string): ReturnCalculation => ({ irr: null, moic, status, reasonCodes: status === 'ok' ? [] : [status], ...(amounts ? { amounts } : {}) });
    try {
        if (termsMissing(terms).length) return result('incomplete_terms');
        date(asOfDate);
        const mode = terms.roundingMode!, dates = new Map<string, bigint>();
        let invested = 0n, outflows = 0n, distributions = 0n;
        for (const flow of cashflows) {
            date(flow.date);
            if (flow.date > asOfDate || flow.currency !== 'CNY') return result('invalid_cashflow_scope');
            const mapping = terms.cashflowMapping?.[flow.kind as keyof NonNullable<ReturnTerms['cashflowMapping']>];
            if (!mapping || mapping !== 'exclude' && mapping !== flow.direction) return result('cashflow_mapping_conflict');
            const policy = flow.kind === 'project_fee' ? terms.feePolicy : flow.kind === 'project_tax' ? terms.taxPolicy : undefined;
            if (policy && (policy === 'include_actual_cash') !== (mapping === 'outflow')) return result('cashflow_policy_conflict');
            if (mapping === 'exclude') continue;
            const amount = amountUnits(flow.amount ?? '');
            if (amount <= 0n) return result('nonpositive_cashflow');
            if (mapping === 'outflow') { outflows += amount; if (flow.kind === 'investment_payment') invested += amount; }
            else distributions += amount;
            dates.set(flow.date, (dates.get(flow.date) ?? 0n) + (mapping === 'outflow' ? -amount : amount));
        }
        let terminalAmount = 0n;
        if (terms.terminalPolicy !== 'not_applicable_with_evidence') {
            if (!terminal || terminal.date !== asOfDate || terminal.currency !== 'CNY' || !terminal.evidence.length || !terminal.scope.trim()) return result('missing_valuation');
            terminalAmount = amountUnits(terminal.amount);
            if (terms.terminalPolicy === 'explicit_zero_with_evidence' && terminalAmount !== 0n) return result('terminal_policy_requires_zero');
        } else if (terminal !== null) return result('terminal_policy_conflict');
        if (terms.measure === 'total') dates.set(asOfDate, (dates.get(asOfDate) ?? 0n) + terminalAmount);
        const displayAmount = (n: bigint) => roundedRatio(n, 10n ** 18n, terms.amountDecimals!, mode);
        amounts = { invested: displayAmount(invested), outflows: displayAmount(outflows), distributions: displayAmount(distributions), terminal: displayAmount(terminalAmount) };
        const denominator = terms.moicDenominator === 'invested_capital' ? invested : outflows;
        if (denominator <= 0n) return result('no_invested_capital');
        moic = roundedRatio(distributions + (terms.moicNumerator === 'distributions_plus_terminal' ? terminalAmount : 0n), denominator, terms.moicDecimals!, mode);
        const rows = [...dates].sort(([a], [b]) => a.localeCompare(b));
        if (rows.length < 2) return result('same_day');
        const tolerance = Number(terms.tolerance);
        // shortcut: IRR uses checked double precision and at most 128 dates; use arbitrary precision for stricter tolerances or larger schedules.
        if (tolerance < 1e-13) return result('unsupported_precision');
        const values = rows.filter(([, value]) => value !== 0n).map(([date, value]) => ({ c: Number(value), t: returnYearFraction(rows[0][0], date, terms.dayCount!) }));
        if (!values.length) return result('multiple_roots');
        if (values.length > 128) return result('calculation_size_limit');
        if (!values.some(v => v.c < 0) || !values.some(v => v.c > 0)) return result('no_root');
        const first = values[0], last = values.at(-1)!;
        const lower = -Math.log(1 + values.slice(0, -1).reduce((sum, v) => sum + Math.abs(v.c / last.c), 0)) / (last.t - values.at(-2)!.t) - 1;
        const upper = Math.log(1 + values.slice(1).reduce((sum, v) => sum + Math.abs(v.c / first.c), 0)) / (values[1].t - first.t) + 1;
        const lowerRate = terms.lowerRateBound === undefined ? undefined : Number(terms.lowerRateBound), upperRate = terms.upperRateBound === undefined ? undefined : Number(terms.upperRateBound);
        if (lowerRate !== undefined && lowerRate <= -1 || lowerRate !== undefined && upperRate !== undefined && lowerRate >= upperRate) return result('unsupported_precision');
        const lo = Math.max(lower, lowerRate === undefined ? lower : Math.log1p(lowerRate)), hi = Math.min(upper, upperRate === undefined ? upper : Math.log1p(upperRate));
        if (lo > hi) return result('no_root');
        const found = roots(values, lo, hi, Math.min(tolerance / 100, 1e-14), terms.maxIterations ?? 256);
        if (found.length > 1) return result('multiple_roots');
        if (!found.length) return result('no_root');
        const rate = Math.expm1(found[0]);
        if (!Number.isFinite(rate) || rate <= -1 || Math.abs(rate) * Number.EPSILON > tolerance / 4) return result('unsupported_precision');
        if (rate < -1e-15 && terms.negativeRootPolicy === 'null_negative_root') return result('negative_root');
        const discounted = values.map(v => ({ value: v.c * Math.exp(-v.t * found[0]), t: v.t }));
        const sum = discounted.reduce((n, v) => n + v.value, 0), absolute = discounted.reduce((n, v) => n + Math.abs(v.value), 0), slope = discounted.reduce((n, v) => n - v.t * v.value, 0);
        const errorBound = (Math.abs(sum) + absolute * Number.EPSILON * 64 * values.length) / Math.abs(slope) * (1 + rate);
        if (!Number.isFinite(errorBound) || errorBound > tolerance / 4) return result('unsupported_precision');
        const roundRate = (value: number) => {
            const text = (Math.abs(value) <= 1e-15 ? 0 : value).toFixed(16), negative = text.startsWith('-'), [whole, fraction] = (negative ? text.slice(1) : text).split('.');
            return roundedRatio((negative ? -1n : 1n) * BigInt(whole + fraction), 10n ** BigInt(fraction.length), terms.irrDecimals!, mode);
        };
        const nonzero = rows.filter(([, value]) => value !== 0n);
        let irr: string;
        if (values.length === 2 && values[1].t - values[0].t === 1) {
            let n = -nonzero[1][1] - nonzero[0][1], d = nonzero[0][1];
            if (d < 0n) { n = -n; d = -d; }
            irr = roundedRatio(n, d, terms.irrDecimals!, mode);
        } else {
            if (roundRate(rate - errorBound) !== roundRate(rate + errorBound)) return result('unsupported_precision');
            irr = roundRate(rate);
        }
        return { ...result('ok'), irr };
    } catch (error) { return result(error instanceof Error && ['iteration_limit', 'ambiguous_root', 'invalid_cashflow_amount'].includes(error.message) ? error.message : 'invalid_calculation_input'); }
}
export function sampleCalculationMissing(sample: IndependentSample, terms: ReturnTerms): string[] {
    if (!sample.asOfDate) return ['sample.asOfDate'];
    const actual = calculateReturns(terms, sample.cashflows, sample.terminalValue, sample.asOfDate);
    const matches = (value: string | null, expected: string | null) => {
        if (value === null || expected === null) return value === expected;
        const texts = [value, expected, sample.expected.tolerance];
        if (texts.some(s => !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s))) return false;
        const scale = Math.max(...texts.map(s => s.split('.')[1]?.length ?? 0));
        const [a, b, tolerance] = texts.map(s => { const negative = s.startsWith('-'), [w, f = ''] = (negative ? s.slice(1) : s).split('.'); return (negative ? -1n : 1n) * BigInt(w + f.padEnd(scale, '0')); });
        return tolerance > 0n && (a > b ? a - b : b - a) <= tolerance;
    };
    return actual.status === sample.expected.resultStatus && matches(actual.irr, sample.expected.irr) && matches(actual.moic, sample.expected.moic) ? [] : ['sample.calculation_mismatch'];
}
