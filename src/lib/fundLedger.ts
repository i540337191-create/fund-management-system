import type { CapitalItem } from "../data/capital";
import type { Fund, FundInvestor } from "../data/funds";
import type { ReportRecord } from "../data/reports";
import { filterCapitalRecords } from "./capitalLedger.ts";

export type FundraisingRow = FundInvestor & {
  nextAction: "无需处理" | "确认签署" | "补齐适当性资料并确认签署";
  closed: boolean;
};

export type FundFeeRow = CapitalItem & {
  nextAction: "已确认" | "确认管理费到账";
};

export function deriveFundraisingRows(investors: FundInvestor[]): FundraisingRow[] {
  return investors.map((investor) => {
    const closed = investor.suitabilityStatus === "已完成" && investor.signStatus === "已签署";
    const nextAction = closed
      ? "无需处理"
      : investor.suitabilityStatus === "已完成"
        ? "确认签署"
        : "补齐适当性资料并确认签署";

    return {
      ...investor,
      nextAction,
      closed,
    };
  });
}

export function confirmFundInvestorSignature(investor: FundInvestor): FundInvestor {
  return {
    ...investor,
    suitabilityStatus: "已完成",
    signStatus: "已签署",
  };
}

export function deriveFundReportRows(fund: Fund, reportRecords: ReportRecord[], localDemo = false): ReportRecord[] {
  return reportRecords
    .filter((report) => report.fundId === fund.id || localDemo && !report.fundId && (report.target === fund.name || report.target.includes(fund.shortName)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function deriveFundFeeRows(records: CapitalItem[], fundName: string, fundId?:string, allowLegacyName=false): FundFeeRow[] {
  return filterCapitalRecords(records, { fund: fundName, fundId, allowLegacyName }).map((record) => ({
    ...record,
    nextAction: record.status === "已收" ? "已确认" : "确认管理费到账",
  }));
}

export function confirmFundFeeRecord(record: CapitalItem): CapitalItem {
  return {
    ...record,
    status: "已收",
    confirmationStatus: "AI 已确认",
  };
}
