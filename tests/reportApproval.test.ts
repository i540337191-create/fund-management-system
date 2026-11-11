import assert from "node:assert/strict";
import test from "node:test";
import { reports } from "../src/data/reports.ts";
import {
  approveReportRecord,
  createReportApprovalAuditEvent,
  createReportExportRecord,
  createReportHtmlExportPackage,
} from "../src/lib/reportApproval.ts";

test("approves a report and creates an export record", () => {
  const report = reports.find((item) => item.name.includes("一季度运营报告"));
  assert.ok(report);

  const approved = approveReportRecord(report, "2026-06-10 19:50");
  const exportRecord = createReportExportRecord(approved, {
    exportedAt: "2026-06-10 19:55",
    format: "PDF",
    actor: "演示财务经理",
  });

  assert.equal(approved.status, "已完成");
  assert.equal(approved.updatedAt, "2026-06-10 19:50");
  assert.equal(exportRecord.fileName, "示例成长一期基金-2026-年一季度运营报告.pdf");
  assert.equal(exportRecord.downloadFileName, "示例成长一期基金-2026-年一季度运营报告.html");
  assert.equal(exportRecord.downloadMimeType, "text/html;charset=utf-8");
  assert.equal(exportRecord.watermark, "内部材料 / 演示财务经理 / 2026-06-10 19:55");
  assert.deepEqual(exportRecord.sources, ["报告中心", "资料库", "审计日志"]);
});

test("creates an audit event for report approval", () => {
  const report = reports.find((item) => item.name.includes("一季度运营报告"));
  assert.ok(report);

  const event = createReportApprovalAuditEvent(report, {
    actor: "演示财务经理",
    approvedAt: "2026-06-10 19:50",
  });

  assert.equal(event.module, "报告中心");
  assert.equal(event.action, "审核通过报告");
  assert.equal(event.targetName, report.name);
  assert.match(event.detail, /进入可导出状态/);
});

test("creates a downloadable HTML report package with traceable sections", () => {
  const report = reports.find((item) => item.name.includes("一季度运营报告"));
  assert.ok(report);
  const approved = approveReportRecord(report, "2026-06-10 19:50");
  const exportRecord = createReportExportRecord(approved, {
    exportedAt: "2026-06-10 19:55",
    format: "PDF",
    actor: "演示财务经理",
  });

  const downloadPackage = createReportHtmlExportPackage(approved, exportRecord, {
    generatedAt: "2026-06-10 19:56",
    sections: ["一、基金基本情况", "二、本季度投资进展"],
  });

  assert.equal(downloadPackage.mimeType, "text/html;charset=utf-8");
  assert.equal(downloadPackage.fileName, "示例成长一期基金-2026-年一季度运营报告.html");
  assert.match(downloadPackage.content, /<title>示例成长一期基金 2026 年一季度运营报告<\/title>/);
  assert.match(downloadPackage.content, /内部材料 \/ 演示财务经理 \/ 2026-06-10 19:55/);
  assert.match(downloadPackage.content, /一、基金基本情况/);
  assert.match(downloadPackage.content, /报告中心、资料库、审计日志/);
  assert.match(downloadPackage.summary, /HTML 导出包/);
});
