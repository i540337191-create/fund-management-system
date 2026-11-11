import { assertSafeMaterialPath } from "./safe-path.ts";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";

export type MaterialPreviewLayoutBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type MaterialPreviewLayoutBlock = {
  id: string;
  type: "text" | "title" | "table";
  tag: string;
  text: string;
  className?: string;
  box: MaterialPreviewLayoutBox;
  coordinateSource: "ocr_metadata" | "estimated_from_ocr_html";
};

export type MaterialPreviewLayoutTableCell = {
  tag: "td" | "th";
  text: string;
  rowSpan: number;
  colSpan: number;
};

export type MaterialPreviewLayoutTable = {
  id: string;
  box: MaterialPreviewLayoutBox;
  rows: MaterialPreviewLayoutTableCell[][];
};

export type MaterialPreviewLayoutCache = {
  version: "material-preview-layout-cache/v1";
  generatedAt: string;
  source: {
    recognizedHtmlPath: string;
    rawHtmlPath?: string;
    summaryPath?: string;
  };
  page: {
    number: number;
    kind: "text" | "table";
    rotation: number;
    pdfRotation: number;
    pageBox: MaterialPreviewLayoutBox;
    contentBox: MaterialPreviewLayoutBox;
    coordinateSource: "ocr_metadata" | "estimated_from_ocr_html";
  };
  render: {
    mode: "page_box_text_reflow" | "table_complete_layout";
    html: string;
  };
  blocks: MaterialPreviewLayoutBlock[];
  tables: MaterialPreviewLayoutTable[];
  metrics: {
    textBlockCount: number;
    tableCount: number;
    rowCount: number;
    cellCount: number;
  };
};

export type MaterialPreviewLayoutCacheResult = {
  href: string;
  relativePath: string;
  cache: MaterialPreviewLayoutCache;
};

export type MaterialPreviewLayoutCacheBatchItem = {
  page: number;
  href: string;
  relativePath: string;
  blockCount: number;
  tableCount: number;
};

export type MaterialPreviewLayoutCacheBatchResult = {
  generatedCount: number;
  items: MaterialPreviewLayoutCacheBatchItem[];
};

type GenerateLayoutCacheInput = {
  projectRoot: string;
  recognizedHtmlHref: string;
  page: number;
  now?: () => Date;
};

type GenerateLayoutCachesInput = {
  projectRoot: string;
  recognizedHtmlHref: string;
  pages?: number[];
  pageCount?: number;
  now?: () => Date;
};

type ParsedHtmlNode = {
  tag: string;
  attrs: Record<string, string>;
  children: ParsedHtmlNode[];
  text: string;
};

type OcrSummaryPage = {
  page_no?: number;
  page_type?: string;
  rotation?: number;
  pdf_rotation?: number;
  metadata?: {
    page_size?: [number, number];
    crop_page_size?: [number, number];
    content_position?: {
      left?: number;
      top?: number;
      width?: number;
      height?: number;
      page_width?: number;
      page_height?: number;
    };
    restore_box?: {
      left?: number | null;
      top?: number | null;
      width?: number;
      height?: number;
    };
  };
  tables?: number;
  rows?: number;
  cells?: number;
};

const SOURCE_MATERIALS_DIR = "docs/source-materials";
const LAYOUT_CACHE_VERSION = "material-preview-layout-cache/v1";

