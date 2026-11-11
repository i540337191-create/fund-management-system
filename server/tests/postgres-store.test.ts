import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresLedgerStore } from "../src/ledger/postgres-store.ts";

type QueryCall = {
  sql: string;
  values: unknown[];
};

test("postgres ledger store writes tasks and audit events in one transaction", async () => {
  const calls: QueryCall[] = [];
  let auditEventId = "";
  const store = createPostgresLedgerStore({
    runWithClient: async (callback) =>
      callback({
        query: async (sql, values = []) => {
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
          calls.push({ sql, values });
          const normalizedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();

          if (normalizedSql === "begin" || normalizedSql === "commit" || normalizedSql === "rollback") {
            return { rows: [] };
          }

          if (normalizedSql.startsWith("select id from users")) {
            return { rows: [{ id: "user-demo-investment-manager" }] };
          }

          if (normalizedSql.startsWith("insert into tasks")) {
            return { rows: [] };
          }

          if (normalizedSql.includes("from tasks t") && normalizedSql.includes("where t.id = $1")) {
            return {
              rows: [
                {
                  id: values[0],
                  project_id: "demo-robotics",
                  name: "补充 PostgreSQL 验收材料",
                  type: "资料补充",
                  stage: "投后管理",
                  owner_name: "演示投资经理",
                  due_date_label: "2026-06-20",
                  status: "未开始",
                  priority: "高",
                  relation: "服务端化 / PostgreSQL",
                  note: "验证数据库写入和审计事件同事务。",
                  updated_at_label: "2026-06-11 10:00",
                },
              ],
            };
          }

          if (normalizedSql === "select name from projects where id = $1") {
            return { rows: [{ name: "演示智能设备有限公司" }] };
          }

          if (normalizedSql.startsWith("insert into audit_events")) {
            auditEventId = String(values[0]);
            return { rows: [] };
          }

          if (normalizedSql.includes("from audit_events a") && normalizedSql.includes("where a.id = $1")) {
            return {
              rows: [
                {
                  id: auditEventId,
                  module: "任务中心",
                  action: "创建任务",
                  target_type: "项目",
                  target_id: "demo-robotics",
                  target_name: "演示智能设备有限公司",
                  actor_name: "演示投资经理",
                  event_time_label: "2026-06-11 10:00",
                  detail: "创建资料补充任务 task-postgres-001：补充 PostgreSQL 验收材料，负责人 演示投资经理，截止 2026-06-20。",
                  source: "服务端化 / PostgreSQL",
                },
              ],
            };
          }

          throw new Error(`Unexpected SQL in test: ${sql}`);
        },
      }),
  });

  const result = await store.createTask({
    id: "task-postgres-001",
    projectId: "demo-robotics",
    name: "补充 PostgreSQL 验收材料",
    type: "资料补充",
    stage: "投后管理",
    owner: "演示投资经理",
    dueDate: "2026-06-20",
    status: "未开始",
    priority: "高",
    relation: "服务端化 / PostgreSQL",
    note: "验证数据库写入和审计事件同事务。",
  });

  assert.equal(result.task.id, "task-postgres-001");
  assert.equal(result.auditEvent.targetId, "demo-robotics");
  assert.equal(calls[0].sql, "begin");
  assert.equal(calls.at(-1)?.sql, "commit");
  assert.ok(calls.some((call) => call.sql.includes("insert into tasks")));
  assert.ok(calls.some((call) => call.sql.includes("insert into audit_events")));
});

test("postgres ledger store returns material relation summaries", async () => {
  const store = createPostgresLedgerStore({
    runWithClient: async (callback) =>
      callback({
        query: async (sql) => {
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
          const normalizedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();

          if (normalizedSql.includes("from materials m") && normalizedSql.includes("material_fund_relations")) {
            return {
              rows: [
                {
                  id: "source-material-020",
                  fund_id: "fundapp-growth-i",
                  project_id: null,
                  company_id: null,
                  raw_project_label: "示例成长一期基金",
                  name: "风险匹配告知书.pdf",
                  category: "投资者适当性资料",
                  owner_name: "基金运营",
                  archived_at_label: "2026-06-10",
                  source: "真实物料 / OCR API",
                  status: "已摘要",
                  citation_count: 1,
                  path: "基金档案 / 募集 / 投资者适当性",
                  archive_path: "基金档案 / 募集 / 投资者适当性",
                  primary_scope: "investor",
                  original_file_path: "docs/source-materials/originals/risk.pdf",
                  recognized_text_path: "docs/source-materials/ocr-results/risk.md",
                  source_material_id: "source-material-020",
                  file_extension: "pdf",
                  size_bytes: "1200",
                  sha256: "hash",
                  fund_relations: [{ id: "fundapp-growth-i", name: "示例成长一期基金", relationType: "primary", isPrimary: true }],
                  project_relations: [],
                  company_relations: [],
                  investor_relations: [{ id: "investor-1", name: "演示机构投资人A", relationType: "subject", isPrimary: false }],
                },
              ],
            };
          }

          throw new Error(`Unexpected SQL in relation test: ${sql}`);
        },
      }),
  });

  const materials = await store.listMaterials();

  assert.equal(materials[0].id, "source-material-020");
  assert.equal(materials[0].relationships?.funds[0].name, "示例成长一期基金");
  assert.equal(materials[0].relationships?.investors[0].name, "演示机构投资人A");
  assert.equal(materials[0].primaryScope, "investor");
});

