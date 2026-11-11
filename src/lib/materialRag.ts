import {materialCitationLocation} from './materialCitationLocation.ts';
import type { ChatMessage } from "../data/aiMessages";
import { hasConfirmedSource, normalizeDataOrigin, type DataOrigin } from "./dataOrigin.ts";
import type { MaterialKnowledgeEntry, MaterialKnowledgeSummary } from "./materialKnowledge";
import { createMaterialCitationPreviewLinks } from "./materialPreviewLinks.ts";

export type MaterialTextChunk = {
  location?: string;
  id: string;
  materialId: string;
  dataOrigin?: string;
  dataPurpose?:string;
  currentVersionPurpose?:string;
  sourceBasis?:{id:string;dataOrigin:string;dataPurpose?:string}[];
  fileName: string;
  category: string;
  projectOrFund: string;
  archivePath: string;
  page: number;
  chunkIndex: number;
  text: string;
  recognizedTextPath: string;
  recognizedTextHref: string;
  recognizedHtmlPath?: string;
  recognizedHtmlHref?: string;
  originalPath: string;
  originalDocumentHref: string;
  originalPageImageHref?: string;
};

export type MaterialTextSearchResult = MaterialTextChunk & {
  score: number;
  matchedTerms: string[];
  excerpt: string;
};

export type MaterialTextSearchOptions = {
  limit?: number;
  minScore?: number;
};

export type MaterialRagReplyOptions = {
  allowedDataOrigins?: DataOrigin[];
};

const DEFAULT_LIMIT = 4;
const DEFAULT_MIN_SCORE = 8;
const MAX_EXCERPT_CHARS = 260;
const DEFAULT_CHUNK_DATA_ORIGIN: DataOrigin = "unknown";

const QUERY_STOP_WORDS = [
  "请",
  "请问",
  "帮我",
  "一下",
  "哪些",
  "什么",
  "怎么",
  "如何",
  "是否",
  "有没有",
  "需要",
  "进行",
  "查询",
  "检索",
  "说明",
  "内容",
  "条款",
  "资料",
  "文档",
  "文件",
  "pdf",
  "ocr",
  "的",
  "和",
  "与",
  "中",
  "里",
];

const DOMAIN_TERMS = [
  "专业投资者",
  "普通投资者",
  "风险匹配",
  "风险承受能力",
  "合格投资者",
  "年度报告",
  "信息披露",
  "基金净资产",
  "基金费用",
  "财务数据",
  "认缴金额",
  "实缴金额",
  "累计实缴",
  "管理费",
  "托管费",
  "净利润",
  "基金资产",
  "投资者变动",
  "基金估值",
  "投资运作",
  "托管协议",
  "合伙协议",
  "出资证明",
  "资金到账",
  "清算报告",
  "合伙人大会",
  "备案承诺",
  "招募说明",
];

export function searchMaterialTextChunks(
  query: string,
  chunks: MaterialTextChunk[],
  options: MaterialTextSearchOptions = {},
): MaterialTextSearchResult[] {
  const terms = extractMaterialQueryTerms(query);
  if (terms.length === 0) return [];

  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const limit = options.limit ?? DEFAULT_LIMIT;

  return chunks
    .map((chunk) => scoreChunk(chunk, terms, query))
    .filter((result) => result.score >= minScore)
    .sort(compareSearchResults)
    .slice(0, limit);
}