export async function generateMaterialPreviewLayoutCache({
  projectRoot,
  recognizedHtmlHref,
  page,
  now = () => new Date(),
}: GenerateLayoutCacheInput): Promise<MaterialPreviewLayoutCacheResult> {
  const safePage = normalizePreviewPage(page);
  const recognizedHtmlPath = resolveSourceMaterialHref(projectRoot, recognizedHtmlHref);
  if (!recognizedHtmlPath.endsWith("/combined.html")) {
    throw Object.assign(new Error("invalid_recognized_html_path"), { statusCode: 400 });
  }
  if (!existsSync(recognizedHtmlPath)) {
    throw Object.assign(new Error("recognized_html_not_found"), { statusCode: 404 });
  }

  const rawHtmlPath = resolve(dirname(recognizedHtmlPath), `page_${String(safePage).padStart(4, "0")}_raw.html`);
  const summaryPath = resolve(dirname(recognizedHtmlPath), "summary.json");
  await assertSafeMaterialPath(projectRoot, recognizedHtmlPath);
  if (existsSync(rawHtmlPath)) await assertSafeMaterialPath(projectRoot, rawHtmlPath);
  if (existsSync(summaryPath)) await assertSafeMaterialPath(projectRoot, summaryPath);
  const rawHtml = await readFile(existsSync(rawHtmlPath) ? rawHtmlPath : recognizedHtmlPath, "utf8");
  const summaryPage = existsSync(summaryPath) ? await readOcrSummaryPage(summaryPath, safePage) : null;
  const cachePath = createLayoutCachePath(projectRoot, recognizedHtmlPath, safePage);
  const cacheRelativePath = toPosixPath(relative(projectRoot, cachePath));
  const recognizedRelativePath = toPosixPath(relative(projectRoot, recognizedHtmlPath));
  const rawRelativePath = existsSync(rawHtmlPath) ? toPosixPath(relative(projectRoot, rawHtmlPath)) : undefined;
  const summaryRelativePath = existsSync(summaryPath) ? toPosixPath(relative(projectRoot, summaryPath)) : undefined;

  const cache = createLayoutCache({
    generatedAt: now().toISOString(),
    page: safePage,
    rawHtml,
    summaryPage,
    source: {
      recognizedHtmlPath: recognizedRelativePath,
      rawHtmlPath: rawRelativePath,
      summaryPath: summaryRelativePath,
    },
  });

  await assertSafeMaterialPath(projectRoot, cachePath, true);
  await mkdir(dirname(cachePath), { recursive: true });
  await assertSafeMaterialPath(projectRoot, cachePath, true);
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");

  return {
    href: `/${cacheRelativePath}`,
    relativePath: cacheRelativePath,
    cache,
  };
}

export async function generateMaterialPreviewLayoutCaches({
  projectRoot,
  recognizedHtmlHref,
  pages,
  pageCount,
  now = () => new Date(),
}: GenerateLayoutCachesInput): Promise<MaterialPreviewLayoutCacheBatchResult> {
  const targetPages = await resolveLayoutCacheTargetPages({ projectRoot, recognizedHtmlHref, pages, pageCount });
  const items: MaterialPreviewLayoutCacheBatchItem[] = [];

  for (const page of targetPages) {
    const result = await generateMaterialPreviewLayoutCache({
      projectRoot,
      recognizedHtmlHref,
      page,
      now,
    });
    items.push({
      page,
      href: result.href,
      relativePath: result.relativePath,
      blockCount: result.cache.blocks.length,
      tableCount: result.cache.tables.length,
    });
  }

  return {
    generatedCount: items.length,
    items,
  };
}

export function createMaterialPreviewLayoutCacheHref(recognizedHtmlHref: string, page: number) {
  const cleanHref = stripHrefDecorations(recognizedHtmlHref);
  const match = cleanHref.match(/^(\/?docs\/source-materials\/.+?)\/ocr-results\/([^/]+)\/combined\.html$/);
  if (!match) return "";
  return `/${match[1].replace(/^\/+/, "")}/layout-cache/${match[2]}/page-${String(normalizePreviewPage(page)).padStart(3, "0")}.json`;
}

