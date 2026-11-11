import type { Fund } from "../data/funds.ts";
import type { Project } from "../data/projects.ts";
import {
  inferMaterialDataOrigin,
  type ApiMaterialRecord,
  type ApiMaterialRelation,
  type ApiMaterialRelationships,
  type MaterialDirectoryRow,
} from "./materialFilters.ts";
import type { MaterialKnowledgeEntry } from "./materialKnowledge.ts";

export type MaterialReviewPrimaryScope = "fund" | "project" | "company" | "investor" | "unassigned";

export type MaterialReviewDraft = {
  fundId?: string;
  fundName: string;
  projectId?: string;
  projectName: string;
  companyId?: string;
  companyName: string;
  investorId?: string;
  investorName: string;
  primaryScope: MaterialReviewPrimaryScope;
  archivePath: string;
};

export type MaterialArchivePayload = {
  fundId?: string | null;
  projectId?: string | null;
  companyId?: string | null;
  name: string;
  type: string;
  uploader: string;
  time: string;
  source: string;
  status: string;
  quotes: string;
  project: string;
  path: string;
  primaryScope: MaterialReviewPrimaryScope;
  archivePath: string;
  originalFilePath?: string | null;
  previewFilePath?: string | null;
  recognizedTextPath?: string | null;
  recognizedHtmlPath?: string | null;
  pageImageManifestPath?: string | null;
  pageImageDir?: string | null;
  sourceMaterialId?: string | null;
  fileExtension?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  relationships: ApiMaterialRelationships;
  dataOrigin: string;
};

export function createMaterialReviewDraft({
  row,
  entry,
  material,
  funds,
  projects,
}: {
  row: MaterialDirectoryRow;
  entry?: MaterialKnowledgeEntry;
  material?: ApiMaterialRecord;
  funds: Fund[];
  projects: Project[];
}): MaterialReviewDraft {
  const relationships = material?.relationships;
  const matchedProject = findProject(projects, material?.projectId, row.project);
  const matchedFund = findFund(funds, material?.fundId, relationships?.funds[0]?.name ?? entry?.projectOrFund ?? row.fund ?? matchedProject?.fund);
  const projectName = relationships?.projects[0]?.name ?? matchedProject?.name ?? (matchedProject ? row.project : "");

  return {
    fundId: matchedFund?.id ?? material?.fundId ?? undefined,
    fundName: matchedFund?.name ?? relationships?.funds[0]?.name ?? row.fund,
    projectId: matchedProject?.id ?? material?.projectId ?? undefined,
    projectName,
    companyId: material?.companyId ?? relationships?.companies[0]?.id,
    companyName: relationships?.companies[0]?.name ?? "",
    investorId: relationships?.investors[0]?.id,
    investorName: relationships?.investors[0]?.name ?? inferInvestorName(entry),
    primaryScope: normalizePrimaryScope(material?.primaryScope) ?? inferPrimaryScope(row, entry),
    archivePath: material?.archivePath ?? entry?.archivePath ?? row.path,
  };
}

