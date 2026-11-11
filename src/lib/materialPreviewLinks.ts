import {materialLocationUnit} from './materialCitationLocation.ts';
import type { ApiMaterialRecord, MaterialDirectoryRow } from "./materialFilters.ts";
import { createMaterialEvidenceHref, createMaterialEvidenceLinks, type MaterialKnowledgeEntry } from "./materialKnowledge.ts";

export type MaterialPreviewEvidenceLink = {
  kind: "recognized_text" | "recognized_html" | "original_page_images" | "preview_document" | "original_document" | "metadata_preview";
  label: "查看识别文本" | "查看识别 HTML" | "查看原始页图" | "查看预览文档" | "下载原始文件" | "查看资料卡片";
  href: string;
};

type MaterialPreviewMetadata = Partial<
  Pick<MaterialDirectoryRow, "type" | "uploader" | "time" | "source" | "status" | "project" | "fund" | "path" | "rule" | "dataOrigin">
> & {
  relationSummary?: string;
};

type MaterialPreviewNavigationContext = {
  page?: number;
  highlightTerms?: string[];
};

export function createMaterialPreviewEvidenceLinks(
  entry?: MaterialKnowledgeEntry,
  material?: ApiMaterialRecord,
  row?: MaterialDirectoryRow,
): MaterialPreviewEvidenceLink[] {
  if (entry) {
    return createMaterialEvidenceLinks(entry)
      .filter((link) => link.available)
      .map((link) => ({
        kind: link.kind,
        label: link.label,
        href: createControlledMaterialPreviewHref({
          kind: link.kind,
          label: link.label,
          sourceHref: link.href,
          downloadHref: createMaterialEvidenceHref(entry.originalPath),
          row,
          name: entry.fileName,
          compareContext: createEntryPreviewCompareContext(entry),
        }),
      }));
  }

  return createApiMaterialEvidenceLinks(material, row);
}

export function createMaterialPrimaryPreviewLink({
  entry,
  material,
  row,
}: {
  entry?: MaterialKnowledgeEntry;
  material?: ApiMaterialRecord;
  row: MaterialDirectoryRow;
}): MaterialPreviewEvidenceLink {
  const firstPageImage = entry?.pageImages?.[0] ?? entry?.previewPageImages?.[0];
  if (entry && firstPageImage) {
    const pageImageDir = entry?.pageImageDir ?? entry?.previewPageImageDir;
    const pageCount = entry?.pageImages?.length ?? entry?.previewPageImages?.length;
    return {
      kind: "original_page_images",
      label: "查看原始页图",
      href: createControlledMaterialPreviewHref({
        kind: "original_page_images",
        label: "查看原始页图",
        sourceHref: firstPageImage.href,
        downloadHref: createMaterialEvidenceHref(entry.originalPath),
        row,
        name: entry.fileName,
        compareContext: createEntryPreviewCompareContext(entry, { pageImageDir, pageCount }),
      }),
    };
  }

  const links = createMaterialPreviewEvidenceLinks(entry, material, row);
  return (
    links.find((link) => link.kind === "original_page_images") ??
    links.find((link) => link.kind === "preview_document") ??
    links.find((link) => link.kind === "recognized_html") ??
    links.find((link) => link.kind === "recognized_text") ??
    links.find((link) => link.kind === "original_document") ??
    createMaterialMetadataPreviewLink(row)
  );
}

