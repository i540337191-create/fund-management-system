import assert from "node:assert/strict";
import test from "node:test";
import { createPersistentStateStore, type PersistentStorage } from "../src/lib/persistedState.ts";
import { loadBusinessStateFromServer, type BusinessStateSnapshot } from "../src/lib/serverState.ts";

function createDefaults(): BusinessStateSnapshot {
  return {
    capitalRecords: [],
    fundRecords: [],
    projectRecords: [],
    reportRecords: [],
    reportExportRecords: [],
    meetingRecords: [],
    aiIntakeRecords: [],
    fundInvestorRecords: [],
    fundDocumentRecords: [],
    fundAuditLogs: {},
    auditEvents: [],
    materialRecords: [],
    materialApiRecords: [],
    projectTaskRecordsById: {},
  };
}

function createMemoryStorage(): PersistentStorage & { writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    getItem: () => null,
    setItem: (_key, value) => {
      writes.push(value);
    },
    removeItem: () => undefined,
  };
}

test("loads business state from server ledger APIs", async () => {
  const result = await loadBusinessStateFromServer(
    {
      getFunds: async () => ({
        funds: [{
          id: "fundapp-growth-i",
          name: "示例成长一期基金",
          shortName: "示例成长一期",
          stage: "投后管理",
          manager: "演示投资经理",
          scale: "5.00 亿",
          paidIn: "4.72 亿",
          invested: "3.67 亿",
          balance: "1.05 亿",
          projectCount: 1,
          investorCount: 1,
          openTasks: 0,
          riskCount: 0,
          nextAction: "测试基金",
          updatedAt: "2026-06-11",
          dataOrigin: "seed_demo",
        }],
      }),
      getFund: async () => ({
        fund: { id: "fundapp-growth-i", name: "示例成长一期基金" },
        investors: [{ id: "investor-1", fundId: "fundapp-growth-i", name: "LP", type: "机构", commitment: "1 亿", paidIn: "1 亿", suitabilityStatus: "已完成", signStatus: "已签署" }],
        documents: [{ id: "document-1", fundId: "fundapp-growth-i", name: "报告.docx", category: "投后报告", owner: "演示投资经理", archivedAt: "2026-06-11", path: "基金档案" }],
        clauses: [],
      }),
      getProjects: async () => ({
        projects: [{ id: "demo-robotics", name: "演示智能设备有限公司", shortName: "演示智能设备", fund: "示例成长一期基金", industry: "智能装备", status: "已投", stage: "投后管理", manager: "演示投资经理", amount: "3000 万", risk: "中", latest: "服务端测试项目", todoCount: 0, updatedAt: "2026-06-11", description: "", thesis: "", nextAction: "", dataOrigin: "seed_demo" }],
      }),
      getTasks: async () => ({
        tasks: [{ id: "task-1", projectId: "demo-robotics", name: "补资料", type: "资料补充", stage: "投后", owner: "演示投资经理", dueDate: "2026-06-20", status: "未开始", priority: "高", relation: "资料库", note: "补齐" }],
      }),
      getMaterials: async () => ({
        materials: [{
          id: "material-1",
          name: "材料.pdf",
          type: "企业基础资料",
          uploader: "演示投资经理",
          time: "2026-06-11",
          source: "上传",
          status: "已摘要",
          quotes: "2",
          project: "演示智能设备有限公司",
          primaryScope: "project",
          dataOrigin: "source_pdf_ocr",
          relationships: {
            funds: [{ id: "fundapp-growth-i", name: "示例成长一期基金", relationType: "linked", isPrimary: false }],
            projects: [{ id: "demo-robotics", name: "演示智能设备有限公司", relationType: "primary", isPrimary: true }],
            companies: [{ id: "company-demo-robotics", name: "演示智能设备有限公司", relationType: "linked", isPrimary: false }],
            investors: [],
          },
        }],
      }),
      getAiIntakeItems: async () => ({
        items: [{
          id: "ai-1",
          title: "AI 收件箱测试项",
          inputType: "财务报表",
          source: "Excel 上传",
          submittedBy: "财务",
          submittedAt: "2026-06-11 10:00",
          summary: "测试服务端 AI 收件箱读取。",
          confidence: "95%",
          suggestedFund: "示例成长一期基金",
          suggestedProject: "演示智能设备有限公司",
          suggestedPath: "基金档案 / 账户资金",
          extracted: ["到账金额"],
          generatedTasks: ["财务确认管理费口径"],
          status: "待确认",
        }],
      }),
      getMeetings: async () => ({
        meetings: [{
          id: "meeting-1",
          title: "服务端会议",
          project: "演示智能设备有限公司",
          date: "2026-06-11",
          attendees: "演示投资经理",
          status: "待确认",
          todos: 1,
          risks: 0,
          summary: "测试服务端会议读取。",
          conclusions: ["结论"],
          todoItems: ["待办"],
          riskItems: [],
        }],
      }),
      getReports: async () => ({
        reports: [{ id: "report-1", name: "报告", target: "演示智能设备有限公司", type: "企业监控报告", status: "待审核", owner: "演示投资经理", updatedAt: "2026-06-11 10:00" }],
      }),
      getCapitalRecords: async () => ({
        capitalRecords: [{ id: "capital-1", company: "演示智能设备有限公司", fund: "示例成长一期基金", received: "3000 万元", date: "2026-04-27", rule: "年化 2%", receivable: "407,671 元", dueDate: "2026-05-06", status: "未收" }],
      }),
      getAuditEvents: async () => ({
        auditEvents: [{ id: "audit-1", module: "资金事项", action: "创建资金事项", targetType: "资金", targetId: "capital-1", targetName: "演示智能设备", actor: "财务", time: "2026-06-11 10:00", detail: "已创建" }],
      }),
    },
    createDefaults(),
  );

  assert.equal(result.mode, "server");
  assert.equal(result.state.fundRecords[0].dataOrigin, "seed_demo");
  assert.equal(result.state.projectRecords[0].id, "demo-robotics");
  assert.equal(result.state.projectRecords[0].dataOrigin, "seed_demo");
  assert.equal(result.state.fundInvestorRecords[0].id, "investor-1");
  assert.equal(result.state.fundDocumentRecords[0].id, "document-1");
  assert.equal(result.state.projectTaskRecordsById["demo-robotics"][0].id, "task-1");
  assert.deepEqual(result.state.materialRecords[0], ["材料.pdf", "企业基础资料", "演示投资经理", "2026-06-11", "上传", "已摘要", "2", "演示智能设备有限公司", "source_pdf_ocr", "unknown"]);
  assert.equal(result.state.materialApiRecords[0].relationships?.projects[0].id, "demo-robotics");
  assert.equal(result.state.materialApiRecords[0].dataOrigin, "source_pdf_ocr");
  assert.equal(result.state.aiIntakeRecords[0].id, "ai-1");
  assert.equal(result.state.meetingRecords[0].title, "服务端会议");
  assert.equal(result.state.reportRecords[0].id, "report-1");
  assert.equal(result.state.capitalRecords[0].id, "capital-1");
  assert.equal(result.state.auditEvents[0].id, "audit-1");
});

