import type { ReportRecord } from "../data/reports";
import { createAuditEvent, type AuditEvent } from "./auditTrail.ts";
import { slugifyBusinessText } from "./textSlug.ts";

type ReportDownloadMimeType = "text/html;charset=utf-8" | "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ReportExportRecord = {
  dataOrigin?: string;dataPurpose?:string;
  sourceBasis?: {id:string;dataOrigin:string}[];
  reportId?: string;
  id: string;
  reportName: string;
  fileName: string;
  downloadFileName: string;
  downloadMimeType: ReportDownloadMimeType;
  format: "PDF" | "DOCX";
  exportedAt: string;
  actor: string;
  watermark: string;
  sources: string[];
};

export type ReportHtmlExportPackage = {
  fileName: string;
  mimeType: ReportDownloadMimeType;
  content: string;
  summary: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function approveReportRecord(report: ReportRecord, approvedAt: string): ReportRecord {
  return {
    ...report,
    status: "已完成",
    updatedAt: approvedAt,
  };
}

export function createReportExportRecord(
  report: ReportRecord,
  {
    exportedAt,
    format,
    actor,
  }: {
    exportedAt: string;
    format: ReportExportRecord["format"];
    actor: string;
  },
): ReportExportRecord {
  const extension = format.toLowerCase();
  const fileName = `${report.name.replace(/\s+/g, "-")}.${extension}`;
  const downloadFileName = fileName.replace(/\.[^.]+$/, ".html");

  return {
    dataOrigin: report.dataOrigin??'unknown',
    sourceBasis: [{id:report.id??report.name,dataOrigin:report.dataOrigin??'unknown'}],
    id: `export-${slugifyBusinessText(report.name)}-${slugifyBusinessText(exportedAt)}`,
    ...(report.id ? { reportId: report.id } : {}),
    reportName: report.name,
    fileName,
    downloadFileName,
    downloadMimeType: "text/html;charset=utf-8",
    format,
    exportedAt,
    actor,
    watermark: `内部材料 / ${actor} / ${exportedAt}`,
    sources: ["报告中心", "资料库", "审计日志"],
  };
}

export function createReportApprovalAuditEvent(
  report: ReportRecord,
  {
    actor,
    approvedAt,
  }: {
    actor: string;
    approvedAt: string;
  },
): AuditEvent {
  return createAuditEvent({
    module: "报告中心",
    action: "审核通过报告",
    targetType: "报告",
    targetId: report.name,
    targetName: report.name,
    actor,
    time: approvedAt,
    detail: `${report.type}已由${actor}审核通过，进入可导出状态。`,
    source: report.target,
  });
}

export function createReportHtmlExportPackage(
  report: ReportRecord,
  exportRecord: ReportExportRecord,
  {
    generatedAt,
    sections,
  }: {
    generatedAt: string;
    sections: string[];
  },
): ReportHtmlExportPackage {
  const fileName = exportRecord.downloadFileName;
  const sourceText = exportRecord.sources.join("、");
  const sectionMarkup = sections
    .map(
      (section) => `
        <section>
          <h2>${escapeHtml(section)}</h2>
          <p>本节基于${escapeHtml(report.target)}资料、报告模板和审计线索生成，导出后需由责任人复核。</p>
        </section>`,
    )
    .join("");

  const content = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.name)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 40px; color: #181a20; line-height: 1.7; }
    header { border-bottom: 2px solid #d8a61c; margin-bottom: 28px; padding-bottom: 18px; }
    h1 { font-size: 28px; margin: 0 0 12px; }
    h2 { font-size: 18px; margin-top: 28px; }
    .meta, .watermark, footer { color: #5f6673; font-size: 13px; }
    .watermark { border: 1px solid #d7dce3; margin-top: 16px; padding: 10px 12px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(report.name)}</h1>
    <div class="meta">类型：${escapeHtml(report.type)} · 对象：${escapeHtml(report.target)} · 状态：${escapeHtml(report.status)} · 责任人：${escapeHtml(report.owner)}</div>
    <div class="watermark">${escapeHtml(exportRecord.watermark)}</div>
  </header>
  ${sectionMarkup}
  <footer>
    生成时间：${escapeHtml(generatedAt)} · 来源：${escapeHtml(sourceText)}
  </footer>
</body>
</html>`;

  return {
    fileName,
    mimeType: "text/html;charset=utf-8",
    content,
    summary: `HTML 导出包已生成：${fileName}`,
  };
}