function createLayoutCache({
  generatedAt,
  page,
  rawHtml,
  summaryPage,
  source,
}: {
  generatedAt: string;
  page: number;
  rawHtml: string;
  summaryPage: OcrSummaryPage | null;
  source: MaterialPreviewLayoutCache["source"];
}): MaterialPreviewLayoutCache {
  const documentTree = parseHtml(rawHtml);
  const bodyNode = findFirstNode(documentTree, "body") ?? documentTree;
  const pageBox = readPageBox(rawHtml, summaryPage);
  const contentBox = readContentBox(rawHtml, summaryPage, pageBox);
  const summaryKind = summaryPage?.page_type === "table" ? "table" : summaryPage?.page_type === "text" ? "text" : null;
  const tables = createLayoutTables(bodyNode, contentBox);
  const kind = summaryKind ?? (tables.length > 0 ? "table" : "text");
  const blocks = createLayoutBlocks(bodyNode, contentBox, pageBox, tables);
  const tableRowCount = tables.reduce((total, table) => total + table.rows.length, 0);
  const tableCellCount = tables.reduce(
    (total, table) => total + table.rows.reduce((rowTotal, row) => rowTotal + row.length, 0),
    0,
  );

  return {
    version: LAYOUT_CACHE_VERSION,
    generatedAt,
    source,
    page: {
      number: page,
      kind,
      rotation: Number(summaryPage?.rotation ?? 0),
      pdfRotation: Number(summaryPage?.pdf_rotation ?? 0),
      pageBox,
      contentBox,
      coordinateSource: summaryPage?.metadata?.content_position ? "ocr_metadata" : "estimated_from_ocr_html",
    },
    render: {
      mode: kind === "table" ? "table_complete_layout" : "page_box_text_reflow",
      html: createCachedRenderHtml(rawHtml, page, pageBox, kind),
    },
    blocks,
    tables,
    metrics: {
      textBlockCount: blocks.filter((block) => block.type !== "table").length,
      tableCount: tables.length,
      rowCount: Number(summaryPage?.rows ?? tableRowCount),
      cellCount: Number(summaryPage?.cells ?? tableCellCount),
    },
  };
}

function readPageBox(rawHtml: string, summaryPage: OcrSummaryPage | null): MaterialPreviewLayoutBox {
  const summaryPageSize = summaryPage?.metadata?.page_size;
  if (summaryPageSize) return { left: 0, top: 0, width: summaryPageSize[0], height: summaryPageSize[1] };

  const pageCss = readFirstCssRule(rawHtml, ".page");
  const width = readCssPixelDeclaration(pageCss, "width") || 794;
  const height = readCssPixelDeclaration(pageCss, "height") || 1123;
  return { left: 0, top: 0, width, height };
}

function readContentBox(
  rawHtml: string,
  summaryPage: OcrSummaryPage | null,
  pageBox: MaterialPreviewLayoutBox,
): MaterialPreviewLayoutBox {
  const position = summaryPage?.metadata?.content_position;
  if (position?.width && position?.height) {
    return {
      left: roundLayoutNumber(position.left ?? 0),
      top: roundLayoutNumber(position.top ?? 0),
      width: roundLayoutNumber(position.width),
      height: roundLayoutNumber(position.height),
    };
  }

  const cropStyle = readFirstElementStyle(rawHtml, "content-crop");
  const cropWidth = readCssPixelDeclaration(cropStyle, "width") || readCssPixelDeclaration(cropStyle, "min-width");
  const cropHeight = readCssPixelDeclaration(cropStyle, "height") || readCssPixelDeclaration(cropStyle, "min-height");
  if (cropWidth || cropHeight) {
    return {
      left: readCssPixelDeclaration(cropStyle, "left"),
      top: readCssPixelDeclaration(cropStyle, "top"),
      width: cropWidth || pageBox.width,
      height: cropHeight || pageBox.height,
    };
  }

  const restoreBox = summaryPage?.metadata?.restore_box;
  if (restoreBox?.width && restoreBox?.height) {
    return {
      left: Number(restoreBox.left ?? 0),
      top: Number(restoreBox.top ?? 0),
      width: restoreBox.width,
      height: restoreBox.height,
    };
  }

  return { ...pageBox };
}