test("successful empty server material ledger stays empty without default source or demo rows", async () => {
  const defaults = createDefaults();
  defaults.materialRecords = [
    ["风险匹配告知书.pdf", "投资者适当性资料", "基金运营", "2026-06-10", "真实物料 / OCR API", "已摘要", "1", "示例成长一期基金"],
    ["演示公告.pdf", "业务经营资料", "演示风控经理", "2026-04-27", "政府公告", "已摘要", "4", "演示先进材料有限公司"],
  ];

  const result = await loadBusinessStateFromServer(
    {
      getFunds: async () => ({ funds: [] }),
      getFund: async () => ({ fund: { id: "", name: "" }, investors: [], documents: [], clauses: [] }),
      getProjects: async () => ({ projects: [] }),
      getTasks: async () => ({ tasks: [] }),
      getMaterials: async () => ({ materials: [] }),
      getAiIntakeItems: async () => ({ items: [] }),
      getMeetings: async () => ({ meetings: [] }),
      getReports: async () => ({ reports: [] }),
      getCapitalRecords: async () => ({ capitalRecords: [] }),
      getAuditEvents: async () => ({ auditEvents: [] }),
    },
    defaults,
  );

  assert.equal(result.mode, "server");
  assert.deepEqual(result.state.materialRecords, []);
  assert.deepEqual(result.state.materialApiRecords, []);
});

