import {materialReferencePresentation,hasMaterialReadRestrictions} from './materialReference.ts';
import type {ApprovalMaterial} from './apiClient.ts';
import type { DiligenceReport, DiligenceRequirement } from "./diligenceTypes";

export function parseDiligenceRequirements(text: string, previous: DiligenceRequirement[], nextId: () => string) {
  const titles = text.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  return titles.map(title => ({ id: previous.find(item => item.title === title)?.id ?? nextId(), title }));
}
export const diligenceSectionTitles = [["summary", "摘要"], ["workPerformed", "尽调工作"], ["findings", "发现与风险"], ["recommendation", "结论建议"]] as const;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const status = { draft: "草稿", pending: "待审", approved: "已通过", returned: "已退回", rejected: "已否决" };

// Export only the selected immutable report version, never a newer live case.
export function renderDiligenceReportHtml(projectName: string, report: DiligenceReport) {
  const section = (title: string, body: string) => `<h2>${escape(title)}</h2><p>${escape(body).replace(/\n/g, "<br>")}</p>`;
  const evidenceLabel=(material:ApprovalMaterial)=>{const view=materialReferencePresentation(material);return `${escape(view.label)}；版本ID：${escape(material.versionId??"历史原件")}；SHA256：${escape(material.sha256)}；${view.href?`原件地址：${escape(view.href)}`:"当前原件不可下载"}`;};
  const evidence = report.source.items.map(item => {
    const submission = item.submissions[item.submissions.length - 1];
    return `<li><h3>${escape(item.title)} · ${escape(item.category)}</h3><p>负责人：${escape(item.owner.name)}；底稿版本：${submission?.version ?? "无"}</p>${submission ? `<p>${escape(submission.summary)}</p><ul>${submission.evidence.map(entry => `<li>${escape(item.requirements.find(r => r.id === entry.requirementId)?.title ?? entry.requirementId)}：${evidenceLabel(entry.material)}</li>`).join("")}</ul>` : ""}</li>`;
  }).join("");
  const findingEvidence = (finding: DiligenceReport["source"]["findings"][number]) => `<ul>${finding.evidence.map(material => `<li>${evidenceLabel(material)}</li>`).join("")}</ul>`;
  const findings = report.source.findings.map(finding => `<li>${escape(finding.description)}；严重度：${escape(finding.severity)}；状态：${escape(finding.status)}；责任人：${escape(finding.owner.name)}${findingEvidence(finding)}<ul>${finding.history.map(event => `<li>${escape(event.actor.name)} · ${escape(event.time)} · ${escape(event.action)}：${escape(event.note)}</li>`).join("")}</ul></li>`).join("");
  const decisions = report.decisions.map(decision => `<li>${escape(decision.actor.name)}（${escape(decision.actor.role)}）· ${escape(decision.time)} · ${escape(decision.decision)}：${escape(decision.opinion)}</li>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(projectName)} · 尽调报告 V${report.version}</title><style>body{max-width:900px;margin:40px auto;padding:0 24px;font:16px/1.8 system-ui,sans-serif;color:#222}h1{font-size:26px}h2{font-size:20px;border-bottom:1px solid #ddd}p,li{overflow-wrap:anywhere;white-space:pre-wrap}@media print{body{margin:0;max-width:none}h2,h3{break-after:avoid}li{break-inside:avoid}}</style></head><body><h1>${escape(projectName)} · 内部尽调报告</h1>${hasMaterialReadRestrictions(report)?"<p><strong>当前权限展示副本：部分内容或原件受限，本文件不替代原封存报告。</strong></p>":""}<p>版本：V${report.version}；状态：${status[report.status]}；保存人：${escape(report.savedBy.name)}；保存时间：${escape(report.time)}</p><p>人工编辑与系统汇总底稿，不代表正式制度模板或AI审定结论。引用对应本报告保存时的资料版本。</p>${diligenceSectionTitles.map(([key, title]) => section(title, report.sections[key])).join("")}<h2>底稿及原件版本</h2><ul>${evidence}</ul><h2>发现项处理历史</h2><ul>${findings}</ul><h2>评审意见</h2><ul>${decisions}</ul></body></html>`;
}