test("postgres ledger store archives reviewed OCR materials with evidence and relations", async () => {
  const calls: QueryCall[] = [];
  let materialId = "";
  let auditEventId = "";
  const store = createPostgresLedgerStore({
    runWithClient: async (callback) =>
      callback({
        query: async (sql, values = []) => {
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
          calls.push({ sql, values });
          const normalizedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();

          if (normalizedSql === "begin" || normalizedSql === "commit" || normalizedSql === "rollback") {
            return { rows: [] };
          }

          if (normalizedSql.includes("from projects p") && normalizedSql.includes("where p.id = $1 or p.name = $1 or p.short_name = $1")) {
            return {
              rows: [
                {
                  id: "demo-robotics",
                  fundId: "fundapp-growth-i",
                  name: "演示智能设备有限公司",
                  shortName: "演示智能设备",
                  stage: "投后管理",
                  manager: "演示投资经理",
                },
              ],
            };
          }

          if (normalizedSql.startsWith("select id from users")) {
            return { rows: [{ id: "user-fund-ops" }] };
          }

          if (normalizedSql.startsWith("insert into materials")) {
            materialId = String(values[0]);
            return { rows: [] };
          }

          if (normalizedSql.startsWith("insert into material_fund_relations") || normalizedSql.startsWith("insert into material_project_relations")) {
            return { rows: [] };
          }

          if (normalizedSql.includes("from materials m") && normalizedSql.includes("where m.id = $1")) {
            return {
              rows: [
                {
                  id: materialId,
                  fund_id: "fundapp-growth-i",
                  project_id: "demo-robotics",
                  company_id: null,
                  raw_project_label: "演示智能设备有限公司",
                  name: "风险匹配告知书.pdf",
                  category: "投资者适当性资料",
                  owner_name: "基金运营",
                  archived_at_label: "2026-06-10",
                  source: "真实物料 / OCR API",
                  status: "已入库",
                  citation_count: 1,
                  path: "基金档案 / 募集 / 投资者适当性",
                  archive_path: "基金档案 / 募集 / 投资者适当性",
                  primary_scope: "investor",
                  original_file_path: "docs/source-materials/originals/risk.pdf",
                  recognized_text_path: "docs/source-materials/ocr-results/risk.md",
                  source_material_id: "source-material-020",
                  file_extension: "pdf",
                  size_bytes: "1200",
                  sha256: "hash",
                  data_origin: "source_pdf_ocr",
                  fund_relations: [{ id: "fundapp-growth-i", name: "示例成长一期基金", relationType: "primary", isPrimary: true }],
                  project_relations: [{ id: "demo-robotics", name: "演示智能设备有限公司", relationType: "linked", isPrimary: false }],
                  company_relations: [],
                  investor_relations: [],
                },
              ],
            };
          }

          if (normalizedSql.startsWith("insert into audit_events")) {
            auditEventId = String(values[0]);
            return { rows: [] };
          }

          if (normalizedSql.includes("from audit_events a") && normalizedSql.includes("where a.id = $1")) {
            return {
              rows: [
                {
                  id: auditEventId,
                  module: "AI 收件箱",
                  action: "确认资料归档",
                  target_type: "资料",
                  target_id: materialId,
                  target_name: "风险匹配告知书.pdf",
                  actor_name: "基金运营",
                  event_time_label: "2026-06-11 10:00",
                  detail: "确认归档到 基金档案 / 募集 / 投资者适当性。",
                  source: "真实物料 / OCR API",
                  data_origin: "system_generated",
                },
              ],
            };
          }

          throw new Error(`Unexpected SQL in archive material test: ${sql}`);
        },
      }),
  });

  const result = await store.archiveMaterial({
    name: "风险匹配告知书.pdf",
    type: "投资者适当性资料",
    uploader: "基金运营",
    time: "2026-06-10",
    source: "真实物料 / OCR API",
    status: "已入库",
    quotes: "1",
    project: "演示智能设备有限公司",
    fundId: "fundapp-growth-i",
    projectId: "demo-robotics",
    primaryScope: "investor",
    path: "基金档案 / 募集 / 投资者适当性",
    archivePath: "基金档案 / 募集 / 投资者适当性",
    originalFilePath: "docs/source-materials/originals/risk.pdf",
    recognizedTextPath: "docs/source-materials/ocr-results/risk.md",
    sourceMaterialId: "source-material-020",
    fileExtension: "pdf",
    sizeBytes: 1200,
    sha256: "hash",
    dataOrigin: "source_pdf_ocr",
    relationships: {
      funds: [{ id: "fundapp-growth-i", name: "示例成长一期基金", relationType: "primary", isPrimary: true }],
      projects: [{ id: "demo-robotics", name: "演示智能设备有限公司", relationType: "linked", isPrimary: false }],
      companies: [],
      investors: [],
    },
  });

  const materialInsert = calls.find((call) => call.sql.includes("insert into materials"));
  assert.ok(materialInsert);
  assert.match(materialInsert.sql, /archive_path/);
  assert.match(materialInsert.sql, /original_file_path/);
  assert.match(materialInsert.sql, /recognized_text_path/);
  assert.match(materialInsert.sql, /primary_scope/);
  assert.match(materialInsert.sql, /source_material_id/);
  assert.match(materialInsert.sql, /data_origin/);
  assert.ok(materialInsert.values.includes("source_pdf_ocr"));
  assert.ok(materialInsert.values.includes("docs/source-materials/originals/risk.pdf"));
  assert.ok(materialInsert.values.includes("docs/source-materials/ocr-results/risk.md"));
  assert.ok(calls.some((call) => call.sql.includes("insert into material_fund_relations")));
  assert.ok(calls.some((call) => call.sql.includes("insert into material_project_relations")));
  assert.equal(result.material.dataOrigin, "source_pdf_ocr");
  assert.equal(result.material.originalFilePath, "docs/source-materials/originals/risk.pdf");
});

