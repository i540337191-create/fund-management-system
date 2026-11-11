import {isEngineeringRecord} from './dataOrigin.ts';
import type { Project } from "../data/projects";

export type MaterialRecord = [
  name: string,
  type: string,
  uploader: string,
  time: string,
  source: string,
  status: string,
  quotes: string,
  project: string,
  dataOrigin?: string,
  dataPurpose?: string,
];

export type MaterialFilterState = {
  category: string;
  projectQuery: string;
  fundName: string;
  stage: string;
  relationScope?: MaterialRelationScope;
};

export type MaterialRelationScope = "全部关系" | "基金" | "项目" | "被投公司" | "投资人";

export type ApiMaterialRelation = {
  id: string;
  name: string;
  relationType?: string;
  isPrimary?: boolean;
};

export type ApiMaterialRelationships = {
  funds: ApiMaterialRelation[];
  projects: ApiMaterialRelation[];
  companies: ApiMaterialRelation[];
  investors: ApiMaterialRelation[];
};

export type ApiMaterialRecord = {
  sourceBasis?:{id:string;dataOrigin:string;dataPurpose?:string}[];
  generatedDocumentHref?:string;
  generatedDocumentSource?:string;
  currentVersion?: number;
  currentVersionId?: string;
  id: string;
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
  path?: string;
  primaryScope?: string | null;
  archivePath?: string | null;
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
  relationships?: ApiMaterialRelationships;
  dataOrigin?: string;
  dataPurpose?:string;
  currentVersionPurpose?:string;
};

export type MaterialDirectoryRow = {
  materialId?:string;
  name: string;
  type: string;
  uploader: string;
  time: string;
  source: string;
  status: string;
  quotes: string;
  project: string;
  fund: string;
  stage: string;
  path: string;
  rule: string;
  confidence: "高" | "中";
  relationScope?: MaterialRelationScope;
  relationSummary?: string;
  dataOrigin?: string;
  dataPurpose?:string;
  currentVersionPurpose?:string;
};

export type MaterialUploadDraft = {
  name: string;
  type: string;
  uploader: string;
  time: string;
  source: string;
  status: string;
  project: string;
};

export function createUploadedMaterialRecord(draft: MaterialUploadDraft): MaterialRecord {
  return [draft.name, draft.type, draft.uploader, draft.time, draft.source, draft.status, "0", draft.project,'user_input'];
}

export function filterMaterialsByProject(materials: MaterialRecord[], projectQuery: string) {
  const normalizedQuery = projectQuery.trim().toLowerCase();
  if (!normalizedQuery) return materials;

  return materials.filter((material) => material[7].toLowerCase().includes(normalizedQuery));
}

export function inferMaterialArchivePath(material: MaterialRecord) {
  const [name, type, , , source] = material;
  const text = `${name} ${type} ${source}`;

  if (/信披|信息披露|半年度报告|年度报告|实施细则/.test(text)) return "基金档案 / 信息披露 / 报告模板";
  if (/清算|终止|股权转让|财产分配|合伙人大会/.test(text)) return "基金档案 / 清算退出 / 清算文件";
  if (/份额转让|转让申请/.test(text)) return "基金档案 / 重大事项 / 份额转让";
  if (/立项审批/.test(text)) return "基金档案 / 投资管理 / 立项审批";
  if (/资金到账|缴款|出资能力|审计报告/.test(text)) return "基金档案 / 募集 / 出资证明";
  if (/适当性|风险测评|基本信息表|合格投资者|回访|税收居民|风险匹配|调查表/.test(text)) {
    return "基金档案 / 募集 / 投资者适当性";
  }
  if (/托管协议|监督协议|无托管|合伙协议|招募说明|备案承诺|备案模版|风险揭示/.test(text)) {
    return "基金档案 / 募集 / 备案与协议";
  }
  if (/产品结构图|工商公示/.test(text)) return "基金档案 / 募集 / 基础信息";
  if (/功能构想|需求/.test(text)) return "产品资料 / 需求构想 / 功能说明";
  if (/协议|条款|PDF 上传/.test(text)) return "项目档案 / 协议条款 / 投资协议";
  if (/会议|纪要|语音转写/.test(text)) return "项目档案 / 会议纪要 / 投后沟通";
  if (/财务|报表|Excel|xlsx|大表/.test(text)) return "基金档案 / 账户资金 / 季度大表";
  if (/募集|适当性|签署/.test(text)) return "基金档案 / 募集 / 适当性资料";
  if (/诉讼|法务/.test(text)) return "项目档案 / 法务资料 / 风险核查";
  if (/BP|基础/.test(text)) return "项目档案 / 基础资料 / BP";

  return "项目档案 / 其他资料 / 待复核";
}

