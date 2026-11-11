import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const collectionPath = "docs/source-materials/2026-06-10-fund-ops-templates";
const sourceIndexPath = join(projectRoot, collectionPath, "source-index.json");
const outputPath = join(projectRoot, "src/data/sourceMaterialTextChunks.ts");
const chunkSize = 900;
const chunkOverlap = 120;

const sourceIndex = JSON.parse(readFileSync(sourceIndexPath, "utf8"));
const chunks = [];
const pageKeys = new Set();
const documentIds = new Set();

for (const material of sourceIndex.materials) {
  const recognizedTextPath = material.pdf?.recognized_text_path;
  if (!recognizedTextPath) continue;

  const textPath = `${collectionPath}/${recognizedTextPath}`;
  const recognizedHtmlPath = material.pdf?.recognized_html_path
    ? `${collectionPath}/${material.pdf.recognized_html_path}`
    : null;
  const pageImageDir = material.pdf?.page_image_dir ? `${collectionPath}/${material.pdf.page_image_dir}` : null;
  const text = readFileSync(join(projectRoot, textPath), "utf8");
  const pages = parsePages(text);
  documentIds.add(material.id);

  for (const page of pages) {
    pageKeys.add(`${material.id}:${page.page}`);
    const pageChunks = createChunks(page.text, chunkSize, chunkOverlap);
    pageChunks.forEach((chunkText, chunkIndex) => {
      chunks.push({
        id: `${material.id}-p${page.page}-c${chunkIndex + 1}`,
        materialId: material.id,
        fileName: material.file_name,
        category: material.category,
        projectOrFund: material.project_or_fund,
        archivePath: material.archive_path,
        page: page.page,
        chunkIndex: chunkIndex + 1,
        text: chunkText,
        recognizedTextPath: textPath,
        recognizedTextHref: `/${textPath}#page-${page.page}`,
        recognizedHtmlPath,
        recognizedHtmlHref: recognizedHtmlPath ? `/${recognizedHtmlPath}` : undefined,
        originalPath: `${collectionPath}/${material.relative_path}`,
        originalDocumentHref: `/${collectionPath}/${material.relative_path}#page=${page.page}`,
        originalPageImageHref: pageImageDir ? `/${pageImageDir}/page-${String(page.page).padStart(3, "0")}.png` : undefined,
      });
    });
  }
}

const file = [
  "import type { MaterialTextChunk } from \"../lib/materialRag\";",
  "",
  "export const sourceMaterialTextChunkSummary = " +
    JSON.stringify(
      {
        source: collectionPath,
        generatedAt: sourceIndex.stats?.generated_at ?? "",
        totalDocuments: documentIds.size,
        totalPages: pageKeys.size,
        totalChunks: chunks.length,
        chunkSize,
        chunkOverlap,
      },
      null,
      2,
    ) +
    " as const;",
  "",
  "export const sourceMaterialTextChunks = " + JSON.stringify(chunks, null, 2) + " satisfies MaterialTextChunk[];",
  "",
].join("\n");

writeFileSync(outputPath, file);
console.log(`wrote ${chunks.length} chunks from ${documentIds.size} documents to ${outputPath}`);

function parsePages(text) {
  const parts = text.split(/^# Page (\d+)\s*$/m).slice(1);
  const pages = [];

  for (let index = 0; index < parts.length; index += 2) {
    const page = Number(parts[index]);
    const pageText = normalizeText(parts[index + 1] ?? "");
    if (Number.isInteger(page) && pageText) {
      pages.push({ page, text: pageText });
    }
  }

  return pages;
}

function createChunks(text, size, overlap) {
  if (text.length <= size) return [text];

  const chunks = [];
  const step = size - overlap;
  for (let start = 0; start < text.length; start += step) {
    const slice = text.slice(start, start + size).trim();
    if (slice.length >= 30) chunks.push(slice);
  }
  return chunks;
}

function normalizeText(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
