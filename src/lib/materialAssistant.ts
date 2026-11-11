import type { ChatMessage } from "../data/aiMessages";
import {
  SOURCE_MATERIAL_COLLECTION_PATH,
  createMaterialEvidenceLinks,
  filterMaterialKnowledge,
  type MaterialKnowledgeEntry,
  type MaterialKnowledgeSummary,
} from "./materialKnowledge.ts";
import { createMaterialRagReply, type MaterialRagReplyOptions, type MaterialTextChunk } from "./materialRag.ts";

const MATERIAL_INTENT_PATTERN = /(资料|文档|文件|pdf|ocr|识别文本|原始文档|入库|录入|物料|检索|投资者|风险匹配|年度报告|信息披露|合格投资者|清算|备案|托管协议|合伙协议|出资证明|条款|披露|基金净资产|认缴|实缴)/i;
const RECENT_DOCUMENT_PATTERN = /(最近|新|刚才|刚刚).*(文档|资料|文件|物料)/;
const PDF_INTENT_PATTERN = /(pdf|ocr|识别|扫描|原始文档|识别文本)/i;
const GENERIC_RECENT_PATTERN = /(最近|新|刚才|刚刚|入库|录入)/;

const STOP_WORDS = [
  "最近",
  "刚才",
  "刚刚",
  "录入",
  "入库",
  "新的",
  "新文档",
  "新资料",
  "文档",
  "资料",
  "文件",
  "哪些",
  "是否",
  "已经",
  "可以",
  "进行",
  "查询",
  "检索",
  "落入",
  "项目",
  "中",
  "的",
  "和",
  "请",
  "帮我",
  "一下",
  "pdf",
  "ocr",
];

export function createMaterialAssistantReply(
  prompt: string,
  entries: MaterialKnowledgeEntry[],
  summary: MaterialKnowledgeSummary,
  chunks: MaterialTextChunk[] = [],
  ragOptions: MaterialRagReplyOptions = {},
): ChatMessage | null {
  if (!isMaterialKnowledgePrompt(prompt)) return null;

  const ragReply = chunks.length > 0 ? createMaterialRagReply(prompt, chunks, entries, summary, ragOptions) : null;
  if (ragReply) return ragReply;

  const searchableEntries = entries.filter((entry) => entry.aiSearchable);
  const needle = extractMaterialNeedle(prompt);
  const matchedEntries = needle ? filterMaterialKnowledge(searchableEntries, { query: needle }) : [];
  const wantsPdf = PDF_INTENT_PATTERN.test(prompt) || !needle;
  const baseEntries = matchedEntries.length > 0 ? matchedEntries : searchableEntries;
  const preferredEntries = wantsPdf ? preferPdfEntries(baseEntries) : baseEntries;
  const visibleEntries = [...preferredEntries].sort(compareMaterialRecency).slice(0, 6);
  const latestDate = getLatestDate(entries);
  const categoryLine = summarizeCategories(summary);
  const matchedLabel = matchedEntries.length > 0 ? `命中 ${matchedEntries.length} 份资料` : `展示最近 ${visibleEntries.length} 份代表性资料`;
  const summaryText = [
    ragOptions.allowedDataOrigins?.length ? "已启用隐藏模拟数据策略，默认只使用 PDF/OCR 与人工确认数据。" : "",
    `已落入项目资料库，可在“资料库”页面检索，也可从这里打开识别文本和原始文档。`,
    `当前批次 ${summary.total} 份真实物料，其中 PDF ${summary.pdf} 份，OCR 成功 ${summary.apiOcrSucceeded}/${summary.pdf}，全文可检索 ${summary.fullTextReady} 份，失败 ${summary.apiOcrFailed} 份。`,
    latestDate ? `最近入库日期：${latestDate}。${matchedLabel}。` : matchedLabel,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    role: "assistant",
    content: createPlainMaterialReply(summaryText, visibleEntries),
    structured: {
      title: needle ? "资料检索结果" : "最近录入资料",
      summary: summaryText,
      metrics: [
        { label: "真实物料", value: String(summary.total), detail: categoryLine },
        { label: "PDF 识别", value: `${summary.apiOcrSucceeded}/${summary.pdf}`, detail: "OCR API 已完成" },
        { label: "全文索引", value: String(summary.fullTextReady), detail: "可用于 AI 检索与引用" },
        { label: "待复核", value: String(summary.blocked), detail: "识别失败或阻塞项" },
      ],
      items: visibleEntries.map((entry) => ({
        title: entry.fileName,
        meta: `${entry.category} · ${entry.projectOrFund} · ${entry.archivedAt}`,
        status: readinessLabel(entry),
        description: `归档路径：${entry.archivePath}`,
        links: createMaterialEvidenceLinks(entry)
          .filter((link) => link.available)
          .map((link) => ({ label: link.label, href: link.href })),
      })),
      nextActions: [
        "在资料库按基金、类别或关键词继续筛选。",
        "点击“查看识别文本”核对 OCR 结果。",
        "点击“查看原始页图”核对版式，或下载原始文件留档。",
      ],
    },
    sources: ["项目资料索引", "OCR API 识别结果", SOURCE_MATERIAL_COLLECTION_PATH],
  };
}

