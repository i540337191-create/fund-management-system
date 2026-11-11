import assert from "node:assert/strict";
import test from "node:test";
import { projects } from "../src/data/projects.ts";
import {
  createApiMaterialDirectoryRows,
  createMaterialDirectoryRows,
  createUploadedMaterialRecord,
  filterApiMaterials,
  filterMaterials,
  filterMaterialsByProject,
  inferMaterialArchivePath,
  type ApiMaterialRecord,
  type MaterialRecord,
} from "../src/lib/materialFilters.ts";

const materials: MaterialRecord[] = [
  ["演示智能设备 BP.pdf", "企业基础资料", "演示投资经理", "2026-04-20", "企业上传", "已摘要", "8", "演示智能设备有限公司"],
  ["诉讼核查材料.pdf", "法务资料", "演示研究员", "2026-04-25", "人工上传", "待复核", "3", "演示清洁能源有限公司"],
];

test("filters materials by full project name", () => {
  const result = filterMaterialsByProject(materials, "演示清洁能源有限公司");

  assert.deepEqual(result.map((material) => material[0]), ["诉讼核查材料.pdf"]);
});

test("filters materials by partial project name", () => {
  const result = filterMaterialsByProject(materials, "演示智能设备");

  assert.deepEqual(result.map((material) => material[0]), ["演示智能设备 BP.pdf"]);
});

test("returns all materials when project query is blank", () => {
  const result = filterMaterialsByProject(materials, "   ");

  assert.equal(result.length, 2);
});

test("creates an uploaded material record with default citation count", () => {
  const record = createUploadedMaterialRecord({
    name: "新上传资料.pdf",
    type: "法务资料",
    uploader: "演示投资经理",
    time: "2026-05-02",
    source: "人工上传",
    status: "待复核",
    project: "演示智能设备有限公司",
  });

  assert.deepEqual(record, ["新上传资料.pdf", "法务资料", "演示投资经理", "2026-05-02", "人工上传", "待复核", "0", "演示智能设备有限公司", "user_input"]);
});

test("derives directory path, fund, and stage for materials", () => {
  const record: MaterialRecord = [
    "演示智能设备投资协议条款识别.pdf",
    "法务资料",
    "演示投后经理",
    "2026-06-07",
    "AI 收件箱 / PDF 上传",
    "已摘要",
    "3",
    "演示智能设备有限公司",
  ];

  const rows = createMaterialDirectoryRows([record], projects);

  assert.equal(inferMaterialArchivePath(record), "项目档案 / 协议条款 / 投资协议");
  assert.deepEqual(rows[0], {
    name: "演示智能设备投资协议条款识别.pdf",
    type: "法务资料",
    uploader: "演示投后经理",
    time: "2026-06-07",
    source: "AI 收件箱 / PDF 上传",
    status: "已摘要",
    quotes: "3",
    project: "演示智能设备有限公司",
    fund: "示例成长一期基金",
    stage: "投后管理",
    path: "项目档案 / 协议条款 / 投资协议",
    rule: "法务资料 -> 项目档案 / 协议条款",
    confidence: "高",
    dataOrigin: "unknown",
    dataPurpose: "unknown",
  });
});

test("filters materials by category, fund, project, and stage", () => {
  const result = filterMaterials(
    [
      ["演示智能设备投资协议条款识别.pdf", "法务资料", "演示投后经理", "2026-06-07", "AI 收件箱 / PDF 上传", "已摘要", "3", "演示智能设备有限公司"],
      ["诉讼核查材料.pdf", "法务资料", "演示研究员", "2026-04-25", "人工上传", "待复核", "3", "演示清洁能源有限公司"],
    ],
    {
      category: "法务资料",
      projectQuery: "演示智能设备",
      fundName: "示例成长一期基金",
      stage: "投后管理",
    },
    projects,
  );

  assert.deepEqual(result.map((material) => material[0]), ["演示智能设备投资协议条款识别.pdf"]);
});

test("filters materials by file and archive path keywords", () => {
  const result = filterMaterials(
    [
      ["示例基金（虚构）_资金到账证明.pdf", "资金资料", "基金运营", "2026-06-10", "真实物料 / OCR API", "已摘要", "1", "示例成长一期基金"],
      ["私募投资基金信息披露实施细则.pdf", "信息披露资料", "基金运营", "2026-06-10", "真实物料 / OCR API", "已摘要", "1", "示例成长一期基金"],
    ],
    {
      category: "全部资料",
      projectQuery: "出资证明",
      fundName: "示例成长一期基金",
      stage: "募集期",
    },
    projects,
  );

  assert.deepEqual(result.map((material) => material[0]), ["示例基金（虚构）_资金到账证明.pdf"]);
});

