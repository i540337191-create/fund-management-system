import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SourceMaterialImportMaterial = {
  id: string;
  fundName: string;
  name: string;
  category: string;
  uploader: string;
  archivedAt: string;
  source: string;
  status: string;
  citationCount: number;
  archivePath: string;
  originalFilePath: string;
  previewFilePath: string | null;
  recognizedTextPath: string | null;
  recognizedHtmlPath: string | null;
  pageImageManifestPath: string | null;
  pageImageDir: string | null;
  sourceMaterialId: string;
  fileExtension: string;
  sizeBytes: number;
  sha256: string;
  primaryScope: "fund" | "project" | "company" | "investor" | "unassigned";
  dataOrigin: "source_pdf_ocr" | "source_file";
};

export type SourceMaterialFundRelation = {
  materialId: string;
  fundName: string;
  relationType: "primary" | "linked";
  isPrimary: boolean;
};

export type SourceMaterialInvestorRelation = {
  materialId: string;
  fundName: string;
  investorName: string;
  relationType: "subject";
  isPrimary: boolean;
};

export type SourceMaterialProjectRelation = {
  materialId: string;
  projectName: string;
  relationType: "linked";
  isPrimary: boolean;
};

export type SourceMaterialCompanyRelation = {
  materialId: string;
  companyName: string;
  relationType: "linked";
  isPrimary: boolean;
};

export type SourceMaterialTextChunkImport = {
  id: string;
  materialId: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  recognizedTextPath: string;
  originalFilePath: string;
};

export type SourceMaterialImportPlan = {
  collectionPath: string;
  materials: SourceMaterialImportMaterial[];
  fundRelations: SourceMaterialFundRelation[];
  projectRelations: SourceMaterialProjectRelation[];
  companyRelations: SourceMaterialCompanyRelation[];
  investorRelations: SourceMaterialInvestorRelation[];
  textChunks: SourceMaterialTextChunkImport[];
};

type SourceIndex = {
  materials: SourceIndexMaterial[];
};

type SourceIndexMaterial = {
  id: string;
  file_name: string;
  relative_path: string;
  preview_path?: string | null;
  extension: string;
  size_bytes: number;
  sha256: string;
  category: string;
  archive_path: string;
  project_or_fund: string;
  uploader: string;
  archived_at: string;
  source: string;
  material_status: string;
  material_record?: string[];
  pdf?: {
    recognized_text_path?: string | null;
    recognized_html_path?: string | null;
    page_image_manifest_path?: string | null;
    page_image_dir?: string | null;
  };
};

const DEFAULT_COLLECTION_PATH = "docs/source-materials/2026-06-10-fund-ops-templates";
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;