test("postgres ledger store searches OCR chunks with relation filters", async () => {
  const calls: QueryCall[] = [];
  const store = createPostgresLedgerStore({
    runWithClient: async (callback) =>
      callback({
        query: async (sql, values = []) => {
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
          calls.push({ sql, values });
          const normalizedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();

          if (normalizedSql.includes("from material_text_chunks c") && normalizedSql.includes("material_investor_relations")) {
            return {
              rows: [
                {
                  id: "source-material-020-p1-c1",
                  material_id: "source-material-020",
                  file_name: "风险匹配告知书.pdf",
                  category: "投资者适当性资料",
                  project_or_fund: "示例成长一期基金",
                  archive_path: "基金档案 / 募集 / 投资者适当性",
                  page_number: 1,
                  chunk_index: 1,
                  content: "符合下列条件之一的是专业投资者，专业投资者之外的是普通投资者。",
                  recognized_text_path: "docs/source-materials/ocr-results/risk.md",
                  original_file_path: "docs/source-materials/originals/risk.pdf",
                },
              ],
            };
          }

          throw new Error(`Unexpected SQL in text search test: ${sql}`);
        },
      }),
  });

  const results = await store.searchMaterialTextChunks({ query: "专业投资者条件", relationType: "investor", limit: 3 });

  assert.equal(results[0].materialId, "source-material-020");
  assert.equal(results[0].page, 1);
  assert.match(results[0].text, /专业投资者/);
  assert.ok(calls[0].sql.includes("material_investor_relations"));
  assert.deepEqual(calls[0].values, ["专业投资者条件", "investor", 3, ["专业投资者", "专业投资者条件"], [5, 7]]);
  assert.match(calls[0].sql, /order by matched\.score desc/);
  assert.match(calls[0].sql, /limit \$3/);
});

test("postgres ledger store can restrict OCR chunk search to trusted data origins", async () => {
  const calls: QueryCall[] = [];
  const store = createPostgresLedgerStore({
    runWithClient: async (callback) =>
      callback({
        query: async (sql, values = []) => {
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
          calls.push({ sql, values });
          return { rows: [] };
        },
      }),
  });

  await store.searchMaterialTextChunks({
    query: "专业投资者条件",
    limit: 2,
    allowedDataOrigins: ["source_pdf_ocr", "source_file", "user_input"],
  });

  assert.match(calls[0].sql, /m\.data_origin = any\(\$\d+::text\[\]\)/);
  assert.deepEqual(calls[0].values, ["专业投资者条件", "", 2, ["source_pdf_ocr", "source_file", "user_input"], ["专业投资者", "专业投资者条件"], [5, 7]]);
});