export function isMaterialKnowledgePrompt(prompt: string) {
  return MATERIAL_INTENT_PATTERN.test(prompt) || RECENT_DOCUMENT_PATTERN.test(prompt);
}

function createPlainMaterialReply(summaryText: string, entries: MaterialKnowledgeEntry[]) {
  const lines = [
    `结论：${summaryText}`,
    "文档清单：",
    ...entries.map((entry, index) => `${index + 1}. ${entry.fileName}｜${entry.category}｜${readinessLabel(entry)}`),
    "下一步：进入资料库检索，或打开识别文本/原始文档核验证据。",
  ];
  return lines.join("\n");
}

function extractMaterialNeedle(prompt: string) {
  const normalized = prompt
    .replace(/[，。？！、；：,.?!;:"'“”‘’（）()【】《》<>]/g, " ")
    .split(/\s+/)
    .map((part) => STOP_WORDS.reduce((value, word) => value.split(word).join(""), part).trim())
    .filter((part) => part.length >= 2 && !GENERIC_RECENT_PATTERN.test(part));

  return normalized.sort((a, b) => b.length - a.length)[0] ?? "";
}

function preferPdfEntries(entries: MaterialKnowledgeEntry[]) {
  const pdfEntries = entries.filter((entry) => entry.extension === "pdf");
  return pdfEntries.length > 0 ? pdfEntries : entries;
}

function compareMaterialRecency(a: MaterialKnowledgeEntry, b: MaterialKnowledgeEntry) {
  const dateCompare = b.archivedAt.localeCompare(a.archivedAt);
  if (dateCompare !== 0) return dateCompare;
  const readinessCompare = readinessRank(b) - readinessRank(a);
  if (readinessCompare !== 0) return readinessCompare;
  const pdfCompare = Number(b.extension === "pdf") - Number(a.extension === "pdf");
  if (pdfCompare !== 0) return pdfCompare;
  return a.fileName.localeCompare(b.fileName, "zh-Hans-CN");
}

function readinessRank(entry: MaterialKnowledgeEntry) {
  if (entry.readiness === "full_text") return 2;
  if (entry.readiness === "metadata") return 1;
  return 0;
}

function readinessLabel(entry: MaterialKnowledgeEntry) {
  if (entry.readiness === "full_text") return "全文可检索";
  if (entry.readiness === "metadata") return "元数据可检索";
  return "待复核";
}

function getLatestDate(entries: MaterialKnowledgeEntry[]) {
  return entries.reduce((latest, entry) => (entry.archivedAt > latest ? entry.archivedAt : latest), "");
}

function summarizeCategories(summary: MaterialKnowledgeSummary) {
  return Object.entries(summary.byCategory)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 3)
    .map(([category, count]) => `${category} ${count}`)
    .join(" / ");
}