test("server failure returns an explicit empty degraded snapshot, never seeded defaults", async () => {
  const defaults = createDefaults();
  defaults.auditEvents = [{ id: "seed-audit", module: "系统设置", action: "使用种子数据", targetType: "系统", targetId: "seed", targetName: "种子状态", actor: "系统", time: "2026-06-11", detail: "服务端不可用" }];

  const result = await loadBusinessStateFromServer(
    {
      getFunds: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    },
    defaults,
  );

  assert.equal(result.mode, "degraded");
  assert.deepEqual(result.state.auditEvents, []);
  assert.match(result.message, /读取失败/);
});

test("missing required client method returns empty degraded state, never seeded meetings", async () => {
  const defaults = createDefaults();
  defaults.meetingRecords = [{
    id: "seed-meeting",
    title: "种子会议",
    project: "演示智能设备有限公司",
    date: "2026-06-11",
    attendees: "演示投资经理",
    status: "待确认",
    todos: 1,
    risks: 0,
    summary: "服务端客户端不完整时保留默认会议。",
    conclusions: [],
    todoItems: [],
    riskItems: [],
  }];

  const result = await loadBusinessStateFromServer(
    {
      getFunds: async () => ({ funds: [] }),
    },
    defaults,
  );

  assert.equal(result.mode, "degraded");
  assert.deepEqual(result.state.meetingRecords, []);
  assert.match(result.message, /读取失败/);
});

test("persistent store can be disabled while API mode is active", () => {
  const storage = createMemoryStorage();
  const store = createPersistentStateStore<{ auditEvents: string[] }>({
    key: "state",
    version: 1,
    storage,
    enabled: false,
  });

  store.save({ auditEvents: ["should-not-save"] });

  assert.equal(storage.writes.length, 0);
});

test("audit-only 403 does not replace permitted real projects and tasks with demo defaults", async () => {
  const defaults = createDefaults();
  const realProject = { id: "real-project", name: "真实授权项目" } as any;
  const client = {
    getFunds: async () => ({ funds: [] }), getFund: async () => ({} as any),
    getProjects: async () => ({ projects: [realProject] }),
    getTasks: async () => ({ tasks: [{ id: "real-task", projectId: realProject.id, name: "已改派任务", ownerId: "real-worker" }] as any }),
    getMaterials: async () => ({ materials: [] }), getAiIntakeItems: async () => ({ items: [] }),
    getMeetings: async () => ({ meetings: [] }), getReports: async () => ({ reports: [] }),
    getCapitalRecords: async () => ({ capitalRecords: [] }),
    getAuditEvents: async () => { throw Object.assign(new Error("forbidden"), { status: 403 }); },
  };
  const result = await loadBusinessStateFromServer(client, defaults);
  assert.equal(result.mode, "server"); assert.equal(result.state.projectRecords[0].id, realProject.id);
  assert.equal(result.state.projectTaskRecordsById[realProject.id][0].id, "real-task");
  assert.deepEqual(result.state.auditEvents, []);
  for (const status of [401, 500]) {
    const failed = await loadBusinessStateFromServer({ ...client, getAuditEvents: async () => { throw { status }; } }, defaults);
    assert.equal(failed.mode, "degraded");
  }
});

