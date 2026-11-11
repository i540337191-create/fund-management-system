import assert from "node:assert/strict";
import test from "node:test";
import type { MaterialRecord } from "../src/lib/materialFilters.ts";
import {
  countSeedDemoRecords,
  filterMaterialRecordsBySeedDemo,
  filterProjectTaskRecordsBySeedDemo,
  filterSeedDemoRecords,
} from "../src/lib/dataOriginFilter.ts";

test("filters only seed demo records when the global switch is enabled", () => {
  const records = [
    { id: "seed", dataOrigin: "seed_demo" },
    { id: "ocr", dataOrigin: "source_pdf_ocr" },
    { id: "manual", dataOrigin: "user_input" },
  ];

  assert.deepEqual(filterSeedDemoRecords(records, true).map((record) => record.id), ["ocr", "manual"]);
  assert.deepEqual(filterSeedDemoRecords(records, false).map((record) => record.id), ["seed", "ocr", "manual"]);
  assert.equal(countSeedDemoRecords(records), 1);
});

test("material tuple filtering keeps real PDF material and hides explicitly labelled demo material without inferring reality from labels", () => {
  const records: MaterialRecord[] = [
    ["OCR.pdf", "信息披露资料", "基金运营", "2026-06-10", "真实物料 / OCR API", "已摘要", "1", "示例成长一期基金"],
    ["原始文件.pdf", "募集文件", "基金运营", "2026-06-10", "真实物料 / 原始文件", "待识别", "0", "示例成长一期基金"],
    ["用户上传.pdf", "法务资料", "演示投资经理", "2026-06-11", "用户上传", "待复核", "0", "演示智能设备有限公司"],
    ["旧样例上传.pdf", "法务资料", "演示研究员", "2026-04-25", "人工上传", "待复核", "0", "演示清洁能源有限公司", "seed_demo"],
    ["旧样例会议纪要.docx", "会议资料", "演示投资经理", "2026-04-24", "会议纪要", "已摘要", "0", "演示智能设备有限公司", "seed_demo"],
    ["演示公告.pdf", "业务经营资料", "演示风控经理", "2026-04-27", "政府公告", "已摘要", "4", "演示先进材料有限公司", "seed_demo"],
  ];

  assert.deepEqual(filterMaterialRecordsBySeedDemo(records, true).map((record) => record[0]), ["OCR.pdf", "原始文件.pdf", "用户上传.pdf"]);
});

test("project task filtering uses task origin and preserves independent manual tasks on a demo project", () => {
  const tasksByProject = {
    hidden: [{ id: "task-hidden-project", dataOrigin: "user_input" }],
    visible: [
      { id: "task-seed", dataOrigin: "seed_demo" },
      { id: "task-manual", dataOrigin: "user_input" },
    ],
  };

  assert.deepEqual(filterProjectTaskRecordsBySeedDemo(tasksByProject, ["visible"], true), {
    hidden: [{ id: "task-hidden-project", dataOrigin: "user_input" }],
    visible: [{ id: "task-manual", dataOrigin: "user_input" }],
  });
});

test("engineering purpose is independent from manual origin and never cascades from parent", () => {
  const records = [
    {id:'fixture',dataOrigin:'user_input',dataPurpose:'engineering_fixture'},
    {id:'genuine',dataOrigin:'user_input'},
    {id:'unknown',dataOrigin:'unknown'},
    {id:'derived',dataOrigin:'system_generated',sourceBasis:[{id:'proof',dataOrigin:'source_file',dataPurpose:'engineering_fixture'}]},
    {id:'current-fixture',dataOrigin:'source_file',currentVersionPurpose:'engineering_fixture'},
  ];
  assert.deepEqual(filterSeedDemoRecords(records,true).map(r=>r.id),['genuine','unknown']);
  assert.equal(filterSeedDemoRecords(records,false).length,5);
  assert.equal(records[0].dataOrigin,'user_input');
  assert.deepEqual(filterProjectTaskRecordsBySeedDemo({fixture:[records[1],records[0]]},[],true),{fixture:[records[1]]});
});

test("material filtering keeps origin and selected view purpose separate", () => {
  const base:MaterialRecord=['proof.pdf','资料','上传人','2026-10-30','上传','待核实','0','工程项目','source_file','unknown'];
  const fixture:MaterialRecord=[...base];fixture[9]='engineering_fixture';
  assert.deepEqual(filterMaterialRecordsBySeedDemo([base,fixture],true),[base]);
  assert.equal(base[8],'source_file');
});
