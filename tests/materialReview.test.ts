import assert from "node:assert/strict";
import test from "node:test";
import { funds } from "../src/data/funds.ts";
import { projects } from "../src/data/projects.ts";
import { fixtureEntries as sourceMaterialKnowledgeEntries } from "./fixtures/material-fixtures.ts";
import { createMaterialDirectoryRows, type MaterialRecord } from "../src/lib/materialFilters.ts";
import {
  createMaterialArchivePayload,
  createMaterialReviewDraft,
} from "../src/lib/materialReview.ts";

test("builds a review draft from a recognized PDF material", () => {
  const entry = sourceMaterialKnowledgeEntries.find((item) => item.fileName.includes("风险匹配告知书"));
  assert.ok(entry);
  const row = createMaterialDirectoryRows([entry.materialRecord as MaterialRecord], projects)[0];

  const draft = createMaterialReviewDraft({ row, entry, funds, projects });

  assert.equal(draft.fundName, "示例成长一期基金");
  assert.equal(draft.fundId, "fundapp-growth-i");
  assert.equal(draft.primaryScope, "investor");
  assert.equal(draft.archivePath, "基金档案 / 募集 / 投资者适当性");
});

test("creates an archive payload with evidence links and confirmed relationships", () => {
  const entry = sourceMaterialKnowledgeEntries.find((item) => item.fileName.includes("风险匹配告知书"));
  assert.ok(entry);
  const row = createMaterialDirectoryRows([entry.materialRecord as MaterialRecord], projects)[0];
  const draft = {
    ...createMaterialReviewDraft({ row, entry, funds, projects }),
    projectId: "demo-robotics",
    projectName: "演示智能设备有限公司",
    companyName: "演示智能设备有限公司",
    investorName: "演示机构投资人A",
  };

  const payload = createMaterialArchivePayload({ row, entry, draft });

  assert.equal(payload.name, entry.fileName);
  assert.equal(payload.status, "已入库");
  assert.equal(payload.path, "基金档案 / 募集 / 投资者适当性");
  assert.equal(payload.archivePath, "基金档案 / 募集 / 投资者适当性");
  assert.equal(payload.originalFilePath, entry.originalPath);
  assert.equal(payload.recognizedTextPath, entry.recognizedTextPath);
  assert.equal(payload.recognizedHtmlPath, entry.recognizedHtmlPath);
  assert.equal(payload.pageImageManifestPath, entry.pageImageManifestPath);
  assert.equal(payload.pageImageDir, entry.pageImageDir);
  assert.equal(payload.sourceMaterialId, entry.id);
  assert.equal(payload.dataOrigin, "unknown"); // Synthetic metadata is not real OCR provenance.
  assert.equal(payload.primaryScope, "investor");
  assert.equal(payload.relationships?.funds[0]?.id, "fundapp-growth-i");
  assert.equal(payload.relationships?.projects[0]?.id, "demo-robotics");
  assert.equal(payload.relationships?.companies[0]?.name, "演示智能设备有限公司");
  assert.equal(payload.relationships?.investors[0]?.name, "演示机构投资人A");
});

test("keeps generated preview path when archiving an Office source material", () => {
  const entry = sourceMaterialKnowledgeEntries.find((item) => item.id === "demo-doc-office");
  assert.ok(entry);
  const row = createMaterialDirectoryRows([entry.materialRecord as MaterialRecord], projects)[0];
  const draft = createMaterialReviewDraft({ row, entry, funds, projects });

  const payload = createMaterialArchivePayload({ row, entry, draft });

  assert.equal(payload.originalFilePath, entry.originalPath);
  assert.equal(payload.previewFilePath, entry.previewPath);
  assert.match(payload.previewFilePath ?? "", /previews\/demo-doc-office\.pdf$/);
});