export function createMaterialDirectoryRows(materials: MaterialRecord[], projects: Project[]): MaterialDirectoryRow[] {
  return materials.map((material) => {
    const [name, type, uploader, time, source, status, quotes, projectName] = material;
    const project = projects.find((item) => item.name === projectName || item.shortName === projectName);
    const path = inferMaterialArchivePath(material);
    const rule = inferMaterialRule(material, path);
    const isFundLevelMaterial = !project && projectName.includes("基金");

    return {
      name,
      type,
      uploader,
      time,
      source,
      status,
      quotes,
      project: projectName,
      fund: project?.fund ?? (isFundLevelMaterial ? projectName : "未匹配基金"),
      stage: project?.stage ?? inferStageFromPath(path),
      path,
      rule,
      confidence: source.includes("AI 收件箱") || status === "已摘要" ? "高" : "中",
      dataOrigin: material[8]??inferMaterialDataOrigin(source),
      dataPurpose:material[9]??'unknown',
    };
  });
}

export function createApiMaterialDirectoryRows(materials: ApiMaterialRecord[], projects: Project[]): MaterialDirectoryRow[] {
  return materials.map((material) => {
    const relationships = normalizeRelationships(material.relationships);
    const primaryProjectName = relationships.projects[0]?.name ?? material.project;
    const matchedProject = projects.find((project) => project.id === material.projectId || project.name === primaryProjectName || project.shortName === primaryProjectName);
    const fundName = relationships.funds[0]?.name ?? matchedProject?.fund ?? material.project;
    const path = material.archivePath ?? material.path ?? inferMaterialArchivePath(apiMaterialToTuple(material));
    const relationScope = relationScopeLabel(material.primaryScope, relationships);

    return {
      materialId: material.id,
      name: material.name,
      type: material.type,
      uploader: material.uploader,
      time: material.time,
      source: material.source,
      status: material.status,
      quotes: material.quotes,
      project: primaryProjectName,
      fund: fundName,
      stage: matchedProject?.stage ?? inferStageFromPath(path),
      path,
      rule: inferMaterialRule(apiMaterialToTuple(material), path),
      confidence: material.source.includes("AI 收件箱") || material.status === "已摘要" ? "高" : "中",
      relationScope,
      relationSummary: summarizeRelationships(relationships),
      dataOrigin: material.dataOrigin ?? inferMaterialDataOrigin(material.source),
    };
  });
}

export function filterMaterials(
  materials: MaterialRecord[],
  filters: MaterialFilterState,
  projects: Project[],
) {
  const rows = createMaterialDirectoryRows(materials, projects);
  const normalizedQuery = filters.projectQuery.trim().toLowerCase();

  return materials.filter((material, index) => {
    const row = rows[index];
    const categoryMatches = filters.category === "全部资料" || material[1] === filters.category;
    const searchableText = [
      row.name,
      row.type,
      row.source,
      row.status,
      row.project,
      row.fund,
      row.stage,
      row.path,
      row.rule,
    ]
      .join(" ")
      .toLowerCase();
    const projectMatches = !normalizedQuery || searchableText.includes(normalizedQuery);
    const fundMatches = filters.fundName === "全部基金" || row.fund === filters.fundName;
    const stageMatches = filters.stage === "全部阶段" || row.stage === filters.stage;

    return categoryMatches && projectMatches && fundMatches && stageMatches;
  });
}

export function filterApiMaterials(
  materials: ApiMaterialRecord[],
  filters: MaterialFilterState,
  projects: Project[],
) {
  const rows = createApiMaterialDirectoryRows(materials, projects);
  const normalizedQuery = filters.projectQuery.trim().toLowerCase();
  const relationScope = filters.relationScope ?? "全部关系";

  return materials.filter((material, index) => {
    const row = rows[index];
    const relationships = normalizeRelationships(material.relationships);
    const categoryMatches = filters.category === "全部资料" || material.type === filters.category;
    const searchableText = [
      row.name,
      row.type,
      row.source,
      row.status,
      row.project,
      row.fund,
      row.stage,
      row.path,
      row.rule,
      row.relationSummary,
      ...relationships.funds.map((relation) => relation.name),
      ...relationships.projects.map((relation) => relation.name),
      ...relationships.companies.map((relation) => relation.name),
      ...relationships.investors.map((relation) => relation.name),
    ]
      .join(" ")
      .toLowerCase();
    const queryMatches = !normalizedQuery || searchableText.includes(normalizedQuery);
    const fundMatches = filters.fundName === "全部基金" || relationships.funds.some((relation) => relation.name === filters.fundName) || row.fund === filters.fundName;
    const stageMatches = filters.stage === "全部阶段" || row.stage === filters.stage;
    const relationMatches = relationScope === "全部关系" || hasRelationScope(relationships, relationScope);

    return categoryMatches && queryMatches && fundMatches && stageMatches && relationMatches;
  });
}

