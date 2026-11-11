export type MaterialPreviewPageSize = { width: number; height: number };
export type MaterialPreviewHtmlPageKind = "text" | "table";

export function readMaterialPreviewHtmlPageSize(html: string, currentPage: number): MaterialPreviewPageSize | null {
  const pageHtml = extractMaterialPreviewPageHtml(html, currentPage);
  if (!pageHtml) return null;

  const srcdocHtmlValues = extractSrcdocValues(pageHtml).map((srcdoc) => decodeHtmlEntities(srcdoc));
  const candidates = [
    ...collectCssPixelSizes(pageHtml),
    ...srcdocHtmlValues.flatMap((srcdoc) => collectCssPixelSizes(srcdoc)),
  ].filter((size) => size.width > 0 && size.height > 0);

  if (candidates.length === 0) return null;
  const pageVerticalPadding = Math.max(0, ...srcdocHtmlValues.map(readPageVerticalPadding));
  const paddedContentHeight = Math.max(...candidates.map((size) => size.height)) + pageVerticalPadding;

  return {
    width: Math.max(...candidates.map((size) => size.width)),
    height: Math.max(paddedContentHeight, ...candidates.map((size) => size.height)),
  };
}

export function readMaterialPreviewHtmlPageKind(html: string, currentPage: number): MaterialPreviewHtmlPageKind {
  const pageHtml = extractMaterialPreviewPageHtml(html, currentPage);
  if (!pageHtml) return "text";

  const srcdocHtmlValues = extractSrcdocValues(pageHtml).map((srcdoc) => decodeHtmlEntities(srcdoc));
  const searchableHtml = [decodeHtmlEntities(pageHtml), ...srcdocHtmlValues].join("\n");
  return /<table(?:\s|>)/i.test(searchableHtml) ? "table" : "text";
}

function extractMaterialPreviewPageHtml(html: string, currentPage: number) {
  const pagePattern = new RegExp(
    `<[^>]*class=["'][^"']*ocr-document-page[^"']*["'][^>]*data-page=["']${currentPage}["'][^>]*>`,
    "i",
  );
  const match = html.match(pagePattern);
  if (!match || match.index === undefined) return "";

  const start = match.index;
  const nextPagePattern = /<[^>]*class=["'][^"']*ocr-document-page[^"']*["'][^>]*data-page=["']\d+["'][^>]*>/gi;
  nextPagePattern.lastIndex = start + match[0].length;
  const next = nextPagePattern.exec(html);
  return html.slice(start, next?.index ?? html.length);
}

function collectCssPixelSizes(html: string): MaterialPreviewPageSize[] {
  return [
    ...Array.from(html.matchAll(/style=(["'])([\s\S]*?)\1/gi), (match) => readCssDeclarationSize(decodeHtmlEntities(match[2]))),
    ...Array.from(html.matchAll(/\{([^{}]+)\}/g), (match) => readCssDeclarationSize(decodeHtmlEntities(match[1]))),
  ].filter((size): size is MaterialPreviewPageSize => Boolean(size));
}

function readCssDeclarationSize(css: string): MaterialPreviewPageSize | null {
  const width = readCssPixelDeclaration(css, "width");
  const height = readCssPixelDeclaration(css, "height");
  if (!width || !height) return null;
  return { width, height };
}

function readCssPixelDeclaration(css: string, property: "width" | "height" | "padding" | "padding-top" | "padding-bottom") {
  const match = css.match(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, "i"));
  return match ? Number.parseFloat(match[1]) : 0;
}

function readPageVerticalPadding(html: string) {
  const pageRules = Array.from(html.matchAll(/\.page\s*\{([^{}]+)\}/g), (match) => match[1]);
  return Math.max(0, ...pageRules.map((rule) => readVerticalPadding(rule)));
}

function readVerticalPadding(css: string) {
  const padding = readCssPixelDeclaration(css, "padding");
  if (padding) return padding * 2;

  const paddingTop = readCssPixelDeclaration(css, "padding-top");
  const paddingBottom = readCssPixelDeclaration(css, "padding-bottom");
  return paddingTop + paddingBottom;
}

function extractSrcdocValues(html: string) {
  return Array.from(html.matchAll(/srcdoc=(["'])([\s\S]*?)\1/gi), (match) => match[2]);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}
