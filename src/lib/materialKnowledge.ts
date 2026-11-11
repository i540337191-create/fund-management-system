export type SourceMaterialPdfInfo = {
  pages: number | null;
  text_extractable: boolean | null;
  ocr_status: "succeeded" | "failed";
  ocr_job_id: string | null;
  ocr_error: string | null;
  ocr_result_dir: string | null;
  recognized_html_path?: string | null;
  page_image_manifest_path?: string | null;
  page_image_dir?: string | null;
  recognized_text_path: string | null;
  local_text_path: string | null;
  ocr_text_chars: number | null;
};

export type SourceMaterialSourceEntry = {
  id: string;
  file_name: string;
  relative_path: string;
  preview_path?: string | null;
  preview_page_image_dir?: string | null;
  preview_page_image_manifest_path?: string | null;
  preview_page_image_pages?: number | null;
  extension: string;
  size_bytes: number;
  sha256: string;
  business_area: string;
  category: string;
  archive_path: string;
  project_or_fund: string;
  uploader: string;
  archived_at: string;
  source: string;
  material_status: string;
  use_case: string;
  summary: string;
  material_record: string[];
  pdf?: SourceMaterialPdfInfo;
};

export type SourceMaterialSourceIndex = {
  stats: {
    source_directory: string;
    project_directory: string;
    generated_at: string;
    total_files: number;
    pdf_files: number;
    ocr_api_succeeded: number;
    ocr_api_failed: number;
    pdf_page_image_files?: number;
    pdf_page_image_succeeded?: number;
    pdf_page_image_failed?: number;
    by_category: Record<string, number>;
  };
  materials: SourceMaterialSourceEntry[];
};

export type MaterialKnowledgeReadiness = "full_text" | "metadata" | "blocked";
export type MaterialKnowledgeTextSource = "ocr_api" | "local_text";
export type MaterialKnowledgeApiOcrStatus = "succeeded" | "failed" | "not_pdf";

export type MaterialKnowledgeEntry = {
  id: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  businessArea: string;
  category: string;
  archivePath: string;
  projectOrFund: string;
  uploader: string;
  archivedAt: string;
  source: string;
  materialStatus: string;
  useCase: string;
  summary: string;
  materialRecord: string[];
  originalPath: string;
  previewPath?: string;
  previewPageImageManifestPath?: string;
  previewPageImageDir?: string;
  previewPageImages?: MaterialPageImage[];
  ocrResultDir?: string;
  recognizedHtmlPath?: string;
  pageImageManifestPath?: string;
  pageImageDir?: string;
  pageImages?: MaterialPageImage[];
  recognizedTextPath?: string;
  localTextPath?: string;
  textPath?: string;
  textSource?: MaterialKnowledgeTextSource;
  pageCount?: number;
  ocrTextChars?: number;
  apiOcrStatus: MaterialKnowledgeApiOcrStatus;
  ocrError?: string;
  readiness: MaterialKnowledgeReadiness;
  aiSearchable: boolean;
  contentSearchable: boolean;
  needsReview: boolean;
  aiUseCases: string[];
};

export type MaterialPageImage = {
  page: number;
  path: string;
  href: string;
};

export type MaterialKnowledgeFilters = {
  query?: string;
  category?: string;
  projectOrFund?: string;
  archivePath?: string;
  readiness?: MaterialKnowledgeReadiness | "searchable" | "needs_review";
  apiOcrStatus?: MaterialKnowledgeApiOcrStatus;
};

export type MaterialKnowledgeSummary = {
  total: number;
  pdf: number;
  apiOcrSucceeded: number;
  apiOcrFailed: number;
  fullTextReady: number;
  metadataOnly: number;
  blocked: number;
  needsReview: number;
  byCategory: Record<string, number>;
};

export type MaterialEvidenceLink = {
  kind: "recognized_text" | "recognized_html" | "original_page_images" | "preview_document" | "original_document";
  label: "查看识别文本" | "查看识别 HTML" | "查看原始页图" | "查看预览文档" | "下载原始文件";
  path: string;
  href: string;
  available: boolean;
};