export function createMaterialRagReply(
  prompt: string,
  chunks: MaterialTextChunk[],
  entries: MaterialKnowledgeEntry[],
  summary: MaterialKnowledgeSummary,
  options: MaterialRagReplyOptions = {},
): ChatMessage | null {
  const originFilteredChunks = filterMaterialTextChunksByDataOrigin(chunks, options.allowedDataOrigins);
  const indexedMaterialIds = new Set(entries.map((entry) => entry.id));
  const indexedChunks =
    indexedMaterialIds.size > 0
      ? originFilteredChunks.filter((chunk) => indexedMaterialIds.has(chunk.materialId))
      : originFilteredChunks;
  const searchableChunks = indexedMaterialIds.size > 0 && indexedChunks.length > 0 ? indexedChunks : originFilteredChunks;
  const results = searchMaterialTextChunks(prompt, searchableChunks);
  if (results.length === 0) return null;

  const fileCount = new Set(results.map((result) => result.materialId)).size;
  const pageCount = new Set(results.map((result) => `${result.materialId}:${result.page}`)).size;
  const bestResult = results[0];
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const summaryText = [
    options.allowedDataOrigins?.length ? "已启用隐藏模拟数据策略，仅引用 PDF/OCR 与人工确认数据。" : "",
    `已在 OCR 全文索引中找到 ${results.length} 条正文证据，涉及 ${fileCount} 份文件、${pageCount} 个正文定位。`,
    `最高相关结果来自《${bestResult.fileName}》${materialCitationLocation({title:bestResult.fileName,page:bestResult.page,excerpt:bestResult.text,location:bestResult.location})}。`,
    "以下回答只基于已识别文本；如用于正式判断，请打开识别 HTML 和原始页图复核。",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    role: "assistant",
    content: createPlainRagReply(summaryText, results),
    structured: {
      title: "全文检索结果",
      summary: summaryText,
      metrics: [
        { label: "命中片段", value: String(results.length), detail: "按 OCR 文本召回" },
        { label: "关联文件", value: String(fileCount), detail: "具备原文证据" },
        { label: "正文证据", value: String(pageCount), detail: "按文件类型核对原文位置" },
        { label: "全文索引", value: String(summary.fullTextReady), detail: "当前批次可检索 PDF" },
      ],
      evidence: results.map((result) => ({
        title: `${result.fileName} · ${materialCitationLocation({title:result.fileName,page:result.page,excerpt:result.text,location:result.location})}`,
        fileName: result.fileName,
        page: result.page,
        excerpt: result.excerpt,
        links: createPreviewLinksForSearchResult(result, entriesById),
      })),
      items: results.map((result) => ({
        title: result.fileName,
        meta: `${result.category} · ${result.projectOrFund} · ${materialCitationLocation({title:result.fileName,page:result.page,excerpt:result.text,location:result.location})}`,
        status: "页级命中",
        description: `归档路径：${result.archivePath}`,
        links: createPreviewLinksForSearchResult(result, entriesById),
      })),
      nextActions: [
        "先阅读页级摘录，判断是否回答了当前问题。",
        "点击“查看识别 HTML”核对 OCR 结构化结果。",
        "点击“查看原始页图”核对 PDF 原始版式。",
        "下载原始文件留存正式证据。",
      ],
    },
    sources: ["OCR 全文索引", "正文证据", "项目资料索引"],
  };
}

function createPreviewLinksForSearchResult(
  result: MaterialTextSearchResult,
  entriesById: Map<string, MaterialKnowledgeEntry>,
) {
  const entry = entriesById.get(result.materialId);
  return createMaterialCitationPreviewLinks({
    fileName: result.fileName,
    page: result.page,
    highlightTerms: result.matchedTerms,
    recognizedTextHref: result.recognizedTextHref,
    recognizedHtmlHref: result.recognizedHtmlHref,
    originalPageImageHref: result.originalPageImageHref,
    originalDocumentHref: result.originalDocumentHref,
    originalPath: result.originalPath,
    pageImageDir: entry?.pageImageDir,
    pageCount: entry?.pageImages?.length ?? entry?.pageCount,
    metadata: {
      type: result.category,
      source: "OCR 全文索引",
      status: "页级命中",
      relationSummary: result.projectOrFund,
      fund: result.projectOrFund,
      path: result.archivePath,
      dataOrigin: result.dataOrigin,
    },
  }).map(({ label, href }) => ({ label, href }));
}

function filterMaterialTextChunksByDataOrigin(chunks: MaterialTextChunk[], allowedDataOrigins: DataOrigin[] | undefined) {
  if (!allowedDataOrigins?.length) return chunks;
  const allowedOriginSet = new Set(allowedDataOrigins);
  return chunks.filter((chunk) => allowedOriginSet.has(normalizeDataOrigin(chunk.dataOrigin ?? DEFAULT_CHUNK_DATA_ORIGIN))&&hasConfirmedSource(chunk));
}