function hasRelationScope(relationships: ApiMaterialRelationships, relationScope: MaterialRelationScope) {
  if (relationScope === "基金") return relationships.funds.length > 0;
  if (relationScope === "项目") return relationships.projects.length > 0;
  if (relationScope === "被投公司") return relationships.companies.length > 0;
  if (relationScope === "投资人") return relationships.investors.length > 0;
  return true;
}

function relationScopeLabel(primaryScope: string | null | undefined, relationships: ApiMaterialRelationships): MaterialRelationScope {
  if (primaryScope === "investor") return "投资人";
  if (primaryScope === "company") return "被投公司";
  if (primaryScope === "project") return "项目";
  if (primaryScope === "fund") return "基金";
  if (relationships.investors.length > 0) return "投资人";
  if (relationships.companies.length > 0) return "被投公司";
  if (relationships.projects.length > 0) return "项目";
  if (relationships.funds.length > 0) return "基金";
  return "全部关系";
}

function summarizeRelationships(relationships: ApiMaterialRelationships) {
  return [
    relationshipSummaryPart("基金", relationships.funds),
    relationshipSummaryPart("项目", relationships.projects),
    relationshipSummaryPart("被投公司", relationships.companies),
    relationshipSummaryPart("投资人", relationships.investors),
  ]
    .filter(Boolean)
    .join(" / ");
}

function relationshipSummaryPart(label: string, relations: ApiMaterialRelation[]) {
  if (relations.length === 0) return "";
  return `${label}：${relations.map((relation) => relation.name).join("、")}`;
}

function normalizeRelationships(relationships: ApiMaterialRelationships | undefined): ApiMaterialRelationships {
  return {
    funds: relationships?.funds ?? [],
    projects: relationships?.projects ?? [],
    companies: relationships?.companies ?? [],
    investors: relationships?.investors ?? [],
  };
}

function apiMaterialToTuple(material: ApiMaterialRecord): MaterialRecord {
  return [
    material.name,
    material.type,
    material.uploader,
    material.time,
    material.source,
    material.status,
    material.quotes,
    material.project,
    material.dataOrigin??'unknown',
    isEngineeringRecord(material)?'engineering_fixture':'unknown',
  ];
}

export function inferMaterialDataOrigin(source: string) {
  if (source === "真实物料 / OCR API") return "source_pdf_ocr";
  if (source === "真实物料 / 原始文件") return "source_file";
  if (source === "用户上传") return "user_input";
  return "unknown";
}

function inferMaterialRule(material: MaterialRecord, path: string) {
  const [, type] = material;
  if (path.startsWith("项目档案 / 协议条款")) return `${type} -> 项目档案 / 协议条款`;
  if (path.startsWith("项目档案 / 会议纪要")) return `${type} -> 项目档案 / 会议纪要`;
  if (path.startsWith("基金档案 / 账户资金")) return `${type} -> 基金档案 / 账户资金`;
  if (path.startsWith("基金档案 / 募集")) return `${type} -> 基金档案 / 募集`;
  if (path.startsWith("基金档案 / 信息披露")) return `${type} -> 基金档案 / 信息披露`;
  if (path.startsWith("基金档案 / 清算退出")) return `${type} -> 基金档案 / 清算退出`;
  if (path.startsWith("基金档案 / 重大事项")) return `${type} -> 基金档案 / 重大事项`;
  if (path.startsWith("基金档案 / 投资管理")) return `${type} -> 基金档案 / 投资管理`;
  return `${type} -> ${path.split(" / ").slice(0, 2).join(" / ")}`;
}

function inferStageFromPath(path: string) {
  if (path.includes("募集")) return "募集期";
  if (path.includes("信息披露")) return "投后管理";
  if (path.includes("清算退出")) return "退出期";
  if (path.includes("重大事项")) return "投后管理";
  if (path.includes("投资管理")) return "投资期";
  if (path.includes("投后") || path.includes("账户资金") || path.includes("会议纪要")) return "投后管理";
  if (path.includes("协议条款")) return "协议签署";
  return "待确认";
}

// Database relations use stable IDs; names are only a fallback for legacy local fixtures.
export function selectProjectMaterialRecords(project: Project, materials: MaterialRecord[], apiMaterials: ApiMaterialRecord[], localDemo=false): MaterialRecord[] {
  const databaseNames = new Set(apiMaterials.map((material) => material.name));
  const legacy = localDemo?filterMaterialsByProject(materials.filter((material) => !databaseNames.has(material[0])), project.name):[];
  const related = apiMaterials.filter((material) => material.projectId === project.id || material.relationships?.projects.some((relation) => relation.id === project.id));
  return [...related.map((material): MaterialRecord => [material.name, material.type, material.uploader, material.time, material.source, material.status, material.quotes, project.name, material.dataOrigin??'unknown',isEngineeringRecord(material)?'engineering_fixture':'unknown']), ...legacy];
}
