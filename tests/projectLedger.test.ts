import assert from "node:assert/strict";
import test from "node:test";
import { fundClauseMonitors, funds } from "../src/data/funds.ts";
import { meetings } from "../src/data/meetings.ts";
import { projects } from "../src/data/projects.ts";
import { risks } from "../src/data/risks.ts";
import {
  deriveProjectAuditRows,
  deriveProjectClauseRows,
  deriveProjectMaterialDirectoryRows,
  deriveProjectMeetingRows,
  deriveProjectRiskRows,
} from "../src/lib/projectLedger.ts";
import { createAuditEvent } from "../src/lib/auditTrail.ts";
import type { MaterialRecord } from "../src/lib/materialFilters.ts";

test("derives project-specific clause monitor rows from the owning fund", () => {
  const project = projects.find((item) => item.id === "demo-robotics");
  assert.ok(project);

  const rows = deriveProjectClauseRows(project, funds, fundClauseMonitors,true);

  assert.equal(rows[0].fundName, "示例成长一期基金");
  assert.equal(rows[0].projectName, "演示智能设备有限公司");
  assert.equal(rows[0].title, "演示智能设备业绩承诺监控");
  assert.equal(rows[0].scope, "项目条款");
  assert.match(rows[0].nextAction, /生成提醒任务/);
});

test("derives project material directory rows for project detail", () => {
  const project = projects.find((item) => item.id === "demo-robotics");
  assert.ok(project);
  const materials: MaterialRecord[] = [
    ["演示智能设备投资协议条款识别.pdf", "法务资料", "演示投后经理", "2026-06-07", "AI 收件箱 / PDF 上传", "已摘要", "3", "演示智能设备有限公司"],
    ["诉讼核查材料.pdf", "法务资料", "演示研究员", "2026-04-25", "人工上传", "待复核", "3", "演示清洁能源有限公司"],
  ];

  const rows = deriveProjectMaterialDirectoryRows(project, materials, projects);

  assert.deepEqual(rows.map((row) => row.name), ["演示智能设备投资协议条款识别.pdf"]);
  assert.equal(rows[0].path, "项目档案 / 协议条款 / 投资协议");
});

test("derives project risk rows from monitored risk sources", () => {
  const project = projects.find((item) => item.id === "demo-robotics");
  assert.ok(project);

  const rows = deriveProjectRiskRows(project, risks,true);

  assert.deepEqual(rows.map((row) => row.title), [
    "地方政府发布智能装备专项补贴政策",
    "演示智能设备有限公司新增知识产权变更",
  ]);
  assert.equal(rows[0].sourceLabel, "政府公告 / 西安市工信局");
});

test("derives project meeting rows bound to the project ledger", () => {
  const project = projects.find((item) => item.id === "demo-robotics");
  assert.ok(project);

  const rows = deriveProjectMeetingRows(project, meetings,true);

  assert.deepEqual(rows.map((row) => row.title), ["演示智能设备投后月度沟通会"]);
  assert.equal(rows[0].taskSummary, "3 项待办 / 2 个风险点");
});

test("derives project audit rows for the project detail ledger", () => {
  const project = projects.find((item) => item.id === "demo-robotics");
  assert.ok(project);
  const events = [
    createAuditEvent({
      module: "任务中心",
      action: "完成项目任务",
      targetType: "项目",
      targetId: "demo-robotics",
      targetName: "补充经营数据",
      actor: "演示投资经理",
      time: "2026-06-10 19:40",
      detail: "任务已完成。",
    }),
    createAuditEvent({
      module: "资金事项",
      action: "确认到账记录",
      targetType: "资金",
      targetId: "capital-demo-20260427",
      targetName: "演示智能设备有限公司到账记录",
      actor: "演示投资经理",
      time: "2026-06-10 19:20",
      detail: "到账记录关联当前项目。",
    }),
    createAuditEvent({
      module: "报告中心",
      action: "保存报告草稿",
      targetType: "报告",
      targetId: "other-report",
      targetName: "其他项目报告",
      actor: "演示财务经理",
      time: "2026-06-10 18:30",
      detail: "不属于当前项目。",
    }),
  ];

  const rows = deriveProjectAuditRows(project, events);

  assert.deepEqual(rows.map((event) => event.action), ["完成项目任务", "确认到账记录"]);
});

test('project ledger retains explicit IDs after rename and never claims same-name or unbound histories',()=>{
 const p={...projects[0],id:'project-a',fundId:'fund-a',name:'现项目名',shortName:'现简称'};
 const riskRows=[{...risks[0],id:'ra',projectId:p.id,target:'旧项目名'},{...risks[0],id:'rb',projectId:'project-b',target:p.name},{...risks[0],id:'ru',projectId:null,target:p.name}];
 assert.deepEqual(deriveProjectRiskRows(p,riskRows).map(r=>r.id),['ra']);
 const meetingRows=[{...meetings[0],id:'ma',projectId:p.id,project:'旧项目名'},{...meetings[0],id:'mb',projectId:'project-b',project:p.name},{...meetings[0],id:'mu',projectId:null,project:p.name}];
 assert.deepEqual(deriveProjectMeetingRows(p,meetingRows).map(m=>m.id),['ma']);
 const m={id:'material-a',name:'同名文件',type:'底稿',uploader:'作者',time:'2026-10-30',source:'人工上传',status:'待复核',quotes:'0',project:'旧项目名',projectId:p.id};
 const rows=deriveProjectMaterialDirectoryRows(p,[],[p],[m,{...m,id:'material-b',projectId:'project-b',project:p.name},{...m,id:'unbound',projectId:null,project:p.name}]);
 assert.equal(rows.length,1);assert.equal(rows[0].project,p.name);assert.equal(rows[0].fund,p.fund);
});
