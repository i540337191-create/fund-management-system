import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {createTestServer as createServer,registeredCookie} from './auth-fixture.ts';
import { createMemoryLedgerStore } from "../src/ledger/store.ts";

const collection = "docs/source-materials/2026-06-10-fund-ops-templates";
const auth = { mode: "password" as const, sessionSecret: "file-test-secret", adminEmail: "admin@example.test", adminPassword: "only-test-password" };
const cookie = (server:object,role: "admin" | "viewer" | "legal" = "admin") => registeredCookie(server,{ id: `test-${role}`, name: role, email: `fixture-${role}@example.test`, role }, auth.sessionSecret);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "fundapp-file-access-"));
  const dir = join(root, collection);
  await mkdir(join(dir, "originals"), { recursive: true });
  await mkdir(join(dir, "previews/pages/fixture"), { recursive: true });
  await mkdir(join(dir, "ocr-results/fixture"), { recursive: true });
  await writeFile(join(dir, "originals/private.pdf"), "PRIVATE-CONTENT-0123456789");
  await writeFile(join(dir, "originals/unregistered.pdf"), "must not be served");
  await writeFile(join(dir, "previews/pages/fixture/page-001.png"), "image");
  await writeFile(join(dir, "ocr-results/fixture/combined.html"), "<script>alert(1)</script><p>private</p>");
  const entry = { id: "source-fixture", relative_path: "originals/private.pdf", preview_page_image_dir: "previews/pages/fixture", preview_page_image_pages: 1, pdf: { recognized_html_path: "ocr-results/fixture/combined.html", pages: 1 } };
  await writeFile(join(dir, "source-index.json"), JSON.stringify({ materials: [entry] }));
  const store = createMemoryLedgerStore();
  const listMaterials = store.listMaterials;
  store.listMaterials = async () => [...await listMaterials(), { id: "material-fixture", sourceMaterialId: "source-fixture", fundId: "fundapp-growth-i", projectId: null, name: "private.pdf", type: "pdf", uploader: "test", time: "2026-10-29", source: "test", status: "test", quotes: "0", project: "test" }];
  const server = createServer({ auth, ledgerStore: store, materialPreviewProjectRoot: root });
  return { root, dir, server, cleanup: async () => { await server.close(); await rm(root, { recursive: true, force: true }); } };
}

test("original and metadata require a signed session; existing role reads are enforced", async (t) => {
  const f = await fixture(); t.after(f.cleanup);
  const url = `/${collection}/originals/private.pdf`;
  assert.equal((await f.server.inject({ method: "GET", url })).statusCode, 401);
  assert.equal((await f.server.inject({ method: "HEAD", url })).statusCode, 401);
  assert.equal((await f.server.inject({ method: "GET", url: "/api/materials/source-index" })).statusCode, 401);
  assert.equal((await f.server.inject({ method: "GET", url, headers: { cookie: await cookie(f.server,"legal") } })).statusCode, 403);
  const forbidden = await f.server.inject({ method: "GET", url: "/api/materials/source-index", headers: { cookie: await cookie(f.server,"legal") } });
  assert.deepEqual(forbidden.json(), { materials: [] });
  const allowed = await f.server.inject({ method: "GET", url, headers: { cookie: await cookie(f.server,"viewer") } });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body, "PRIVATE-CONTENT-0123456789");
  assert.equal(allowed.headers["cache-control"], "private, no-store");
  assert.equal(allowed.headers["x-content-type-options"], "nosniff");
});

test("PDF byte ranges and HEAD preserve content without bypassing authorization", async (t) => {
  const f = await fixture(); t.after(f.cleanup);
  const url = `/${collection}/originals/private.pdf`;
  const response = await f.server.inject({ method: "GET", url, headers: { cookie: await cookie(f.server), range: "bytes=0-6" } });
  assert.equal(response.statusCode, 206); assert.equal(response.body, "PRIVATE");
  const suffix = await f.server.inject({ method: "GET", url, headers: { cookie: await cookie(f.server), range: "bytes=-3" } });
  assert.equal(suffix.body, "789");
  const head = await f.server.inject({ method: "HEAD", url, headers: { cookie: await cookie(f.server) } });
  assert.equal(head.statusCode, 200); assert.equal(head.body, "");
  for (const range of ["bytes=999-", "bytes=7-2", "bytes=-0", "bytes=0-1,3-4", "bytes=-"]) {
    assert.equal((await f.server.inject({ method: "GET", url, headers: { cookie: await cookie(f.server), range } })).statusCode, 416, range);
  }
});

