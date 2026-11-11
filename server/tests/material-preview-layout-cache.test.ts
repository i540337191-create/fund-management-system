import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createMemoryLedgerStore } from "../src/ledger/store.ts";
import { createServer } from "../src/index.ts";

test("material preview layout cache endpoint writes reusable page layout JSON", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "fundapp-material-preview-"));
  const ocrDir = join(projectRoot, "docs/source-materials/2026-06-10-fund-ops-templates/ocr-results/pdf-001");
  await mkdir(ocrDir, { recursive: true });
  await writeFile(join(ocrDir, "combined.html"), "<html><body>combined</body></html>", "utf8");
  await writeFile(
    join(ocrDir, "page_0012_raw.html"),
    `<!DOCTYPE html>
<html>
<head>
  <style>
    .page { width: 794px; height: 1123px; position: relative; }
    .content-crop { position: absolute; left: 124.52px; top: 67.87px; width: 565px; min-height: 923px; }
    .crop-page { width: 565px; height: 923px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="content-crop">
      <div class="crop-page">
        <div class="content">
          <div class="title">演示机构投资人A</div>
          <div class="paragraph">公司以持续经营为基础编制财务报表。</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`,
    "utf8",
  );
  await writeFile(
    join(ocrDir, "page_0013_raw.html"),
    `<!DOCTYPE html>
<html>
<head>
  <style>
    .page { width: 794px; height: 1123px; position: relative; }
    .content-crop { position: absolute; left: 100px; top: 80px; width: 600px; min-height: 900px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="content-crop">
      <table><tr><th>项目</th><th>金额</th></tr><tr><td>货币资金</td><td>100.00</td></tr></table>
    </div>
  </div>
</body>
</html>`,
    "utf8",
  );
  await writeFile(
    join(ocrDir, "summary.json"),
    JSON.stringify({
      pages: [
        {
          page_no: 12,
          page_type: "text",
          rotation: 0,
          pdf_rotation: 0,
          metadata: {
            page_size: [794, 1123],
            content_position: {
              left: 124.52,
              top: 67.87,
              width: 564.95,
              height: 923.39,
            },
          },
          tables: 0,
          rows: 0,
          cells: 0,
        },
        {
          page_no: 13,
          page_type: "table",
          rotation: 0,
          pdf_rotation: 0,
          metadata: {
            page_size: [794, 1123],
            content_position: {
              left: 100,
              top: 80,
              width: 600,
              height: 900,
            },
          },
          tables: 1,
          rows: 2,
          cells: 4,
        },
      ],
    }),
    "utf8",
  );

  await writeFile(join(projectRoot, "docs/source-materials/2026-06-10-fund-ops-templates/source-index.json"), JSON.stringify({ materials: [{ id: "fixture", relative_path: "originals/fixture.pdf", pdf: { recognized_html_path: "ocr-results/pdf-001/combined.html", pages: 13 } }] }));
  const store = createMemoryLedgerStore();
  const listMaterials = store.listMaterials;
  store.listMaterials = async () => [...await listMaterials(), { id: "fixture", sourceMaterialId: "fixture", fundId: "fundapp-growth-i", projectId: null, name: "fixture", type: "pdf", uploader: "test", time: "2026-10-29", source: "test", status: "test", quotes: "0", project: "test" }];
  const server = createServer({ auth: { mode: "local-bypass" }, ledgerStore: store, materialPreviewProjectRoot: projectRoot });
  const response = await server.inject({
    method: "POST",
    url: "/api/materials/preview-layout-cache",
    payload: {
      recognizedHtmlHref: "/docs/source-materials/2026-06-10-fund-ops-templates/ocr-results/pdf-001/combined.html",
      page: 12,
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().relativePath, "docs/source-materials/2026-06-10-fund-ops-templates/layout-cache/pdf-001/page-012.json");
  assert.equal(response.json().cache.version, "material-preview-layout-cache/v1");
  assert.equal(response.json().cache.page.pageBox.width, 794);
  assert.equal(response.json().cache.page.contentBox.left, 124.52);
  assert.equal(response.json().cache.blocks.length, 2);
  assert.match(response.json().cache.render.html, /ocr-document-page/);

  const written = JSON.parse(await readFile(join(projectRoot, response.json().relativePath), "utf8"));
  assert.equal(written.page.number, 12);
  assert.equal(written.blocks[0].type, "title");

  const batchResponse = await server.inject({
    method: "POST",
    url: "/api/materials/preview-layout-cache/batch",
    payload: {
      recognizedHtmlHref: "/docs/source-materials/2026-06-10-fund-ops-templates/ocr-results/pdf-001/combined.html",
      pages: [12, 13],
    },
  });

  assert.equal(batchResponse.statusCode, 201);
  assert.equal(batchResponse.json().generatedCount, 2);
  assert.deepEqual(
    batchResponse.json().items.map((item: { page: number }) => item.page),
    [12, 13],
  );
  assert.equal(batchResponse.json().items[1].tableCount, 1);

  const batchWritten = JSON.parse(
    await readFile(join(projectRoot, "docs/source-materials/2026-06-10-fund-ops-templates/layout-cache/pdf-001/page-013.json"), "utf8"),
  );
  assert.equal(batchWritten.page.kind, "table");
  assert.equal(batchWritten.metrics.tableCount, 1);

  await rm(projectRoot, { recursive: true, force: true });
});