export function createMaterialArchivePayload({
  row,
  entry,
  material,
  draft,
}: {
  row: MaterialDirectoryRow;
  entry?: MaterialKnowledgeEntry;
  material?: ApiMaterialRecord;
  draft: MaterialReviewDraft;
}): MaterialArchivePayload {
  const archivePath = draft.archivePath.trim() || material?.archivePath || entry?.archivePath || row.path;
  const projectLabel = draft.projectName.trim() || draft.fundName.trim() || row.project;
  const recognizedTextPath = entry?.recognizedTextPath ?? entry?.textPath ?? material?.recognizedTextPath ?? null;
  const recognizedHtmlPath = entry?.recognizedHtmlPath ?? material?.recognizedHtmlPath ?? null;
  const pageImageManifestPath = entry?.pageImageManifestPath ?? material?.pageImageManifestPath ?? null;
  const pageImageDir = entry?.pageImageDir ?? material?.pageImageDir ?? null;
  const originalFilePath = entry?.originalPath ?? material?.originalFilePath ?? null;
  const previewFilePath = entry?.previewPath ?? material?.previewFilePath ?? null;

  return {
    fundId: draft.fundId ?? material?.fundId ?? null,
    projectId: draft.projectId ?? material?.projectId ?? null,
    companyId: draft.companyId ?? material?.companyId ?? null,
    name: material?.name ?? entry?.fileName ?? row.name,
    type: material?.type ?? entry?.category ?? row.type,
    uploader: material?.uploader ?? entry?.uploader ?? row.uploader,
    time: material?.time ?? entry?.archivedAt ?? row.time,
    source: material?.source ?? entry?.source ?? row.source,
    status: "已入库",
    quotes: material?.quotes ?? row.quotes,
    project: projectLabel,
    path: archivePath,
    primaryScope: draft.primaryScope,
    archivePath,
    originalFilePath,
    previewFilePath,
    recognizedTextPath,
    recognizedHtmlPath,
    pageImageManifestPath,
    pageImageDir,
    sourceMaterialId: material?.sourceMaterialId ?? entry?.id ?? null,
    fileExtension: material?.fileExtension ?? entry?.extension ?? null,
    sizeBytes: material?.sizeBytes ?? entry?.sizeBytes ?? null,
    sha256: material?.sha256 ?? entry?.sha256 ?? null,
    relationships: createRelationships(draft),
    dataOrigin: material?.dataOrigin ?? (entry ? inferMaterialDataOrigin(entry.source) : row.dataOrigin ?? inferMaterialDataOrigin(row.source)),
  };
}

function createRelationships(draft: MaterialReviewDraft): ApiMaterialRelationships {
  return {
    funds: relation(draft.fundId, draft.fundName, "primary", draft.primaryScope === "fund"),
    projects: relation(draft.projectId, draft.projectName, draft.primaryScope === "project" ? "primary" : "linked", draft.primaryScope === "project"),
    companies: relation(draft.companyId, draft.companyName, draft.primaryScope === "company" ? "primary" : "linked", draft.primaryScope === "company"),
    investors: relation(draft.investorId, draft.investorName, draft.primaryScope === "investor" ? "subject" : "linked", draft.primaryScope === "investor"),
  };
}

function relation(id: string | undefined, name: string, relationType: string, isPrimary: boolean): ApiMaterialRelation[] {
  const cleanName = name.trim();
  if (!cleanName) return [];
  return [{ id: id ?? "", name: cleanName, relationType, isPrimary }];
}

function findFund(funds: Fund[], id: string | null | undefined, name: string | undefined) {
  if (id) {
    const byId = funds.find((fund) => fund.id === id);
    if (byId) return byId;
  }
  const cleanName = name?.trim();
  if (!cleanName) return undefined;
  return funds.find((fund) => fund.name === cleanName || fund.shortName === cleanName || cleanName.includes(fund.shortName) || cleanName.includes(fund.name));
}

function findProject(projects: Project[], id: string | null | undefined, name: string | undefined) {
  if (id) {
    const byId = projects.find((project) => project.id === id);
    if (byId) return byId;
  }
  const cleanName = name?.trim();
  if (!cleanName) return undefined;
  return projects.find((project) => project.name === cleanName || project.shortName === cleanName);
}

function normalizePrimaryScope(value: string | null | undefined): MaterialReviewPrimaryScope | undefined {
  if (value === "fund" || value === "project" || value === "company" || value === "investor" || value === "unassigned") return value;
  return undefined;
}

function inferPrimaryScope(row: MaterialDirectoryRow, entry?: MaterialKnowledgeEntry): MaterialReviewPrimaryScope {
  const text = `${entry?.fileName ?? row.name} ${entry?.category ?? row.type} ${entry?.archivePath ?? row.path} ${entry?.summary ?? ""}`;
  if (/投资者|适当性|风险测评|合格投资者|风险匹配|税收居民|回访/.test(text)) return "investor";
  if (/被投公司|工商|企业基础|经营数据|审计报告/.test(text) && row.path.startsWith("项目档案")) return "company";
  if (row.path.startsWith("项目档案")) return "project";
  if (row.path.startsWith("基金档案")) return "fund";
  return "unassigned";
}

function inferInvestorName(entry?: MaterialKnowledgeEntry) {
  const match = entry?.summary.match(/投资者姓名\s*\/名称\s*([^\s]+)/);
  return match?.[1] ?? "";
}