export function createMaterialCitationPreviewLinks({
  fileName,
  page,
  highlightTerms,
  recognizedTextHref,
  recognizedHtmlHref,
  originalPageImageHref,
  originalDocumentHref,
  originalPath,
  pageImageDir,
  pageCount,
  metadata,
}: {
  fileName: string;
  page: number;
  highlightTerms?: string[];
  recognizedTextHref?: string;
  recognizedHtmlHref?: string;
  originalPageImageHref?: string;
  originalDocumentHref?: string;
  originalPath?: string;
  pageImageDir?: string;
  pageCount?: number;
  metadata?: MaterialPreviewMetadata;
}): MaterialPreviewEvidenceLink[] {
  const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const originalDownloadHref = originalDocumentHref?.split("#")[0] ?? (originalPath ? `/${originalPath}` : undefined);
  const normalizedPageImageDir = normalizePreviewHref(pageImageDir) ?? createPageImageDirFromPageHref(originalPageImageHref);
  const compareContext: MaterialPreviewCompareContext = {
    recognizedHtmlHref: stripPreviewHash(recognizedHtmlHref),
    recognizedTextHref: stripPreviewHash(recognizedTextHref),
    pageImageDir: normalizedPageImageDir,
    pageCount,
  };
  const navigationContext: MaterialPreviewNavigationContext = {
    page: materialLocationUnit(fileName)==="页" ? normalizedPage : undefined,
    highlightTerms,
  };
  const links: MaterialPreviewEvidenceLink[] = [];

  if (recognizedTextHref) {
    links.push(createControlledMaterialPreviewLink(
      "recognized_text",
      "查看识别文本",
      stripPreviewHash(recognizedTextHref) ?? recognizedTextHref,
      undefined,
      fileName,
      originalDownloadHref,
      compareContext,
      navigationContext,
      metadata,
    ));
  }
  if (recognizedHtmlHref) {
    links.push(createControlledMaterialPreviewLink(
      "recognized_html",
      "查看识别 HTML",
      stripPreviewHash(recognizedHtmlHref) ?? recognizedHtmlHref,
      undefined,
      fileName,
      originalDownloadHref,
      compareContext,
      navigationContext,
      metadata,
    ));
  }
  if (materialLocationUnit(fileName)==="页" && (originalPageImageHref || normalizedPageImageDir)) {
    links.push(createControlledMaterialPreviewLink(
      "original_page_images",
      "查看原始页图",
      originalPageImageHref ?? createPageImageHrefFromDir(normalizedPageImageDir, normalizedPage),
      undefined,
      fileName,
      originalDownloadHref,
      compareContext,
      navigationContext,
      metadata,
    ));
  }
  if (originalDownloadHref) {
    links.push({
      kind: "original_document",
      label: "下载原始文件",
      href: originalDownloadHref,
    });
  }

  return links;
}

export function createApiMaterialEvidenceLinks(material?: ApiMaterialRecord, row?: MaterialDirectoryRow): MaterialPreviewEvidenceLink[] {
  if (!material) return [];

  const links: MaterialPreviewEvidenceLink[] = [];
  const originalHref = material.originalFilePath ? `/${material.originalFilePath}` : undefined;
  const compareContext = createApiMaterialPreviewCompareContext(material);
  if (material.recognizedTextPath) {
    links.push(createControlledMaterialPreviewLink("recognized_text", "查看识别文本", `/${material.recognizedTextPath}`, row, material.name, originalHref, compareContext));
  }
  if (material.recognizedHtmlPath) {
    links.push(createControlledMaterialPreviewLink("recognized_html", "查看识别 HTML", `/${material.recognizedHtmlPath}`, row, material.name, originalHref, compareContext));
  }
  if (material.pageImageDir) {
    links.push(createControlledMaterialPreviewLink("original_page_images", "查看原始页图", `/${material.pageImageDir.replace(/\/$/, "")}/page-001.png`, row, material.name, originalHref, compareContext));
  }
  if (material.previewFilePath) {
    links.push(createControlledMaterialPreviewLink("preview_document", "查看预览文档", `/${material.previewFilePath}`, row, material.name, originalHref, compareContext));
  }
  if (material.originalFilePath) {
    links.push(createControlledMaterialPreviewLink("original_document", "下载原始文件", originalHref ?? `/${material.originalFilePath}`, row, material.name, originalHref, compareContext));
  }
  return links;
}

function createMaterialMetadataPreviewLink(row: MaterialDirectoryRow): MaterialPreviewEvidenceLink {
  return {
    kind: "metadata_preview",
    label: "查看资料卡片",
    href: createControlledMaterialPreviewHref({
      kind: "metadata_preview",
      label: "查看资料卡片",
      row,
    }),
  };
}

function createControlledMaterialPreviewLink(
  kind: MaterialPreviewEvidenceLink["kind"],
  label: MaterialPreviewEvidenceLink["label"],
  sourceHref: string,
  row?: MaterialDirectoryRow,
  name?: string,
  downloadHref?: string,
  compareContext?: MaterialPreviewCompareContext,
  navigationContext?: MaterialPreviewNavigationContext,
  metadata?: MaterialPreviewMetadata,
): MaterialPreviewEvidenceLink {
  return {
    kind,
    label,
    href: createControlledMaterialPreviewHref({
      kind,
      label,
      sourceHref,
      downloadHref,
      row,
      name,
      compareContext,
      navigationContext,
      metadata,
    }),
  };
}

type MaterialPreviewCompareContext = {
  recognizedHtmlHref?: string;
  recognizedTextHref?: string;
  pageImageDir?: string;
  pageCount?: number;
};