test("derives fund-level source material archive paths", () => {
  const record: MaterialRecord = [
    "私募投资基金信息披露重要内容模板第3号《私募股权投资基金半年度报告》.pdf",
    "信息披露资料",
    "基金运营",
    "2026-06-10",
    "真实物料 / OCR API",
    "已摘要",
    "1",
    "示例成长一期基金",
  ];

  const rows = createMaterialDirectoryRows([record], projects);

  assert.equal(inferMaterialArchivePath(record), "基金档案 / 信息披露 / 报告模板");
  assert.equal(rows[0].fund, "示例成长一期基金");
  assert.equal(rows[0].stage, "投后管理");
  assert.equal(rows[0].confidence, "高");
});

test("derives relationship-aware rows from database materials", () => {
  const rows = createApiMaterialDirectoryRows(
    [
      {
        id: "source-material-020",
        name: "风险匹配告知书.pdf",
        type: "投资者适当性资料",
        uploader: "基金运营",
        time: "2026-06-10",
        source: "真实物料 / OCR API",
        status: "已摘要",
        quotes: "1",
        project: "示例成长一期基金",
        primaryScope: "investor",
        archivePath: "基金档案 / 募集 / 投资者适当性",
        relationships: {
          funds: [{ id: "fundapp-growth-i", name: "示例成长一期基金", relationType: "primary", isPrimary: true }],
          projects: [],
          companies: [],
          investors: [{ id: "investor-1", name: "演示机构投资人A", relationType: "subject", isPrimary: false }],
        },
      } satisfies ApiMaterialRecord,
    ],
    projects,
  );

  assert.equal(rows[0].fund, "示例成长一期基金");
  assert.equal(rows[0].relationScope, "投资人");
  assert.equal(rows[0].relationSummary, "基金：示例成长一期基金 / 投资人：演示机构投资人A");
  assert.equal(rows[0].path, "基金档案 / 募集 / 投资者适当性");
  assert.equal(rows[0].materialId,"source-material-020");
  assert.equal(rows[0].dataOrigin, "source_pdf_ocr");
});

test("filters database materials by fund project company and investor relationships", () => {
  const materials: ApiMaterialRecord[] = [
    {
      id: "fund-material",
      name: "年度报告模板.pdf",
      type: "信息披露资料",
      uploader: "基金运营",
      time: "2026-06-10",
      source: "真实物料 / OCR API",
      status: "已摘要",
      quotes: "1",
      project: "示例成长一期基金",
      primaryScope: "fund",
      archivePath: "基金档案 / 信息披露 / 报告模板",
      relationships: {
        funds: [{ id: "fundapp-growth-i", name: "示例成长一期基金", relationType: "primary", isPrimary: true }],
        projects: [],
        companies: [],
        investors: [],
      },
    },
    {
      id: "project-material",
      name: "演示智能设备经营数据.xlsx",
      type: "财务资料",
      uploader: "演示投资经理",
      time: "2026-06-11",
      source: "AI 收件箱 / Excel",
      status: "已摘要",
      quotes: "3",
      project: "演示智能设备有限公司",
      primaryScope: "project",
      archivePath: "项目档案 / 财务资料 / 经营数据",
      relationships: {
        funds: [{ id: "fundapp-growth-i", name: "示例成长一期基金", relationType: "linked", isPrimary: false }],
        projects: [{ id: "demo-robotics", name: "演示智能设备有限公司", relationType: "primary", isPrimary: true }],
        companies: [{ id: "company-demo-robotics", name: "演示智能设备有限公司", relationType: "linked", isPrimary: false }],
        investors: [],
      },
    },
    {
      id: "investor-material",
      name: "风险匹配告知书.pdf",
      type: "投资者适当性资料",
      uploader: "基金运营",
      time: "2026-06-10",
      source: "真实物料 / OCR API",
      status: "已摘要",
      quotes: "1",
      project: "示例成长一期基金",
      primaryScope: "investor",
      archivePath: "基金档案 / 募集 / 投资者适当性",
      relationships: {
        funds: [{ id: "fundapp-growth-i", name: "示例成长一期基金", relationType: "primary", isPrimary: true }],
        projects: [],
        companies: [],
        investors: [{ id: "investor-1", name: "演示机构投资人A", relationType: "subject", isPrimary: false }],
      },
    },
  ];

  assert.deepEqual(
    filterApiMaterials(materials, { category: "全部资料", projectQuery: "", fundName: "示例成长一期基金", stage: "全部阶段", relationScope: "基金" }, projects).map((material) => material.id),
    ["fund-material", "project-material", "investor-material"],
  );
  assert.deepEqual(
    filterApiMaterials(materials, { category: "全部资料", projectQuery: "演示智能设备", fundName: "全部基金", stage: "全部阶段", relationScope: "项目" }, projects).map((material) => material.id),
    ["project-material"],
  );
  assert.deepEqual(
    filterApiMaterials(materials, { category: "全部资料", projectQuery: "演示机构", fundName: "全部基金", stage: "全部阶段", relationScope: "投资人" }, projects).map((material) => material.id),
    ["investor-material"],
  );
});
