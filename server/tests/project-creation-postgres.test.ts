import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresLedgerStore } from "../src/ledger/postgres-store.ts";
import { normalizeProjectInput } from "../src/ledger/store.ts";

const input = { requestId: "ce350888-7421-4aa5-802c-8955f5ce7a96", name: "测试项目", shortName: "项目", industry: "制造", fundId: "fund-1", manager: "外部负责人", collaborators: "甲、乙", sourceChannel: "合作推荐", description: "描述" };
const actor = { id: "user-admin", name: "管理员" };

// This SQL double checks transaction control; actual locking/rollback need a real PostgreSQL run.
function databaseDouble(options: { failAudit?: boolean; badFund?: boolean; knownManager?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  let projects: Record<string, unknown>[] = [];
  let audits: Record<string, unknown>[] = [];
  let receipts:Record<string,unknown>[]=[];
  let snapshot = { projects, audits };
  const store = createPostgresLedgerStore({ runWithClient: async callback => callback({
    query: async (sql, values = []) => {
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      calls.push({ sql: normalized, values });
      if(normalized==='select object_type,payload from custom_field_schemas')return {rows:[]};
      if(normalized==='update custom_field_schemas set payload=$2::jsonb where object_type=$1')return {rows:[]};
      if(normalized.startsWith('select id,name,short_name,industry,revision,data_origin,custom_fields,schema_revision,owner_actor_id,')&&normalized.includes('from portfolio_companies'))return {rows:[]};
      if(normalized==='select request_id,fingerprint,result from master_write_requests')return {rows:receipts};
      if(normalized.startsWith('insert into master_write_requests')){receipts.push({request_id:values[0],fingerprint:values[1],result:JSON.parse(String(values[2]))});return {rows:[]};}
      if(normalized==='update projects set custom_fields=$2::jsonb,schema_revision=$3 where id=$1'){Object.assign(projects.find(p=>p.id===values[0])!,{custom_fields:JSON.parse(String(values[1])),schema_revision:values[2]});return {rows:[]};}

      if (normalized === "begin") { snapshot = { projects: [...projects], audits: [...audits] }; return { rows: [] }; }
      if (normalized === "commit") return { rows: [] };
      if (normalized === "rollback") { projects = snapshot.projects; audits = snapshot.audits; return { rows: [] }; }
      if (normalized.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (normalized.includes("from projects p")) return { rows: projects };
      if (normalized.includes("from funds f")) return { rows: options.badFund ? [] : [{ id: input.fundId, name: "基金" }] };
      if (normalized === "select id from users where id = $1") return { rows: [{ id: actor.id }] };
      if (normalized.startsWith("select id from users where name = $1")) return { rows: options.knownManager ? [{ id: "known-user" }] : [] };
      if (normalized.startsWith("insert into projects")) {
        projects.push({id:values[0],fund_id:values[1],company_id:values[2],master_revision:values[3],name:values[4],short_name:values[5],industry:values[6],description:values[7],manager_label:values[8],manager_name:values[8],owner_actor_id:values[9],collaborators:values[10],source_channel:values[11],status:values[12],stage:values[13],amount_label:values[14],risk_level:values[15],latest:values[16],thesis:values[17],next_action:values[18],data_origin:values[19],fund_name:'基金',updated_at_label:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),todo_count:0});
        return { rows: [] };
      }
      if (normalized.startsWith("insert into audit_events")) {
        if (options.failAudit) throw new Error("audit persistence failed");
        audits.push({ id: values[0], module: values[1], action: values[2], target_type: values[3], target_id: values[4], target_name: values[5], actor_user_id: values[6], actor_name: values[7], event_time_label: "2026-10-29 10:00", detail: values[9], source: values[10], data_origin: values[11] });
        return { rows: [] };
      }
      if (normalized.includes("from audit_events a")) return { rows: audits.filter(row => normalized.includes("where a.id = $1") ? row.id === values[0] : row.target_id === values[0]) };
      if (sql.startsWith('update projects set owner_actor_id')) { const row=projects.find(p=>p.id===values[0]); if(row) row.owner_actor_id=values[1]; return {rows:[]}; }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
  }) });
  return { store, calls, records: () => ({ projects, audits }) };
}

test("SQL double: project and authenticated audit commit once, retries reuse request snapshot", async () => {
  const db = databaseDouble();
  const result = await db.store.createProject(input, actor);
  assert.equal(result.created, true);
  assert.equal(result.project.manager, input.manager);
  assert.equal(result.project.collaborators, input.collaborators);
  assert.equal(result.project.sourceChannel, input.sourceChannel);
  const insert = db.calls.find(call => call.sql.startsWith("insert into projects"))!;
  assert.deepEqual(insert.values.slice(12,16),['拟投','初筛','未录入','低']);
  assert.equal(result.project.amount,'未录入');
  assert.equal(insert.values[9], null);
  assert.equal(insert.values[8], input.manager);
  assert.equal(db.records().audits[0].actor_user_id, actor.id);
  assert.deepEqual(db.calls.slice(0, 2).map(call => call.sql), ["begin", "select pg_advisory_xact_lock(hashtextextended($1, 0))"]);
  assert.equal(db.calls.at(-1)?.sql, "commit");
  const retry = await db.store.createProject(input, actor);
  assert.deepEqual(retry, { ...result, created: false });
  for (const [changedInput, changedActor] of [[{ ...input, description: "changed" }, actor], [input, { ...actor, id: "other" }]] as const) {
    await assert.rejects(async () => db.store.createProject(changedInput, changedActor), { message: "project_request_conflict" });
  }
  assert.equal(db.records().projects.length, 1);
  assert.equal(db.records().audits.length, 1);
});

test("SQL double: audit write failure rolls back the inserted project", async () => {
  const db = databaseDouble({ failAudit: true });
  await assert.rejects(async () => db.store.createProject(input, actor), /audit persistence failed/);
  assert.equal(db.calls.at(-1)?.sql, "rollback");
  assert.equal(db.calls.some(call => call.sql === "commit"), false);
  assert.deepEqual(db.records(), { projects: [], audits: [] });
});

test("SQL double: bad fund and invalid input cannot persist projects or audit", async () => {
  const db = databaseDouble({ badFund: true });
  await assert.rejects(async () => db.store.createProject(input, actor), { message: "fund_not_found" });
  assert.equal(db.calls.at(-1)?.sql, "rollback");
  assert.equal(db.calls.some(call => call.sql.startsWith("insert")), false);
  const invalid = databaseDouble();
  await assert.rejects(async () => invalid.store.createProject({ ...input, name: "" }, actor), { message: "invalid_project_payload" });
  assert.equal(invalid.calls.length, 0);
});

test("SQL double: only an exact known manager name is associated", async () => {
  const db = databaseDouble({ knownManager: true });
  await db.store.createProject(input, actor);
  assert.match(db.calls.find(call=>call.sql.startsWith('insert into projects'))!.sql,/select id from users where name=\$21/);
  assert.equal(db.calls.find(call=>call.sql.startsWith('insert into projects'))!.values[20],input.manager);
  assert.equal(db.records().projects[0].owner_actor_id, null);
  assert.equal(db.calls.some(call => call.sql.startsWith("insert into users") || call.sql.startsWith("insert into funds")), false);
});

test("project validator rejects oversized, null-byte and inherited-property names", () => {
  for (const body of [{ ...input, name: "x".repeat(201) }, { ...input, description: "bad\0text" }, { ...input, toString: "forged" }]) {
    assert.throws(() => normalizeProjectInput(body), { message: "invalid_project_payload" });
  }
});

test('SQL double: each canonical initial stage is persisted without synthetic approval or cashflow inserts',async()=>{
 const {projectInitialStages}=await import('../src/ledger/store.ts');
 for(const stage of projectInitialStages){const db=databaseDouble();const result=await db.store.createProject({...input,stage},actor);assert.equal(result.project.stage,stage);const inserted=db.calls.find(c=>c.sql.startsWith('insert into projects'))!;assert.equal(inserted.values[13],stage);assert.equal(inserted.values[12],'拟投');assert.equal(inserted.values[14],'未录入');assert.equal(db.calls.some(c=>/insert into (approval|deal_|investment_cashflows|exit_)/.test(c.sql)),false);}
});
