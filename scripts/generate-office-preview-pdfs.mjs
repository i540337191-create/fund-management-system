import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const collectionPath = "docs/source-materials/2026-06-10-fund-ops-templates";
const sourceIndexPath = join(projectRoot, collectionPath, "source-index.json");
const previewDirRelativePath = "previews/office-pdf";
const pageImageRootRelativePath = "previews/office-page-images";
const previewDir = join(projectRoot, collectionPath, previewDirRelativePath);
const officeExtensions = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"]);
const renderDpi = "120";
const force = process.argv.includes("--force");
const sofficePath = resolveSofficePath();
const pdftoppmPath = resolveBinary("pdftoppm");
const pdfinfoPath = resolveBinary("pdfinfo");

if (!existsSync(sofficePath)) {
  throw new Error(`soffice_not_found:${sofficePath}`);
}

mkdirSync(previewDir, { recursive: true });

const sourceIndex = JSON.parse(readFileSync(sourceIndexPath, "utf8"));
const result = {
  totalOfficeFiles: 0,
  converted: 0,
  reused: 0,
  pageImagesRendered: 0,
  pageImagesReused: 0,
  failed: [],
};

for (const material of sourceIndex.materials ?? []) {
  const extension = String(material.extension ?? "").toLowerCase();
  if (!officeExtensions.has(extension)) continue;

  result.totalOfficeFiles += 1;
  const sourcePath = join(projectRoot, collectionPath, material.relative_path);
  const previewRelativePath = `${previewDirRelativePath}/${material.id}.pdf`;
  const previewPath = join(projectRoot, collectionPath, previewRelativePath);
  const pageImageDirRelativePath = `${pageImageRootRelativePath}/${material.id}`;
  const pageImageDir = join(projectRoot, collectionPath, pageImageDirRelativePath);
  const pageImageManifestRelativePath = `${pageImageDirRelativePath}/manifest.json`;
  const pageImageManifestPath = join(projectRoot, collectionPath, pageImageManifestRelativePath);
  material.preview_path = previewRelativePath;

  if (!force && existsSync(previewPath)) {
    result.reused += 1;
  } else {
    const tempDir = mkdtempSync(join(tmpdir(), "fund-management-office-preview-"));
    const userProfileDir = mkdtempSync(join(tmpdir(), "fund-management-lo-profile-"));
    const cacheDir = mkdtempSync(join(tmpdir(), "fund-management-lo-cache-"));
    try {
      const conversion = spawnSync(
        sofficePath,
        ["--headless", `-env:UserInstallation=file://${userProfileDir}`, "--convert-to", "pdf", "--outdir", tempDir, sourcePath],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            XDG_CACHE_HOME: cacheDir,
          },
          timeout: 120000,
        },
      );
      if (conversion.status !== 0) {
        result.failed.push({
          id: material.id,
          fileName: material.file_name,
          status: conversion.status,
          stderr: conversion.stderr.trim(),
        });
        continue;
      }

      const convertedPdf = readdirSync(tempDir).find((fileName) => extname(fileName).toLowerCase() === ".pdf");
      if (!convertedPdf) {
        result.failed.push({
          id: material.id,
          fileName: material.file_name,
          status: "missing_pdf",
          stderr: conversion.stderr.trim(),
        });
        continue;
      }

      if (existsSync(previewPath)) unlinkSync(previewPath);
      copyFileSync(join(tempDir, convertedPdf), previewPath);
      result.converted += 1;
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
      rmSync(userProfileDir, { force: true, recursive: true });
      rmSync(cacheDir, { force: true, recursive: true });
    }
  }

  try {
    const pageCount = readPdfPageCount(previewPath);
    if (!pageCount || pageCount < 1) throw new Error("missing_preview_page_count");

    const expectedImagePaths = createPageImageRelativePaths(pageImageDirRelativePath, pageCount);
    const hasAllImages = expectedImagePaths.every((relativePath) => existsSync(join(projectRoot, collectionPath, relativePath)));

    if (!force && hasAllImages && existsSync(pageImageManifestPath)) {
      result.pageImagesReused += 1;
    } else {
      renderPdfPages(previewPath, pageImageDir, pageCount);
      result.pageImagesRendered += 1;
    }

    material.preview_page_image_dir = pageImageDirRelativePath;
    material.preview_page_image_manifest_path = pageImageManifestRelativePath;
    material.preview_page_image_pages = pageCount;
    writePageImageManifest({
      manifestPath: pageImageManifestPath,
      material,
      pageCount,
      pageImageDirRelativePath,
      expectedImagePaths,
      previewRelativePath,
    });
  } catch (error) {
    material.preview_page_image_dir = null;
    material.preview_page_image_manifest_path = null;
    material.preview_page_image_pages = null;
    result.failed.push({
      id: material.id,
      fileName: material.file_name,
      status: "page_image_failed",
      stderr: error instanceof Error ? error.message : String(error),
    });
  }
}

sourceIndex.stats = {
  ...(sourceIndex.stats ?? {}),
  office_preview_files: result.totalOfficeFiles,
  office_preview_succeeded: result.totalOfficeFiles - result.failed.length,
  office_preview_failed: result.failed.length,
  office_preview_page_image_files: result.totalOfficeFiles,
  office_preview_page_image_succeeded: result.totalOfficeFiles - result.failed.length,
  office_preview_page_image_failed: result.failed.length,
};

writeFileSync(sourceIndexPath, `${JSON.stringify(sourceIndex, null, 2)}\n`);

console.log(JSON.stringify(result, null, 2));
if (result.failed.length > 0) {
  process.exitCode = 1;
}

function resolveSofficePath() {
  const candidates = [
    process.env.SOFFICE_BIN,
    join(process.env.HOME ?? "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/soffice"),
    "/opt/homebrew/bin/soffice",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  const lookup = spawnSync("which", ["soffice"], { encoding: "utf8" });
  const path = lookup.stdout.trim();
  return path || "soffice";
}

function renderPdfPages(pdfPath, pageImageDir, pageCount) {
  mkdirSync(pageImageDir, { recursive: true });
  const tempDir = mkdtempSync(join(tmpdir(), "fundapp-office-pages-"));
  try {
    const outputPrefix = join(tempDir, "page");
    const result = spawnSync(pdftoppmPath, ["-png", "-r", renderDpi, pdfPath, outputPrefix], {
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

function writePageImageManifest({
  manifestPath,
  material,
  pageCount,
  pageImageDirRelativePath,
  expectedImagePaths,
  previewRelativePath,
}) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  const manifest = {
    material_id: material.id,
    file_name: material.file_name,
    source_file: material.relative_path,
    preview_pdf: previewRelativePath,
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

function readPdfPageCount(pdfPath) {
  const result = spawnSync(pdfinfoPath, [pdfPath], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const match = result.stdout.match(/^Pages:\s+(\d+)/m);
  return match ? Number.parseInt(match[1], 10) : null;
}

function resolveBinary(name) {
  const candidates = [
    join(projectRoot, "node_modules/.bin", name),
    join(process.env.HOME ?? "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin", name),
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (match) return match;

  const lookup = spawnSync("which", [name], { encoding: "utf8" });
  const path = lookup.stdout.trim();
  if (lookup.status === 0 && path) return path;
  throw new Error(`${name} is required to generate Office page previews`);
}