export function extractMaterialQueryTerms(query: string) {
  const normalized = normalize(query);
  const terms = new Set<string>();

  for (const term of DOMAIN_TERMS) {
    if (normalized.includes(normalize(term))) terms.add(term);
  }

  for (const segment of normalized.split(/\s+/)) {
    const cleaned = removeStopWords(segment);
    if (cleaned.length >= 2) {
      terms.add(cleaned);
      if (cleaned.length >= 5) {
        for (const ngram of createNgrams(cleaned, 2, 4)) terms.add(ngram);
      }
    }
  }

  return Array.from(terms).filter((term) => term.length >= 2);
}

function scoreChunk(chunk: MaterialTextChunk, terms: string[], query: string): MaterialTextSearchResult {
  const normalizedText = normalize(chunk.text);
  const normalizedMetadata = normalize(
    [chunk.fileName, chunk.category, chunk.projectOrFund, chunk.archivePath].join(" "),
  );
  const normalizedQuery = normalize(removeStopWords(query));
  let score = 0;
  const matchedTerms: string[] = [];

  if (normalizedQuery.length >= 4 && normalizedText.includes(normalizedQuery)) {
    score += 18;
  }

  for (const term of terms) {
    const normalizedTerm = normalize(term);
    if (normalizedText.includes(normalizedTerm)) {
      score += normalizedTerm.length >= 4 ? 7 : 3;
      matchedTerms.push(term);
    }
    if (normalizedMetadata.includes(normalizedTerm)) {
      score += normalizedTerm.length >= 4 ? 5 : 2;
      matchedTerms.push(term);
    }
  }

  return {
    ...chunk,
    score,
    matchedTerms: Array.from(new Set(matchedTerms)),
    excerpt: createExcerpt(chunk.text, matchedTerms),
  };
}

function createExcerpt(text: string, matchedTerms: string[]) {
  const normalizedText = normalize(text);
  const firstTerm = matchedTerms.find((term) => normalizedText.includes(normalize(term)));
  if (!firstTerm) return truncate(cleanExcerpt(text), MAX_EXCERPT_CHARS);

  const index = normalizedText.indexOf(normalize(firstTerm));
  const rawStart = Math.max(0, index - 90);
  const rawEnd = Math.min(text.length, index + MAX_EXCERPT_CHARS - 40);
  const prefix = rawStart > 0 ? "..." : "";
  const suffix = rawEnd < text.length ? "..." : "";
  return `${prefix}${truncate(cleanExcerpt(text.slice(rawStart, rawEnd)), MAX_EXCERPT_CHARS)}${suffix}`;
}

function compareSearchResults(a: MaterialTextSearchResult, b: MaterialTextSearchResult) {
  if (b.score !== a.score) return b.score - a.score;
  if (a.fileName !== b.fileName) return a.fileName.localeCompare(b.fileName, "zh-Hans-CN");
  if (a.page !== b.page) return a.page - b.page;
  return a.chunkIndex - b.chunkIndex;
}

function createPlainRagReply(summary: string, results: MaterialTextSearchResult[]) {
  return [
    `结论：${summary}`,
    "引用证据：",
    ...results.map((result, index) => `${index + 1}. 《${result.fileName}》${materialCitationLocation({title:result.fileName,page:result.page,excerpt:result.text,location:result.location})}：${result.excerpt}`),
    "下一步：打开识别文本或原始 PDF 复核原文定位。",
  ].join("\n");
}

function createNgrams(value: string, min: number, max: number) {
  const grams: string[] = [];
  for (let size = min; size <= max; size += 1) {
    for (let index = 0; index <= value.length - size; index += 1) {
      grams.push(value.slice(index, index + size));
    }
  }
  return grams;
}

function removeStopWords(value: string) {
  return QUERY_STOP_WORDS.reduce((current, word) => current.split(normalize(word)).join(""), normalize(value));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[，。？！、；：,.?!;:"'“”‘’（）()【】《》<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanExcerpt(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}