export const SOURCE_MATERIAL_COLLECTION_PATH = "docs/source-materials/2026-06-10-fund-ops-templates";

export function createMaterialKnowledgeEntries(
  materials: SourceMaterialSourceEntry[],
  basePath = SOURCE_MATERIAL_COLLECTION_PATH,
): MaterialKnowledgeEntry[] {
  return materials.map((material) => {
    const recognizedTextPath = createCollectionPath(basePath, material.pdf?.recognized_text_path);
    const localTextPath = createCollectionPath(basePath, material.pdf?.local_text_path);
    const previewPath = createCollectionPath(basePath, material.preview_path);
    const previewPageImageManifestPath = createCollectionPath(basePath, material.preview_page_image_manifest_path);
    const previewPageImageDir = createCollectionPath(basePath, material.preview_page_image_dir);
    const recognizedHtmlPath = createCollectionPath(basePath, material.pdf?.recognized_html_path);
    const pageImageManifestPath = createCollectionPath(basePath, material.pdf?.page_image_manifest_path);
    const pageImageDir = createCollectionPath(basePath, material.pdf?.page_image_dir);
    const textPath = recognizedTextPath ?? localTextPath;
    const textSource = recognizedTextPath ? "ocr_api" : localTextPath ? "local_text" : undefined;
    const apiOcrStatus: MaterialKnowledgeApiOcrStatus = material.pdf?.ocr_status ?? "not_pdf";
    const readiness = inferReadiness(material, textPath);

    return {
      id: material.id,
      fileName: material.file_name,
      extension: material.extension,
      sizeBytes: material.size_bytes,
      sha256: material.sha256,
      businessArea: material.business_area,
      category: material.category,
      archivePath: material.archive_path,
      projectOrFund: material.project_or_fund,
      uploader: material.uploader,
      archivedAt: material.archived_at,
      source: material.source,
      materialStatus: material.material_status,
      useCase: material.use_case,
      summary: material.summary,
      materialRecord: material.material_record,
      originalPath: createCollectionPath(basePath, material.relative_path) ?? material.relative_path,
      ocrResultDir: createCollectionPath(basePath, material.pdf?.ocr_result_dir),
      recognizedHtmlPath,
      previewPageImageManifestPath,
      previewPageImageDir,
      previewPageImages: createMaterialPageImages(previewPageImageDir, material.preview_page_image_pages),
      pageImageManifestPath,
      pageImageDir,
      pageImages: createMaterialPageImages(pageImageDir, material.pdf?.pages ?? undefined),
      recognizedTextPath,
      localTextPath,
      textPath,
      textSource,
      pageCount: material.pdf?.pages ?? undefined,
      ocrTextChars: material.pdf?.ocr_text_chars ?? undefined,
      apiOcrStatus,
      ocrError: material.pdf?.ocr_error ?? undefined,
      readiness,
      aiSearchable: readiness !== "blocked",
      contentSearchable: readiness === "full_text",
      needsReview: readiness === "blocked" || material.material_status === "待复核",
      aiUseCases: inferAiUseCases(material),
      previewPath,
    };
  });
}

export function summarizeMaterialKnowledge(entries: MaterialKnowledgeEntry[]): MaterialKnowledgeSummary {
  return entries.reduce<MaterialKnowledgeSummary>(
    (summary, entry) => {
      summary.total += 1;
      if (entry.extension === "pdf") summary.pdf += 1;
      if (entry.apiOcrStatus === "succeeded") summary.apiOcrSucceeded += 1;
      if (entry.apiOcrStatus === "failed") summary.apiOcrFailed += 1;
      if (entry.readiness === "full_text") summary.fullTextReady += 1;
      if (entry.readiness === "metadata") summary.metadataOnly += 1;
      if (entry.readiness === "blocked") summary.blocked += 1;
      if (entry.needsReview) summary.needsReview += 1;
      summary.byCategory[entry.category] = (summary.byCategory[entry.category] ?? 0) + 1;
      return summary;
    },
    {
      total: 0,
      pdf: 0,
      apiOcrSucceeded: 0,
      apiOcrFailed: 0,
      fullTextReady: 0,
      metadataOnly: 0,
      blocked: 0,
      needsReview: 0,
      byCategory: {},
    },
  );
}