function createLayoutBlocks(
  root: ParsedHtmlNode,
  contentBox: MaterialPreviewLayoutBox,
  pageBox: MaterialPreviewLayoutBox,
  tables: MaterialPreviewLayoutTable[],
): MaterialPreviewLayoutBlock[] {
  const textNodes = collectBlockNodes(root).filter((node) => textContent(node).length > 0);
  let cursorTop = contentBox.top;
  let textIndex = 0;
  const blocks: MaterialPreviewLayoutBlock[] = [];

  for (const node of textNodes) {
    const text = normalizeText(textContent(node));
    if (!text) continue;

    const className = node.attrs.class;
    const style = node.attrs.style ?? "";
    const fontSize = readCssPixelDeclaration(style, "font-size") || (isTitleNode(node) ? 20 : 14);
    const lineHeight = readLineHeight(style, fontSize);
    const width = Math.max(80, readCssPixelDeclaration(style, "width") || contentBox.width);
    const explicitLeft = readCssPixelDeclaration(style, "left");
    const explicitTop = readCssPixelDeclaration(style, "top");
    const lineCount = Math.max(1, Math.ceil(text.length / Math.max(8, Math.floor(width / Math.max(8, fontSize)))));
    const height = readCssPixelDeclaration(style, "height") || Math.ceil(lineCount * lineHeight);
    const marginTop = readCssPixelDeclaration(style, "margin-top") || (textIndex === 0 ? 0 : 6);
    const marginBottom = readCssPixelDeclaration(style, "margin-bottom") || 4;
    const top = explicitTop || cursorTop + marginTop;
    const left = explicitLeft || contentBox.left;
    const type = isTitleNode(node) ? "title" : "text";

    blocks.push({
      id: `${type}-${String(textIndex + 1).padStart(3, "0")}`,
      type,
      tag: node.tag,
      text,
      className,
      box: clampBox({ left, top, width, height }, pageBox),
      coordinateSource: explicitTop || explicitLeft ? "ocr_metadata" : "estimated_from_ocr_html",
    });

    cursorTop = top + height + marginBottom;
    textIndex += 1;
  }

  for (const table of tables) {
    blocks.push({
      id: table.id,
      type: "table",
      tag: "table",
      text: table.rows.flatMap((row) => row.map((cell) => cell.text)).filter(Boolean).join(" "),
      box: table.box,
      coordinateSource: "estimated_from_ocr_html",
    });
  }

  return blocks;
}

function createLayoutTables(root: ParsedHtmlNode, contentBox: MaterialPreviewLayoutBox): MaterialPreviewLayoutTable[] {
  const tableNodes = findAllNodes(root, "table");
  let cursorTop = contentBox.top + 72;
  return tableNodes.map((tableNode, tableIndex) => {
    const rows = findAllNodes(tableNode, "tr").map((rowNode) =>
      rowNode.children
        .filter((cellNode) => cellNode.tag === "td" || cellNode.tag === "th")
        .map((cellNode) => ({
          tag: cellNode.tag as "td" | "th",
          text: normalizeText(textContent(cellNode)),
          rowSpan: Number.parseInt(cellNode.attrs.rowspan ?? "1", 10) || 1,
          colSpan: Number.parseInt(cellNode.attrs.colspan ?? "1", 10) || 1,
        })),
    );
    const rowHeight = rows.length > 24 ? 16 : 22;
    const height = Math.max(40, rows.length * rowHeight);
    const table = {
      id: `table-${String(tableIndex + 1).padStart(3, "0")}`,
      box: {
        left: contentBox.left,
        top: cursorTop,
        width: contentBox.width,
        height,
      },
      rows,
    };
    cursorTop += height + 16;
    return table;
  });
}

