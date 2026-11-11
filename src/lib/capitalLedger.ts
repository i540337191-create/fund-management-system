import type { CapitalItem } from "../data/capital";

export type CapitalRecordFilter = {
  fund?: string;
  fundId?: string;
  allowLegacyName?: boolean;
  company?: string;
  projectId?: string;
};

export function filterCapitalRecords(records: CapitalItem[], filter: CapitalRecordFilter) {
  return records.filter((record) => {
    const fundMatches = filter.fundId
      ? record.fundId === filter.fundId || Boolean(filter.allowLegacyName && !record.fundId && record.fund === filter.fund)
      : !filter.fund || record.fund === filter.fund;
    const companyMatches = filter.projectId
      ? record.projectId===filter.projectId || Boolean(filter.allowLegacyName && !record.projectId && record.company===filter.company)
      : !filter.company || record.company === filter.company;
    return fundMatches && companyMatches;
  });
}

export function deriveCapitalLedger(records: CapitalItem[], filter: CapitalRecordFilter = {}) {
  const rows = filterCapitalRecords(records, filter);
  const totalReceivableYuan = rows.reduce((total, row) => total + parseMoneyToYuan(row.receivable), 0);

  return {
    rows,
    totalRecords: rows.length,
    pendingCount: rows.filter((row) => row.status !== "已收").length,
    overdueCount: rows.filter((row) => row.status === "逾期").length,
    confirmedCount: rows.filter((row) => row.confirmationStatus === "AI 已确认").length,
    totalReceivableYuan,
    totalReceivableLabel: formatYuan(totalReceivableYuan),
  };
}

export function parseMoneyToYuan(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  const numeric = Number(normalized.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  if (normalized.includes("万")) return Math.round(numeric * 10000);
  return Math.round(numeric);
}

export function formatYuan(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return `${value.toLocaleString("zh-CN")} 元`;
}
