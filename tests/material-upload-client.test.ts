import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../src/lib/apiClient.ts";
import { selectProjectMaterialRecords, type ApiMaterialRecord } from "../src/lib/materialFilters.ts";
import { projects } from "../src/data/projects.ts";

test("upload sends original File bytes, session credentials and stable version precondition", async () => {
  const file = new File(["version 2"], "资料.txt", { type: "text/plain" });
  let captured: { url: string; init: RequestInit } | undefined;
  const api = createApiClient({ fetchImpl: async (url, init = {}) => {
    captured = { url: String(url), init };
    return { ok: true, json: async () => ({ created: true }) } as Response;
  }});
  await api.uploadMaterial({ file, requestId: "stable-retry", projectId: "project-a", type: "法务资料", materialId: "material-a", expectedVersion: 1 });
  const request = captured!;
  assert.equal(request.init.body, file);
  assert.equal(request.init.credentials, "include");
  assert.equal(new Headers(request.init.headers).get("content-type"), "application/octet-stream");
  const params = new URL(request.url, "http://local").searchParams;
  assert.equal(params.get("name"), file.name);
  assert.equal(params.get("requestId"), "stable-retry");
  assert.equal(params.get("expectedVersion"), "1");
});

test("project documents follow stable relation IDs after renaming, secondary links and unlinking", () => {
  const project = { ...projects[0], name: "同名公司", shortName: "同名" };
  const material: ApiMaterialRecord = { id: "file", name: "原件.txt", type: "其他资料", uploader: "测试", time: "2026-10-29", source: "用户上传", status: "待复核", quotes: "0", project: "过期主项目名称", projectId: "other-id", relationships: { projects: [{ id: project.id, name: "旧名称" }], funds: [], companies: [], investors: [] } };
  const tuple = ["原件.txt", "其他资料", "测试", "2026-10-29", "用户上传", "待复核", "0", "同名公司"] as [string,string,string,string,string,string,string,string];
  const selected = selectProjectMaterialRecords(project, [tuple], [material]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0][7], project.name);
  assert.equal(selectProjectMaterialRecords(project, [tuple], [{ ...material, relationships: { ...material.relationships!, projects: [{ id: "different-id", name: project.name }] } }]).length, 0);
  assert.equal(selectProjectMaterialRecords(project, [tuple], [{ ...material, relationships: { ...material.relationships!, projects: [] } }]).length, 0);
});

test("upload errors preserve status and safe business code for actionable recovery", async () => {
  const api = createApiClient({ fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ error: "legacy_original_integrity_mismatch" }) }) as Response });
  await assert.rejects(() => api.uploadMaterial({ file: new File(["new"], "原件.txt"), requestId: "retry", projectId: "p", type: "其他资料" }), (error: unknown) => {
    assert.equal((error as { status: number }).status, 409);
    assert.equal((error as { code: string }).code, "legacy_original_integrity_mismatch");
    return true;
  });
});

test('server project material selection never converts name-only history into a binding when API results are empty',()=>{
 const project={...projects[0],name:'现项目名称'};
 const raw:import('../src/lib/materialFilters.ts').MaterialRecord=['原始历史文件','原件','作者','2026-10-30','人工登记','未绑定','0',project.name];
 assert.deepEqual(selectProjectMaterialRecords(project,[raw],[]),[]);
 assert.equal(selectProjectMaterialRecords(project,[raw],[],true).length,1);
});