function createControlledMaterialPreviewHref({
  kind,
  label,
  sourceHref,
  downloadHref,
  row,
  name,
  compareContext,
  navigationContext,
  metadata,
}: {
  kind: MaterialPreviewEvidenceLink["kind"];
  label: MaterialPreviewEvidenceLink["label"];
  sourceHref?: string;
  downloadHref?: string;
  row?: MaterialDirectoryRow;
  name?: string;
  compareContext?: MaterialPreviewCompareContext;
  navigationContext?: MaterialPreviewNavigationContext;
  metadata?: MaterialPreviewMetadata;
}) {
  const params = new URLSearchParams();
  params.set("kind", kind);
  params.set("label", label);
  if (sourceHref) params.set("sourceHref", sourceHref);
  if (downloadHref) params.set("downloadHref", downloadHref);
  appendPreviewParam(params, "recognizedHtmlHref", compareContext?.recognizedHtmlHref);
  appendPreviewParam(params, "recognizedTextHref", compareContext?.recognizedTextHref);
  appendPreviewParam(params, "pageImageDir", compareContext?.pageImageDir);
  if (compareContext?.pageCount) params.set("pageCount", String(compareContext.pageCount));
  if (navigationContext?.page) params.set("page", String(navigationContext.page));
  appendPreviewHighlightParams(params, navigationContext?.highlightTerms);
  params.set("name", name ?? row?.name ?? "资料");
  appendPreviewParam(params, "type", row?.type ?? metadata?.type);
  appendPreviewParam(params, "uploader", row?.uploader ?? metadata?.uploader);
  appendPreviewParam(params, "time", row?.time ?? metadata?.time);
  appendPreviewParam(params, "source", row?.source ?? metadata?.source);
  appendPreviewParam(params, "status", row?.status ?? metadata?.status);
  appendPreviewParam(params, "project", row?.relationSummary ?? row?.project ?? metadata?.relationSummary ?? metadata?.project);
  appendPreviewParam(params, "fund", row?.fund ?? metadata?.fund);
  appendPreviewParam(params, "path", row?.path ?? metadata?.path);
  appendPreviewParam(params, "rule", row?.rule ?? metadata?.rule);
  appendPreviewParam(params, "dataOrigin", row?.dataOrigin ?? metadata?.dataOrigin);
  return `/materials/preview?${params.toString()}`;
}

function appendPreviewParam(params: URLSearchParams, key: string, value?: string | null) {
  if (value) params.set(key, value);
}

function appendPreviewHighlightParams(params: URLSearchParams, terms?: string[]) {
  const normalizedTerms = Array.from(
    new Set((terms ?? []).map((term) => term.trim()).filter((term) => term.length >= 2)),
  ).slice(0, 6);
  for (const term of normalizedTerms) params.append("highlight", term);
}

function createEntryPreviewCompareContext(
  entry: MaterialKnowledgeEntry,
  fallback?: Pick<MaterialPreviewCompareContext, "pageImageDir" | "pageCount">,
): MaterialPreviewCompareContext {
  return {
    recognizedHtmlHref: entry.recognizedHtmlPath ? createMaterialEvidenceHref(entry.recognizedHtmlPath) : undefined,
    recognizedTextHref: entry.textPath ? createMaterialEvidenceHref(entry.textPath) : undefined,
    pageImageDir: entry.pageImageDir
      ? createMaterialEvidenceHref(entry.pageImageDir)
      : fallback?.pageImageDir
        ? createMaterialEvidenceHref(fallback.pageImageDir)
        : entry.previewPageImageDir
          ? createMaterialEvidenceHref(entry.previewPageImageDir)
          : undefined,
    pageCount: entry.pageImages?.length ?? fallback?.pageCount ?? entry.previewPageImages?.length,
  };
}

function createApiMaterialPreviewCompareContext(material: ApiMaterialRecord): MaterialPreviewCompareContext {
  return {
    recognizedHtmlHref: material.recognizedHtmlPath ? `/${material.recognizedHtmlPath}` : undefined,
    recognizedTextHref: material.recognizedTextPath ? `/${material.recognizedTextPath}` : undefined,
    pageImageDir: material.pageImageDir ? `/${material.pageImageDir.replace(/\/$/, "")}` : undefined,
  };
}

function stripPreviewHash(href?: string) {
  return href?.split("#")[0];
}

function normalizePreviewHref(href?: string) {
  if (!href) return undefined;
  return href.startsWith("/") ? href : `/${href}`;
}

function createPageImageDirFromPageHref(pageHref?: string) {
  const normalizedHref = normalizePreviewHref(pageHref);
  if (!normalizedHref) return undefined;
  return normalizedHref.replace(/\/page-\d+\.(?:png|jpe?g|webp)(?:\?.*)?$/i, "");
}

function createPageImageHrefFromDir(pageImageDir: string | undefined, page: number) {
  if (!pageImageDir) return "";
  return `${pageImageDir.replace(/\/$/, "")}/page-${String(page).padStart(3, "0")}.png`;
}