export function filterMaterialKnowledge(
  entries: MaterialKnowledgeEntry[],
  filters: MaterialKnowledgeFilters = {},
) {
  const query = normalize(filters.query);
  const category = normalizeOption(filters.category);
  const projectOrFund = normalizeOption(filters.projectOrFund);
  const archivePath = normalizeOption(filters.archivePath);

  return entries.filter((entry) => {
    const queryMatches = !query || createSearchText(entry).includes(query);
    const categoryMatches = !category || normalize(entry.category) === category;
    const projectMatches = !projectOrFund || normalize(entry.projectOrFund) === projectOrFund;
    const archiveMatches = !archivePath || normalize(entry.archivePath).includes(archivePath);
    const readinessMatches = matchesReadiness(entry, filters.readiness);
    const apiOcrMatches = !filters.apiOcrStatus || entry.apiOcrStatus === filters.apiOcrStatus;

    return queryMatches && categoryMatches && projectMatches && archiveMatches && readinessMatches && apiOcrMatches;
  });
}

export function materialKnowledgeToAiContext(
  entries: MaterialKnowledgeEntry[],
  {
    includeBlocked = false,
    limit = 12,
    maxSummaryChars = 180,
  }: {
    includeBlocked?: boolean;
    limit?: number;
    maxSummaryChars?: number;
  } = {},
) {
  return entries
    .filter((entry) => includeBlocked || entry.readiness !== "blocked")
    .slice(0, limit)
    .map((entry) => {
      const lines = [
        `- 文件：${entry.fileName}`,
        `  归属：${entry.projectOrFund}`,
        `  类型：${entry.category}`,
        `  归档路径：${entry.archivePath}`,
        `  AI状态：${readinessLabel[entry.readiness]}`,
        `  原始文件：${entry.originalPath}`,
        entry.pageImageManifestPath ? `  原始页图：${entry.pageImageManifestPath}` : null,
        entry.previewPageImageManifestPath ? `  预览页图：${entry.previewPageImageManifestPath}` : null,
        entry.recognizedHtmlPath ? `  识别HTML：${entry.recognizedHtmlPath}` : null,
        entry.previewPath ? `  预览文件：${entry.previewPath}` : null,
        entry.textPath ? `  文本索引：${entry.textPath}` : null,
        `  证据入口：${createMaterialEvidenceLinks(entry)
          .filter((link) => link.available)
          .map((link) => `${link.label}=${link.href}`)
          .join("；")}`,
        `  使用场景：${entry.aiUseCases.join("；")}`,
        `  摘要：${truncate(entry.summary, maxSummaryChars)}`,
      ];

      return lines.filter(Boolean).join("\n");
    })
    .join("\n");
}

