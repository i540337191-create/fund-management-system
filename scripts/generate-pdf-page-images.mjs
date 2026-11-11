import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const projectRoot = process.cwd();
const collectionPath = "docs/source-materials/2026-06-10-fund-ops-templates";
const sourceIndexPath = join(projectRoot, collectionPath, "source-index.json");
const pageImageRootRelativePath = "previews/page-images";
const renderDpi = "120";
const force = process.argv.includes("--force");

const pdftoppmBin = resolveBinary("pdftoppm");
const sourceIndex = JSON.parse(readFileSync(sourceIndexPath, "utf8"));
const result = {
  totalPdfFiles: 0,
  rendered: 0,
  reused: 0,
  failed: [],
};

for (const material of sourceIndex.materials) {
  if (material.extension !== "pdf") continue;
  result.totalPdfFiles += 1;
  material.pdf ??= {};

  const pdfKey = inferPdfKey(material);
  const originalPdfPath = join(projectRoot, collectionPath, material.relative_path);
  const pageImageDirRelativePath = `${pageImageRootRelativePath}/${pdfKey}`;
  const pageImageDir = join(projectRoot, collectionPath, pageImageDirRelativePath);
  const pageImageManifestRelativePath = `${pageImageDirRelativePath}/manifest.json`;
  const recognizedHtmlRelativePath = material.pdf.ocr_result_dir
    ? `${material.pdf.ocr_result_dir.replace(/\/$/, "")}/combined.html`
    : null;
  const recognizedHtmlPath = recognizedHtmlRelativePath
    ? join(projectRoot, collectionPath, recognizedHtmlRelativePath)
    : null;

  material.pdf.recognized_html_path = recognizedHtmlPath && existsSync(recognizedHtmlPath)
    ? recognizedHtmlRelativePath
    : null;

  try {
    const pageCount = material.pdf.pages ?? readPdfPageCount(originalPdfPath);
    if (!pageCount || pageCount < 1) {
      throw new Error("missing_page_count");
    }

    const expectedImagePaths = createPageImageRelativePaths(pageImageDirRelativePath, pageCount);
    const hasAllImages = expectedImagePaths.every((relativePath) => existsSync(join(projectRoot, collectionPath, relativePath)));
    const manifestPath = join(projectRoot, collectionPath, pageImageManifestRelativePath);

    if (!force && hasAllImages && existsSync(manifestPath)) {
      result.reused += 1;
    } else {
      renderPdfPages(originalPdfPath, pageImageDir, pageCount);
      result.rendered += 1;
    }

    material.pdf.page_image_dir = pageImageDirRelativePath;
    material.pdf.page_image_manifest_path = pageImageManifestRelativePath;
    writeManifest({
      manifestPath,
      material,
      pageCount,
      pageImageDirRelativePath,
      expectedImagePaths,
    });
  } catch (error) {
    material.pdf.page_image_dir = null;
    material.pdf.page_image_manifest_path = null;
    result.failed.push({
      id: material.id,
      fileName: material.file_name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

sourceIndex.stats.pdf_page_image_files = result.totalPdfFiles;
sourceIndex.stats.pdf_page_image_succeeded = result.totalPdfFiles - result.failed.length;
sourceIndex.stats.pdf_page_image_failed = result.failed.length;

writeFileSync(sourceIndexPath, `${JSON.stringify(sourceIndex, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));

function renderPdfPages(originalPdfPath, pageImageDir, pageCount) {
  mkdirSync(pageImageDir, { recursive: true });
  const tempDir = mkdtempSync(join(tmpdir(), "fundapp-pdf-pages-"));
  try {
    const outputPrefix = join(tempDir, "page");
    const result = spawnSync(pdftoppmBin, ["-png", "-r", renderDpi, originalPdfPath, outputPrefix], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });

    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || `pdftoppm exited ${result.status}`).trim());
    }

    const renderedFiles = readdirSync(tempDir)
      .map((fileName) => {
        const match = fileName.match(/^page-(\d+)\.png$/);
        return match ? { page: Number.parseInt(match[1], 10), fileName } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.page - right.page);

    if (renderedFiles.length !== pageCount) {
      throw new Error(`rendered ${renderedFiles.length} pages, expected ${pageCount}`);
    }

    for (const rendered of renderedFiles) {
      const targetPath = join(pageImageDir, `page-${String(rendered.page).padStart(3, "0")}.png`);
      copyFileSync(join(tempDir, rendered.fileName), targetPath);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeManifest({
  manifestPath,
  material,
  pageCount,
  pageImageDirRelativePath,
  expectedImagePaths,
}) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  const manifest = {
    material_id: material.id,
    file_name: material.file_name,
    source_pdf: material.relative_path,
    page_count: pageCount,
    image_format: "png",
    render_dpi: Number.parseInt(renderDpi, 10),
    generated_at: new Date().toISOString(),
    pages: expectedImagePaths.map((relativePath, index) => ({
      page: index + 1,
      image_path: relativePath,
      href: `/${collectionPath}/${relativePath}`,
    })),
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function createPageImageRelativePaths(pageImageDirRelativePath, pageCount) {
  return Array.from({ length: pageCount }, (_, index) => `${pageImageDirRelativePath}/page-${String(index + 1).padStart(3, "0")}.png`);
}

function inferPdfKey(material) {
  if (material.pdf?.ocr_result_dir) return basename(material.pdf.ocr_result_dir);
  return material.id;
}

function readPdfPageCount(pdfPath) {
  const pdfinfoBin = resolveBinary("pdfinfo");
  const result = spawnSync(pdfinfoBin, [pdfPath], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const match = result.stdout.match(/^Pages:\s+(\d+)/m);
  return match ? Number.parseInt(match[1], 10) : null;
}

function resolveBinary(name) {
  const candidates = [
    join(projectRoot, "node_modules/.bin", name),
    `/tmp/demo-user/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (match) return match;

  const which = spawnSync("which", [name], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  throw new Error(`${name} is required to generate PDF page images`);
}