function collectBlockNodes(root: ParsedHtmlNode): ParsedHtmlNode[] {
  const nodes: ParsedHtmlNode[] = [];
  walkNodes(root, (node) => {
    if (!["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "div", "span"].includes(node.tag)) return;
    if (hasDescendantTag(node, "table")) return;
    if (node.children.some((child) => ["div", "p", "li", "h1", "h2", "h3", "h4", "h5", "h6"].includes(child.tag))) return;
    if (isWrapperNode(node)) return;
    nodes.push(node);
  });
  return nodes;
}

function isWrapperNode(node: ParsedHtmlNode) {
  const className = node.attrs.class ?? "";
  return /\b(?:page|content|content-crop|crop-page|ocr-document-page)\b/.test(className);
}

function isTitleNode(node: ParsedHtmlNode) {
  const className = node.attrs.class ?? "";
  return node.tag.startsWith("h") || /\b(?:title|subtitle|section-title|sub-section-title|header)\b/.test(className);
}

function createCachedRenderHtml(rawHtml: string, page: number, pageBox: MaterialPreviewLayoutBox, kind: "text" | "table") {
  const head = extractHeadHtml(rawHtml);
  const body = extractBodyHtml(rawHtml);
  return `<!DOCTYPE html><html><head>${head}<style>
.material-preview-layout-cache-page { width: ${pageBox.width}px; min-height: ${pageBox.height}px; background: #fff; overflow: visible; }
.material-preview-layout-cache-page[data-layout-kind="text"] .page { width: ${pageBox.width}px !important; height: ${pageBox.height}px !important; overflow: visible !important; }
.material-preview-layout-cache-page[data-layout-kind="table"] .page { overflow: visible !important; }
</style></head><body><div class="ocr-document-page material-preview-layout-cache-page" data-page="${page}" data-layout-kind="${kind}">${body}</div></body></html>`;
}

function parseHtml(html: string): ParsedHtmlNode {
  const root: ParsedHtmlNode = { tag: "root", attrs: {}, children: [], text: "" };
  const stack: ParsedHtmlNode[] = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
  for (const match of html.matchAll(tokenPattern)) {
    const closingTag = match[1]?.toLowerCase();
    const openingTag = match[2]?.toLowerCase();
    const attrs = match[3] ?? "";
    const text = match[4] ?? "";
    if (closingTag) {
      while (stack.length > 1) {
        const current = stack.pop();
        if (current?.tag === closingTag) break;
      }
      continue;
    }
    if (openingTag) {
      const node: ParsedHtmlNode = {
        tag: openingTag,
        attrs: parseAttributes(attrs),
        children: [],
        text: "",
      };
      stack[stack.length - 1].children.push(node);
      if (!attrs.trim().endsWith("/") && !["br", "hr", "img", "input", "meta", "link"].includes(openingTag)) {
        stack.push(node);
      }
      continue;
    }
    if (text) {
      stack[stack.length - 1].text += decodeHtmlEntities(text);
    }
  }
  return root;
}

function parseAttributes(rawAttrs: string) {
  const attrs: Record<string, string> = {};
  for (const match of rawAttrs.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function findFirstNode(root: ParsedHtmlNode, tag: string): ParsedHtmlNode | null {
  if (root.tag === tag) return root;
  for (const child of root.children) {
    const found = findFirstNode(child, tag);
    if (found) return found;
  }
  return null;
}

function findAllNodes(root: ParsedHtmlNode, tag: string): ParsedHtmlNode[] {
  const matches: ParsedHtmlNode[] = [];
  walkNodes(root, (node) => {
    if (node.tag === tag) matches.push(node);
  });
  return matches;
}

function walkNodes(root: ParsedHtmlNode, visit: (node: ParsedHtmlNode) => void) {
  visit(root);
  for (const child of root.children) walkNodes(child, visit);
}

function hasDescendantTag(root: ParsedHtmlNode, tag: string): boolean {
  return root.children.some((child) => child.tag === tag || hasDescendantTag(child, tag));
}

function textContent(node: ParsedHtmlNode): string {
  return `${node.text}${node.children.map(textContent).join(" ")}`;
}

async function readOcrSummaryPage(summaryPath: string, page: number): Promise<OcrSummaryPage | null> {
  const summary = JSON.parse(await readFile(summaryPath, "utf8")) as { pages?: OcrSummaryPage[] };
  return summary.pages?.find((item) => item.page_no === page) ?? null;
}

async function resolveLayoutCacheTargetPages({
  projectRoot,
  recognizedHtmlHref,
  pages,
  pageCount,
}: {
  projectRoot: string;
  recognizedHtmlHref: string;
  pages?: number[];
  pageCount?: number;
}) {
  if (pages?.length) return normalizePreviewPages(pages);

  const safePageCount = Number(pageCount);
  if (Number.isFinite(safePageCount) && safePageCount > 0) {
    return Array.from({ length: Math.floor(safePageCount) }, (_, index) => index + 1);
  }

  const recognizedHtmlPath = resolveSourceMaterialHref(projectRoot, recognizedHtmlHref);
  const summaryPath = resolve(dirname(recognizedHtmlPath), "summary.json");
  await assertSafeMaterialPath(projectRoot, recognizedHtmlPath);
  if (existsSync(summaryPath)) {
    await assertSafeMaterialPath(projectRoot, summaryPath);
    const summary = JSON.parse(await readFile(summaryPath, "utf8")) as { pages?: OcrSummaryPage[] };
    const summaryPages = normalizePreviewPages(
      summary.pages?.map((page) => Number(page.page_no)).filter((page) => Number.isFinite(page)) ?? [],
    );
    if (summaryPages.length > 0) return summaryPages;
  }

  const rawHtmlPages = normalizePreviewPages(
    (await readdir(dirname(recognizedHtmlPath)))
      .map((fileName) => fileName.match(/^page_(\d{4})_raw\.html$/)?.[1])
      .filter((page): page is string => Boolean(page))
      .map((page) => Number(page)),
  );
  if (rawHtmlPages.length > 0) return rawHtmlPages;

  return [1];
}

function resolveSourceMaterialHref(projectRoot: string, href: string) {
  const cleanHref = stripHrefDecorations(href);
  const relativeHref = decodeURIComponent(cleanHref).replace(/^\/+/, "");
  if (!relativeHref.startsWith(`${SOURCE_MATERIALS_DIR}/`)) {
    throw Object.assign(new Error("invalid_source_material_path"), { statusCode: 400 });
  }
  const resolved = resolve(projectRoot, relativeHref);
  const sourceRoot = resolve(projectRoot, SOURCE_MATERIALS_DIR);
  if (!isPathInside(resolved, sourceRoot)) {
    throw Object.assign(new Error("invalid_source_material_path"), { statusCode: 400 });
  }
  return resolved;
}

function createLayoutCachePath(projectRoot: string, recognizedHtmlPath: string, page: number) {
  const recognizedRelativePath = toPosixPath(relative(projectRoot, recognizedHtmlPath));
  const match = recognizedRelativePath.match(/^(docs\/source-materials\/.+?)\/ocr-results\/([^/]+)\/combined\.html$/);
  if (!match) {
    throw Object.assign(new Error("invalid_recognized_html_path"), { statusCode: 400 });
  }
  return resolve(projectRoot, `${match[1]}/layout-cache/${match[2]}/page-${String(page).padStart(3, "0")}.json`);
}

function normalizePreviewPage(page: number) {
  return Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));
}

function normalizePreviewPages(pages: number[]) {
  return Array.from(new Set(pages.map(normalizePreviewPage))).sort((left, right) => left - right);
}

function stripHrefDecorations(href: string) {
  return href.split("#")[0].split("?")[0];
}

function isPathInside(path: string, parent: string) {
  const relativePath = relative(parent, path);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(`..${sep}`));
}

function toPosixPath(path: string) {
  return path.split(sep).join("/");
}

function extractHeadHtml(html: string) {
  return html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
}

function extractBodyHtml(html: string) {
  return html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
}

function readFirstCssRule(html: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, "i"));
  return match?.[1] ?? "";
}