export function createSourceMaterialImportPlan({
  projectRoot,
  collectionPath = DEFAULT_COLLECTION_PATH,
}: {
  projectRoot: string;
  collectionPath?: string;
}): SourceMaterialImportPlan {
  const sourceIndex = readSourceIndex(projectRoot, collectionPath);
  const materials: SourceMaterialImportMaterial[] = [];
  const fundRelations: SourceMaterialFundRelation[] = [];
  const investorRelations: SourceMaterialInvestorRelation[] = [];
  const textChunks: SourceMaterialTextChunkImport[] = [];

  for (const material of sourceIndex.materials) {
    const recognizedTextPath = material.pdf?.recognized_text_path
      ? `${collectionPath}/${material.pdf.recognized_text_path}`
      : null;
    const recognizedHtmlPath = material.pdf?.recognized_html_path
      ? `${collectionPath}/${material.pdf.recognized_html_path}`
      : null;
    const pageImageManifestPath = material.pdf?.page_image_manifest_path
      ? `${collectionPath}/${material.pdf.page_image_manifest_path}`
      : null;
    const pageImageDir = material.pdf?.page_image_dir ? `${collectionPath}/${material.pdf.page_image_dir}` : null;
    const originalFilePath = `${collectionPath}/${material.relative_path}`;
    const previewFilePath = material.preview_path ? `${collectionPath}/${material.preview_path}` : null;

    materials.push({
      id: material.id,
      fundName: material.project_or_fund,
      name: material.file_name,
      category: material.category,
      uploader: material.uploader,
      archivedAt: material.archived_at,
      source: material.source,
      status: material.material_status,
      citationCount: parseCitationCount(material.material_record?.[6]),
      archivePath: material.archive_path,
      originalFilePath,
      previewFilePath,
      recognizedTextPath,
      recognizedHtmlPath,
      pageImageManifestPath,
      pageImageDir,
      sourceMaterialId: material.id,
      fileExtension: material.extension,
      sizeBytes: material.size_bytes,
      sha256: material.sha256,
      primaryScope: inferPrimaryScope(material),
      dataOrigin: recognizedTextPath ? "source_pdf_ocr" : "source_file",
    });

    if (material.project_or_fund) {
      fundRelations.push({
        materialId: material.id,
        fundName: material.project_or_fund,
        relationType: "primary",
        isPrimary: true,
      });
    }

    if (recognizedTextPath) {
      const recognizedText = readFileSync(join(projectRoot, recognizedTextPath), "utf8");
      for (const investorName of inferInvestorNames(material, recognizedText)) {
        investorRelations.push({
          materialId: material.id,
          fundName: material.project_or_fund,
          investorName,
          relationType: "subject",
          isPrimary: false,
        });
      }

      for (const page of parsePages(recognizedText)) {
        const chunks = createChunks(page.text, CHUNK_SIZE, CHUNK_OVERLAP);
        chunks.forEach((content, index) => {
          textChunks.push({
            id: `${material.id}-p${page.pageNumber}-c${index + 1}`,
            materialId: material.id,
            pageNumber: page.pageNumber,
            chunkIndex: index + 1,
            content,
            recognizedTextPath,
            originalFilePath,
          });
        });
      }
    }
  }

  return {
    collectionPath,
    materials,
    fundRelations,
    projectRelations: [],
    companyRelations: [],
    investorRelations: uniqueBy(investorRelations, (relation) => `${relation.materialId}:${relation.investorName}`),
    textChunks,
  };
}

function readSourceIndex(projectRoot: string, collectionPath: string): SourceIndex {
  return JSON.parse(readFileSync(join(projectRoot, collectionPath, "source-index.json"), "utf8")) as SourceIndex;
}

function inferPrimaryScope(material: SourceIndexMaterial): SourceMaterialImportMaterial["primaryScope"] {
  if (material.category.includes("投资者")) return "investor";
  if (material.archive_path.startsWith("项目档案")) return "project";
  if (material.archive_path.includes("被投")) return "company";
  if (material.project_or_fund) return "fund";
  return "unassigned";
}

function parseCitationCount(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferInvestorNames(material: SourceIndexMaterial, recognizedText: string) {
  if (!isInvestorMaterial(material)) return [];

  const names = [
    ...extractAfterLabel(recognizedText, "投资者姓名\\s*\\n/名称"),
    ...extractAfterLabel(recognizedText, "投资者名称"),
    ...extractAfterLabel(recognizedText, "机构名称"),
  ];

  return uniqueBy(
    names
      .map((name) => name.replace(/[：:]/g, "").trim())
      .filter((name) => name.length >= 4 && !name.includes("姓名") && !name.includes("名称") && !name.includes("证件")),
    (name) => name,
  );
}

function isInvestorMaterial(material: SourceIndexMaterial) {
  return (
    material.category.includes("投资者") ||
    /投资者|风险匹配|风险测评|合格投资者|税收居民|回访确认/.test(material.file_name)
  );
}

function extractAfterLabel(text: string, labelPattern: string) {
  const matches = Array.from(text.matchAll(new RegExp(`${labelPattern}\\s*\\n([^\\n]+)`, "g")));
  return matches.map((match) => match[1]);
}

function parsePages(text: string) {
  const parts = text.split(/^# Page (\d+)\s*$/m).slice(1);
  const pages: { pageNumber: number; text: string }[] = [];

  for (let index = 0; index < parts.length; index += 2) {
    const pageNumber = Number(parts[index]);
    const pageText = normalizeText(parts[index + 1] ?? "");
    if (Number.isInteger(pageNumber) && pageText) {
      pages.push({ pageNumber, text: pageText });
    }
  }

  return pages;
}

function createChunks(text: string, size: number, overlap: number) {
  if (text.length <= size) return [text];

  const chunks: string[] = [];
  const step = size - overlap;
  for (let start = 0; start < text.length; start += step) {
    const slice = text.slice(start, start + size).trim();
    if (slice.length >= 30) chunks.push(slice);
  }
  return chunks;
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}