export function createMaterialEvidenceLinks(entry: MaterialKnowledgeEntry): MaterialEvidenceLink[] {
  return [
    {
      kind: "recognized_text",
      label: "查看识别文本",
      path: entry.textPath ?? "",
      href: entry.textPath ? createMaterialEvidenceHref(entry.textPath) : "",
      available: Boolean(entry.textPath),
    },
    ...(entry.recognizedHtmlPath
      ? [
          {
            kind: "recognized_html" as const,
            label: "查看识别 HTML" as const,
            path: entry.recognizedHtmlPath,
            href: createMaterialEvidenceHref(entry.recognizedHtmlPath),
            available: true,
          },
        ]
      : []),
    ...((entry.pageImages?.length ?? entry.previewPageImages?.length)
      ? [
          {
            kind: "original_page_images" as const,
            label: "查看原始页图" as const,
            path: entry.pageImageManifestPath ?? entry.previewPageImageManifestPath ?? entry.pageImages?.[0]?.path ?? entry.previewPageImages?.[0]?.path ?? "",
            href: entry.pageImages?.[0]?.href ?? entry.previewPageImages?.[0]?.href ?? "",
            available: true,
          },
        ]
      : []),
    ...(entry.previewPath
      ? [
          {
            kind: "preview_document" as const,
            label: "查看预览文档" as const,
            path: entry.previewPath,
            href: createMaterialEvidenceHref(entry.previewPath),
            available: true,
          },
        ]
      : []),
    {
      kind: "original_document",
      label: "下载原始文件",
      path: entry.originalPath,
      href: createMaterialEvidenceHref(entry.originalPath),
      available: Boolean(entry.originalPath),
    },
  ];
}

export function createMaterialEvidenceHref(path: string) {
  return `/${path.replace(/^\//, "")}`;
}

const readinessLabel: Record<MaterialKnowledgeReadiness, string> = {
  full_text: "全文可检索",
  metadata: "元数据可检索",
  blocked: "识别失败待复核",
};

function inferReadiness(material: SourceMaterialSourceEntry, textPath: string | undefined): MaterialKnowledgeReadiness {
  if (textPath) return "full_text";
  if (material.pdf?.ocr_status === "failed") return "blocked";
  return "metadata";
}

function inferAiUseCases(material: SourceMaterialSourceEntry) {
  const useCases = new Set<string>([material.use_case]);
  const path = material.archive_path;

  if (path.includes("募集")) useCases.add("募集备案资料核验");
  if (path.includes("出资") || material.category.includes("资金")) useCases.add("出资到账与资金证明核验");
  if (path.includes("适当性")) useCases.add("投资者适当性审查");
  if (path.includes("信息披露")) useCases.add("基金定期报告与信披模板检索");
  if (path.includes("清算退出")) useCases.add("基金清算退出流程复核");
  if (path.includes("重大事项")) useCases.add("基金重大事项变更追踪");
  if (path.includes("投资管理")) useCases.add("项目立项与投资流程复核");
  if (path.includes("需求构想")) useCases.add("产品需求和业务流程沉淀");

  return Array.from(useCases);
}

function createCollectionPath(basePath: string, relativePath: string | null | undefined) {
  if (!relativePath) return undefined;
  return `${basePath.replace(/\/$/, "")}/${relativePath.replace(/^\//, "")}`;
}

function createMaterialPageImages(pageImageDir: string | undefined, pageCount: number | null | undefined): MaterialPageImage[] | undefined {
  if (!pageImageDir || !pageCount || pageCount < 1) return undefined;
  return Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    const path = `${pageImageDir}/page-${String(page).padStart(3, "0")}.png`;
    return {
      page,
      path,
      href: createMaterialEvidenceHref(path),
    };
  });
}

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeOption(value: string | undefined) {
  const normalized = normalize(value);
  if (!normalized || normalized.startsWith("全部")) return "";
  return normalized;
}

function createSearchText(entry: MaterialKnowledgeEntry) {
  return normalize(
    [
      entry.fileName,
      entry.extension,
      entry.businessArea,
      entry.category,
      entry.archivePath,
      entry.projectOrFund,
      entry.uploader,
      entry.source,
      entry.materialStatus,
      entry.useCase,
      entry.summary,
      entry.originalPath,
      entry.textPath,
      ...entry.aiUseCases,
    ].join(" "),
  );
}

function matchesReadiness(entry: MaterialKnowledgeEntry, readiness: MaterialKnowledgeFilters["readiness"]) {
  if (!readiness) return true;
  if (readiness === "searchable") return entry.aiSearchable;
  if (readiness === "needs_review") return entry.needsReview;
  return entry.readiness === readiness;
}

function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}