function emptyLedgerClient(){return {
 getFunds:async()=>({funds:[]}),getFund:async()=>{throw Error('No fund in empty ledger');},getProjects:async()=>({projects:[]}),getTasks:async()=>({tasks:[]}),getMaterials:async()=>({materials:[]}),getAiIntakeItems:async()=>({items:[]}),getMeetings:async()=>({meetings:[]}),getReports:async()=>({reports:[]}),getCapitalRecords:async()=>({capitalRecords:[]}),getAuditEvents:async()=>({auditEvents:[]})
};}
test('business snapshot waits for actual reconciliation idle before reading task or fund counts',async()=>{
 let healthCalls=0,businessCalls=0;const client=emptyLedgerClient();
 const result=await loadBusinessStateFromServer({...client,getHealth:async()=>({ok:true,maintenance:{postInvestment:{state:++healthCalls===1?'running':'idle',lastCompletedAt:null}}}),getFunds:async()=>{businessCalls++;assert.equal(healthCalls,2);return {funds:[]};}},createDefaults());
 assert.equal(result.mode,'server');assert.equal(businessCalls,1);
});
test('failed reconciliation does not read stale business counts or substitute local demo records',async()=>{
 let calls=0;const result=await loadBusinessStateFromServer({...emptyLedgerClient(),getHealth:async()=>({ok:true,maintenance:{postInvestment:{state:'failed',lastCompletedAt:null}}}),getFunds:async()=>{calls++;return {funds:[]};}},createDefaults());
 assert.equal(result.mode,'degraded');assert.equal(calls,0);if(result.mode==='degraded')assert.match(result.message,/核对尚未完成/);assert.deepEqual(result.state.projectRecords,[]);
});
test('maintenance wait cannot resume an old business load under a later login epoch',async()=>{
 const {invalidateClientSession}=await import('../src/lib/sessionBoundary.ts');let calls=0;
 const result=await loadBusinessStateFromServer({...emptyLedgerClient(),getHealth:async()=>{invalidateClientSession();return {ok:true,maintenance:{postInvestment:{state:'running',lastCompletedAt:null}}};},getFunds:async()=>{calls++;return {funds:[]};}},createDefaults());
 assert.equal(result.mode,'degraded');assert.equal(calls,0);
});

test('a stalled maintenance health response is aborted at the wall-clock deadline without loading business data',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-10-30T00:00:00Z')});
 let signal:AbortSignal|undefined,calls=0;
 const pending=loadBusinessStateFromServer({...emptyLedgerClient(),getHealth:async(current)=>{signal=current;return await new Promise<never>((_resolve,reject)=>{current!.addEventListener('abort',()=>reject(Object.assign(Error('Aborted'),{name:'AbortError'})),{once:true});});},getFunds:async()=>{calls++;return {funds:[]};}},createDefaults());
 t.mock.timers.tick(30_000);
 const result=await pending;assert.equal(signal?.aborted,true);assert.equal(result.mode,'degraded');assert.equal(calls,0);if(result.mode==='degraded')assert.match(result.message,/核对尚未完成/);
});

test('fund details start before slower independent ledgers finish, without returning partial data',async()=>{
 let release!:()=>void,detailStarted=false,completed=false;
 const materials=new Promise<{materials:[]}>(resolve=>{release=()=>resolve({materials:[]});});
 const result=loadBusinessStateFromServer({
  getFunds:async()=>({funds:[{id:'fund-a'}]}) as any,
  getFund:async()=>{detailStarted=true;return {fund:{id:'fund-a'},investors:[],documents:[]};},
  getProjects:async()=>({projects:[]}),getTasks:async()=>({tasks:[]}),getMaterials:()=>materials,
  getAiIntakeItems:async()=>({items:[]}),getMeetings:async()=>({meetings:[]}),
  getReports:async()=>({reports:[]}),getCapitalRecords:async()=>({capitalRecords:[]}),getAuditEvents:async()=>({auditEvents:[]}),
 },createDefaults()).then(value=>{completed=true;return value;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(detailStarted,true);assert.equal(completed,false);
 release();assert.equal((await result).mode,'server');
});