test("files outside the registered material, page count and real storage root are rejected", async (t) => {
  const f = await fixture(); t.after(f.cleanup);
  for (const path of ["originals/unregistered.pdf", "source-index.json", "previews/pages/fixture/page-002.png", "originals/%2e%2e/%2e%2e/.env", "originals/%252e%252e/secret"]) {
    assert.equal((await f.server.inject({ method: "GET", url: `/${collection}/${path}`, headers: { cookie: await cookie(f.server) } })).statusCode, 404, path);
  }
  await rm(join(f.dir, "originals/private.pdf"));
  await writeFile(join(f.root, "outside.pdf"), "outside");
  await symlink(join(f.root, "outside.pdf"), join(f.dir, "originals/private.pdf"));
  assert.equal((await f.server.inject({ method: "GET", url: `/${collection}/originals/private.pdf`, headers: { cookie: await cookie(f.server) } })).statusCode, 404);
});

test("page images and OCR HTML stay protected, and direct HTML runs in a sandbox", async (t) => {
  const f = await fixture(); t.after(f.cleanup);
  for (const path of ["previews/pages/fixture/page-001.png", "ocr-results/fixture/combined.html"]) {
    assert.equal((await f.server.inject({ method: "GET", url: `/${collection}/${path}` })).statusCode, 401);
    const response = await f.server.inject({ method: "GET", url: `/${collection}/${path}`, headers: { cookie: await cookie(f.server) } });
    assert.equal(response.statusCode, 200);
    if (path.endsWith("html")) assert.match(String(response.headers["content-security-policy"]), /^sandbox;/);
  }
});

test("layout generation rejects symlinks in combined, raw, summary and output ancestors", async (t) => {
  const f = await fixture(); t.after(f.cleanup);
  const ocr = join(f.dir, "ocr-results/fixture");
  const outside = join(f.root, "outside.html");
  await writeFile(outside, "<html><body><p>OUTSIDE_ROOT_MARKER</p></body></html>");
  const payload = { recognizedHtmlHref: `/${collection}/ocr-results/fixture/combined.html`, page: 1 };
  for (const file of ["combined.html", "page_0001_raw.html", "summary.json"]) {
    await rm(join(ocr, file), { force: true });
    await symlink(outside, join(ocr, file));
    for (const url of ["/api/materials/preview-layout-cache", "/api/materials/preview-layout-cache/batch"]) {
      const result = await f.server.inject({ method: "POST", url, headers: { cookie: await cookie(f.server) }, payload });
      assert.equal(result.statusCode, 403, file + url);
      assert.equal(result.body.includes("OUTSIDE_ROOT_MARKER"), false);
    }
    await rm(join(ocr, file));
    if (file === "combined.html") await writeFile(join(ocr, file), "<html><body><p>Inside</p></body></html>");
  }
  const external = join(f.root, "external-layout"); await mkdir(external);
  await symlink(external, join(f.dir, "layout-cache"));
  assert.equal((await f.server.inject({ method: "POST", url: "/api/materials/preview-layout-cache", headers: { cookie: await cookie(f.server) }, payload })).statusCode, 403);
});

test("layout batch inference cannot exceed the registered page count", async (t) => {
  const f = await fixture(); t.after(f.cleanup);
  await writeFile(join(f.dir, "ocr-results/fixture/summary.json"), JSON.stringify({ pages: [{ page_no: 1 }, { page_no: 2 }] }));
  const response = await f.server.inject({ method: "POST", url: "/api/materials/preview-layout-cache/batch", headers: { cookie: await cookie(f.server) }, payload: { recognizedHtmlHref: `/${collection}/ocr-results/fixture/combined.html` } });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json().items.map((item: { page: number }) => item.page), [1]);
});