function readFirstElementStyle(html: string, className: string) {
  const match = html.match(new RegExp(`<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, "i"));
  return match?.[0].match(/style=(["'])([\s\S]*?)\1/i)?.[2] ?? "";
}

function readCssPixelDeclaration(css: string, property: string) {
  const match = css.match(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, "i"));
  return match ? Number.parseFloat(match[1]) : 0;
}

function readLineHeight(css: string, fontSize: number) {
  const lineHeightMatch = css.match(/(?:^|[;\s])line-height\s*:\s*(\d+(?:\.\d+)?)(px)?/i);
  if (!lineHeightMatch) return fontSize * 1.5;
  const value = Number.parseFloat(lineHeightMatch[1]);
  return lineHeightMatch[2] ? value : value * fontSize;
}

function clampBox(box: MaterialPreviewLayoutBox, pageBox: MaterialPreviewLayoutBox): MaterialPreviewLayoutBox {
  const left = clampLayoutNumber(box.left, 0, Math.max(0, pageBox.width - 1));
  const top = clampLayoutNumber(box.top, 0, Math.max(0, pageBox.height - 1));
  return {
    left,
    top,
    width: Math.max(1, Math.min(roundLayoutNumber(box.width), pageBox.width - left)),
    height: Math.max(1, Math.min(roundLayoutNumber(box.height), Math.max(box.height, pageBox.height - top))),
  };
}

function clampLayoutNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, roundLayoutNumber(value)));
}

function roundLayoutNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
