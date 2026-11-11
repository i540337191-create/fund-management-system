import {confirmAction} from './SystemConfirmation';
import {RefreshButton} from '../iterationA/RefreshButton';
import './prerequisite-fields.css';
import {NoticeHelp} from './NoticeHelp';
import {downloadDocument} from '../lib/documentDownload';
import {accountRoleLabels} from '../lib/accountTypes';
import {MaterialReferenceLink} from './MaterialReferenceLink';
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Project } from "../data/projects";
import { createApiClient, type ApprovalMaterial, type ApiMaterial, type ApiSessionUser, type WorkflowUser } from "../lib/apiClient";
import type { DiligenceAction, DiligenceCase, DiligenceFinding, DiligenceItem, DiligenceReport, DiligenceSections, DiligenceSupplement } from "../lib/diligenceTypes";
import { diligenceSectionTitles, parseDiligenceRequirements, renderDiligenceReportHtml } from "../lib/diligenceReport";
import { WorkflowDialog, MaterialUploadDialog } from "./MaterialFileDialogs";
import { Badge } from "./ui";
const api = createApiClient();
const field = "mt-1 block w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 py-2 text-sm";
const button = "rounded-md border border-[#2b3139] px-3 py-2 text-sm disabled:opacity-50";
const box = "rounded-lg border border-[#2b3139] bg-[#11161d] p-4";
const status: Record<string, string> = { active: "进行中", pending: "待审", approved: "已通过", rejected: "已否决", returned: "已退回", draft: "草稿", open: "待处理", closed: "已关闭", completed: "已完成" };
const severity = { low: "低", medium: "中", high: "高" };
const organizer = (user: ApiSessionUser) => ["admin", "investment_manager"].includes(user.role);
const last = <T,>(items: T[]) => items[items.length - 1];
const dateLabel = (value: string) => new Date(value).toLocaleString("zh-CN");
function errorMessage(error: unknown) {
  const { code, status } = (error ?? {}) as { code?: string; status?: number };
  const errors: Record<string, string> = {
    project_owner_required: "请先在三会审批中绑定项目负责人账号。",
    diligence_exists: "该项目已有尽调档案，请刷新读取已有记录。",
    diligence_revision_conflict: "尽调记录已变化。请保留输入，关闭窗口并刷新后核对；未确认结果时可以原样重试。",
    diligence_frozen: "当前档案正在评审或已形成终态，不能修改底稿；请先完成当前评审。",
    diligence_owner_locked: "尽调档案已绑定负责人，不能通过更换项目负责人绕过评审。",
    diligence_evidence_required: "每条资料要求都须选择一份本项目关联的真实原件。",
    material_not_linked: "资料未关联当前项目，请先在资料文件中维护关联。",
    material_integrity_mismatch: "原件与留存的文件内容不一致，请先核验文件；未以损坏文件完成提交。",
    material_blob_unavailable: "所选原件当前不可读取，请核验私有文件存储后重试。",
    diligence_report_stale: "报告引用的底稿已变化，请重新汇总并人工编辑新版本后提交。",
    diligence_items_incomplete: "至少需要一个尽调事项，且所有事项均须评审通过。",
    diligence_blocking_findings: "仍有阻断报告的发现项未关闭，请先完成处理。",
    diligence_report_requires_edit: "系统汇总稿须人工编辑结论并保存新版本，才能提交评审。",
    supplement_incomplete: "请先完成对应补件任务并填写说明，再重新提交。",
    decision_already_recorded: "当前账号已对该版本签署，不能重复或覆盖原意见。",
    not_diligence_assignee: "当前账号不能处理这项分工，请使用实际负责人或组织人员账号。",
    not_diligence_reviewer: "当前账号不是指定审阅人或本项目负责人。",
    task_managed_by_diligence: "该任务由尽调事项维护，请前往尽调处理。",
  };
  if (code && errors[code]) return errors[code];
  if (status === 401 || status === 403) return "登录失效或没有操作权限，请核对当前账号。";
  if (status === 400) return "输入不完整或格式不符合要求，请核对必填项、日期、资料要求和账号。";
  if (status === 409) return "记录状态已变化，请关闭窗口并刷新后核对；同一次请求可原样重试。";
  return "暂未确认保存结果，请保留当前输入原样重试；重复请求不会创建重复记录。";
}
function EvidenceLinks({ materials }: { materials: ApprovalMaterial[] }) {
  return <ul className="mt-2 space-y-2">{materials.map((material, index) => <li key={`${material.materialId}-${index}`}><MaterialReferenceLink material={material} className="text-gold">{material.name} · {"留存原件"}</MaterialReferenceLink></li>)}</ul>;
}
function SourceLinks({ submission }: { submission: DiligenceItem["submissions"][number] }) {
  return <EvidenceLinks materials={submission.evidence.map(entry => entry.material)} />;
}
function Opinions({ decisions }: { decisions: DiligenceReport["decisions"] }) {
  return <ul className="mt-3 space-y-2">{decisions.map((decision, index) => <li key={index} className="border-t border-[#2b3139] pt-2 text-sm"><p>{decision.actor.name} · {accountRoleLabels[decision.actor.role]} · {decision.decision === "approve" ? "通过" : decision.decision === "return" ? "退回补件" : "否决"} · {dateLabel(decision.time)}</p><p className="mt-1 whitespace-pre-wrap">{decision.opinion}</p></li>)}</ul>;
}
type Edit = { kind: "item"; item?: DiligenceItem } | { kind: "submit-item" | "review-item" | "reopen-item"; item: DiligenceItem } | { kind: "finding" } | { kind: "finding-status"; finding: DiligenceFinding; action: "resolve_finding" | "reopen_finding" } | { kind: "generate-report" } | { kind: "report" | "submit-report" | "review-report"; report: DiligenceReport } | { kind: "supplement"; supplement: DiligenceSupplement };

export function DiligencePanel({ project, onChanged,onEditingChange,prepareOnOpen=false }: { prepareOnOpen?:boolean; project: Project; onChanged: () => Promise<void>;onEditingChange?:(state:{dirty:boolean;busy:boolean})=>void }) {
  const [record, setRecord] = useState<{ diligence: DiligenceCase | null; currentUser: ApiSessionUser } | null>(null);
  const prepareRequested=useRef(prepareOnOpen);
  useEffect(()=>{if(!record||!prepareRequested.current)return;prepareRequested.current=false;if(!record.diligence&&organizer(record.currentUser))setCreating(true);},[record]);
  const [users, setUsers] = useState<WorkflowUser[]>([]); const [materials, setMaterials] = useState<ApiMaterial[]>([]);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [view, setView] = useState("事项与底稿");
  const [sourceNode, setSourceNode] = useState(""); const sourceTask = useRef(new URLSearchParams(window.location.search).get("taskId"));
  const [creating,setCreating]=useState(false),[setupDirty,setSetupDirty]=useState(false),[setupBusy,setSetupBusy]=useState(false);
  useEffect(()=>{onEditingChange?.({dirty:creating&&setupDirty,busy:creating&&setupBusy});},[creating,setupDirty,setupBusy,onEditingChange]);
  useEffect(()=>()=>onEditingChange?.({dirty:false,busy:false}),[onEditingChange]);
  useEffect(()=>{if(!creating||!setupDirty)return;const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[creating,setupDirty]);
  const [editing, setEditing] = useState<Edit | null>(null); const [uploading, setUploading] = useState(false); const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    try {
      const [result, directory, files] = await Promise.all([api.getDiligence(project.id), api.getUsers(), api.getMaterials()]);
      if (generation.current !== version) return;
      setRecord(result); setUsers(directory.users); setMaterials(files.materials); setError("");
    } catch (error) { if (generation.current === version) throw error; }
  }, [project.id]);
  useEffect(() => { setRecord(null); setEditing(null); setNotice(""); let active = true; load().catch(error => { if (active) setError(errorMessage(error)); }); return () => { active = false; generation.current++; }; }, [load]);
  useEffect(() => {
    const taskId = sourceTask.current, d = record?.diligence;
    if (!taskId || !d) return;
    const finding = d.findings.find(finding => finding.taskId === taskId);
    const report = d.reports.find(report => report.reviewTaskIds.includes(taskId));
    const supplement = d.supplements.find(supplement => supplement.taskId === taskId);
    const item = d.items.find(item => item.taskId === taskId);
    if (supplement) { setView(supplement.reportId ? "报告与评审" : "事项与底稿"); setSourceNode(`diligence-supplement-${taskId}`); }
    else if (finding) { setView("发现项"); setSourceNode(`diligence-finding-${finding.id}`); }
    else if (report) { setView("报告与评审"); setSourceNode(`diligence-report-${report.id}`); }
    else if (item) { setView("事项与底稿"); setSourceNode(`diligence-item-${item.id}`); }
    sourceTask.current = null;
  }, [record]);
  useEffect(() => { if (sourceNode) { const node = document.getElementById(sourceNode); node?.scrollIntoView({ block: "center" }); node?.focus({ preventScroll: true }); } }, [sourceNode, view]);
  const saved = async (diligence: DiligenceCase) => {
    if (diligence.projectId !== project.id) return;
    generation.current++;
    setRecord(current => current ? { ...current, diligence } : current); setEditing(null); setCreating(false); setNotice("尽调记录已保存，关联任务与审计同步留存。");
    try { await onChanged(); } catch { setNotice("尽调记录已保存；外层列表刷新暂未完成，可点击刷新核对。"); }
  };
  const d = record?.diligence; const user = record?.currentUser;
  const active = d?.status === "active"; const mayOrganize = !!user && organizer(user);
  const canWork = (ownerId: string) => !!user && (mayOrganize || user.role === "post_investment" && user.id === ownerId);
  const mayReview = !!user && !!d && organizer(user) && (d.ownerId === user.id || d.reviewers.some(reviewer => reviewer.id === user.id));
  const linked = materials.filter(material => material.originalFilePath && (material.projectId === project.id || material.relationships?.projects.some(p => p.id === project.id)));
  return <section className="diligence-workspace space-y-4">
    <div className={box}><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-semibold">尽调工作档案</h2><RefreshButton data-ui="info" type="button" className={button} onClick={() => { setError(""); load().catch(error => setError(errorMessage(error))); }}>刷新尽调记录</RefreshButton></div><details className="project-support-details"><summary>办理规则与当前账号</summary><p className="text-sm">事项 → 原件底稿 → 评审补件 → 发现项处理 → 报告评审。报告通过后继续办理决策建议与三会审批。</p>{user ? <p className="mt-2 text-sm">当前账号：{user.name}（{user.email}）</p> : null}</details>{d ? <div className="diligence-state"><Badge tone={d.status === "approved" ? "green" : d.status === "rejected" ? "red" : "gold"}>{status[d.status]}</Badge><span>修订 {d.revision}</span><span>审阅人：{d.reviewers.map(reviewer => reviewer.name).join("、")}</span><details><summary>查看审阅账号</summary><p>{d.reviewers.map(reviewer => `${reviewer.name}（${reviewer.email}）`).join("、")}</p></details></div> : null}</div>
    <p role="alert" className="text-sm text-orange-300">{error}<NoticeHelp message={error} projectId={project.id}/></p><p role="status" className="text-sm text-green-300">{notice}</p>
    {!record && !error ? <p role="status">正在读取尽调档案…</p> : null}
    {record && !d ? <div className="archive-empty"><h3>尚未建立尽调档案</h3><p>先指定审阅人，再建立检查清单、提交原件底稿。形成的尽调报告与审批意见将在这里留存。</p>{mayOrganize?<button type="button" data-ui="primary" onClick={()=>setCreating(true)}>建立尽调档案</button>:<p>请由管理员或投资经理组织。</p>}</div> : null}
    {creating?<WorkflowDialog title="建立尽调档案" busy={setupBusy} onClose={async()=>{if(!setupDirty||await confirmAction("尽调设置尚未保存，确认关闭？"))setCreating(false);}}><CaseSetup project={project} users={users} onSaved={saved} onDirtyChange={setSetupDirty} onBusyChange={setSetupBusy}/></WorkflowDialog>:null}
    {d && user ? <>
      <div className="diligence-view-tabs flex flex-wrap gap-2">{["事项与底稿", "发现项", "报告与评审"].map(tab => <button data-ui="filter" type="button" className={`${button} ${view === tab ? "text-gold" : ""}`} aria-pressed={view === tab} key={tab} onClick={() => setView(tab)}>{tab}</button>)}{["admin", "post_investment"].includes(user.role) ? <button data-ui="primary" type="button" className={button} onClick={() => setUploading(true)}>上传尽调资料</button> : null}<a data-ui="secondary" className={`${button} text-gold`} href={`/projects/${project.id}?tab=${encodeURIComponent("资料文件")}`}>资料文件与版本</a></div>
      <p className="diligence-view-help">{view === "事项与底稿" ? "查看分工与资料要求，展开底稿版本可核对正文、原件和评审意见。" : view === "发现项" ? "核对问题、责任人和依据；展开处理历史，查看登记、关闭或重开的原因。" : "展开报告版本查看正文与评审意见；系统汇总稿须人工编辑结论后才能送审。"}</p>
      {!active ? <p role="status" className="archive-status-line">{d.status === "pending" ? "报告评审中，底稿和发现项暂停修改。" : d.status === "approved" ? "尽调档案已通过，保留底稿与结论；后续交易准备须另行完成。" : "尽调报告已否决，当前档案冻结，负责人不能覆盖既有否决。"}</p> : null}
      {d.supplements.length ? <div className={`${box} space-y-3`}><h3 className="font-semibold">补件任务</h3>{d.supplements.map(supplement => { const ownerId = supplement.itemId ? d.items.find(item => item.id === supplement.itemId)?.owner.id : d.ownerId; return <div id={`diligence-supplement-${supplement.taskId}`} tabIndex={-1} key={supplement.taskId} className="border-t border-[#2b3139] pt-3 text-sm"><p>{supplement.itemId ? d.items.find(item => item.id === supplement.itemId)?.title : "报告补件"} · {supplement.status === "open" ? "待补件" : "已完成"}</p><p className="mt-1 whitespace-pre-wrap">{supplement.opinion}</p>{supplement.completedBy ? <p className="mt-1 text-[#929aa5]">{supplement.completedBy.name} · {supplement.completedAt && dateLabel(supplement.completedAt)} · {supplement.note}</p> : active && canWork(ownerId ?? "") ? <button data-ui="secondary" type="button" className={`${button} mt-2`} onClick={() => setEditing({ kind: "supplement", supplement })}>完成补件</button> : null}</div>; })}</div> : null}
      {view === "事项与底稿" ? <div className="space-y-4"><div className="flex items-center justify-between"><h3 className="font-semibold">尽调事项（{d.items.length}）</h3>{active && mayOrganize ? <button data-action="create" data-ui="primary" type="button" className={button} onClick={() => setEditing({ kind: "item" })}>新增尽调事项</button> : null}</div>{!d.items.length ? <p role="status" className={box}>尚无尽调事项。请按本项目实际需要录入分工和资料要求。</p> : null}{d.items.map(item => <details open={sourceNode===`diligence-item-${item.id}`} id={`diligence-item-${item.id}`} tabIndex={-1} className="project-record-list" key={item.id}><summary><strong>{item.title}</strong><span>{status[item.status]}</span><span>{item.owner.name} · {item.dueDate}</span></summary><div className="project-record-body"><div className="flex flex-wrap justify-between gap-3"><h4 className="font-semibold">{item.title} · {status[item.status]}</h4><div className="flex flex-wrap gap-2">{active && mayOrganize && !item.submissions.length ? <button data-ui="secondary" type="button" className={button} onClick={() => setEditing({ kind: "item", item })}>修改分工</button> : null}{active && canWork(item.owner.id) && ["draft", "returned"].includes(item.status) ? <button data-ui="primary" type="button" className={button} onClick={() => setEditing({ kind: "submit-item", item })}>提交底稿</button> : null}{active && mayReview && item.status === "pending" && !last(item.submissions)?.decisions.some(decision => decision.actor.id === user.id) ? <button data-ui="secondary" type="button" className={button} onClick={() => setEditing({ kind: "review-item", item })}>审阅底稿</button> : null}{active && mayOrganize && item.status === "approved" ? <button data-ui="secondary" type="button" className={button} onClick={() => setEditing({ kind: "reopen-item", item })}>重开底稿</button> : null}</div></div><p className="text-sm text-[#929aa5]">{item.category} · 负责人：{item.owner.name} · 截止：{item.dueDate}</p><ul className="list-inside list-disc text-sm">{item.requirements.map(requirement => <li key={requirement.id}>{requirement.title}</li>)}</ul>{item.submissions.map(submission => <details key={submission.id} className="rounded-md border border-[#2b3139] p-3 text-sm"><summary className="cursor-pointer">底稿 V{submission.version} · {status[submission.status]} · {submission.submittedBy.name} · {dateLabel(submission.time)}</summary><p className="mt-3 whitespace-pre-wrap">{submission.summary}</p><SourceLinks submission={submission} /><Opinions decisions={submission.decisions} /></details>)}</div></details>)}</div> : null}
      {view === "发现项" ? <div className="space-y-4"><div className="flex items-center justify-between"><h3 className="font-semibold">发现项（{d.findings.length}）</h3>{active && mayOrganize ? <button data-action="create" data-ui="primary" type="button" className={button} onClick={() => setEditing({ kind: "finding" })}>新增发现项</button> : null}</div>{!d.findings.length ? <p role="status" className={box}>尚无登记的发现项；不代表已经核验无风险。</p> : null}{d.findings.map(finding => <details open={sourceNode===`diligence-finding-${finding.id}`} id={`diligence-finding-${finding.id}`} tabIndex={-1} className="project-record-list" key={finding.id}><summary><strong>{finding.description}</strong><span>{severity[finding.severity]}风险 · {status[finding.status]}</span></summary><div className="project-record-body"><div className="flex flex-wrap justify-between gap-3"><h4 className="font-semibold">{severity[finding.severity]}严重度 · {status[finding.status]} · {finding.blocksReport ? finding.status === "closed" ? "原阻断项已关闭" : "未关闭前阻断报告" : "持续记录"}</h4>{active && (finding.status === "open" ? canWork(finding.owner.id) : mayOrganize) ? <button data-ui="secondary" type="button" className={button} onClick={() => setEditing({ kind: "finding-status", finding, action: finding.status === "open" ? "resolve_finding" : "reopen_finding" })}>{finding.status === "open" ? "关闭发现项" : "重开发现项"}</button> : null}</div><p className="whitespace-pre-wrap text-sm">{finding.description}</p><p className="text-sm text-[#929aa5]">负责人：{finding.owner.name} · 截止：{finding.dueDate} · 关联事项：{finding.itemIds.map(id => d.items.find(item => item.id === id)?.title ?? '关联事项').join("、") || "未选择"}</p><ul className="text-sm">{(finding.evidence ?? []).map((material, index) => <li key={index}><MaterialReferenceLink material={material} className="text-gold">{material.name} · 留存原件</MaterialReferenceLink><p className="break-all text-xs"></p></li>)}</ul><details className="text-sm"><summary className="cursor-pointer">处理历史</summary><ul className="mt-2 space-y-2">{finding.history.map((event, index) => <li key={index}>{event.actor.name} · {dateLabel(event.time)} · {event.action === "created" ? "登记" : event.action === "resolved" ? "关闭" : "重开"}<p className="whitespace-pre-wrap">{event.note}</p></li>)}</ul></details></div></details>)}</div> : null}
      {view === "报告与评审" ? <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">内部尽调报告版本</h3>{active && mayOrganize ? <button data-ui="secondary" type="button" className={button} onClick={() => setEditing({ kind: "generate-report" })}>汇总新草稿</button> : null}</div><p className="text-sm text-[#929aa5]">草稿仅汇总真实底稿和发现项。人工编辑并保存新版本后方可提交；可下载 Word 或 PDF；内容保留当前版本和审核状态，正式制度模板仍需业务确认。</p>{!d.reports.length ? <p role="status" className={box}>尚无报告版本。</p> : null}{[...d.reports].reverse().map(report => <details open={sourceNode===`diligence-report-${report.id}`} id={`diligence-report-${report.id}`} tabIndex={-1} key={report.id} className="project-record-list"><summary><strong>尽调报告 V{report.version}</strong><span>{status[report.status]}</span></summary><div className="project-record-body"><div className="flex flex-wrap justify-between gap-3"><h4 className="font-semibold">报告 V{report.version} · {status[report.status]}</h4><div className="flex flex-wrap gap-2">{(['docx','pdf'] as const).map(format=><button data-ui="info" key={format} type="button" className={button} onClick={async()=>{setError('');try{await downloadDocument(`/api/projects/${encodeURIComponent(project.id)}/diligence/reports/${encodeURIComponent(report.id)}/${format}`,`${project.shortName||project.name}-尽调报告-V${report.version}.${format}`);}catch{setError('文件暂未生成，请核对引用资料是否可读取，或稍后重试。');}}}>下载 {format==='docx'?'Word':'PDF'}</button>)}<button data-ui="info" type="button" className={button} onClick={async () => { setError(""); try { const actual = (await api.getDiligenceReport(project.id, report.id)).report; const blob = new Blob([renderDiligenceReportHtml(project.name, actual)], { type: "text/html;charset=utf-8" }); const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `${project.shortName || project.name}-尽调报告-V${actual.version}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { setError(errorMessage(error)); } }}>下载 HTML 报告</button>{active && mayOrganize ? <button data-ui="info" type="button" className={button} onClick={() => setEditing({ kind: "report", report })}>编辑并保存新版本</button> : null}{active && mayOrganize && report.id === last(d.reports)?.id && report.status === "draft" ? <button data-ui="primary" type="button" className={button} onClick={() => setEditing({ kind: "submit-report", report })}>提交报告评审</button> : null}{d.status === "pending" && report.status === "pending" && mayReview && !report.decisions.some(decision => decision.actor.id === user.id) ? <button data-ui="secondary" type="button" className={button} onClick={() => setEditing({ kind: "review-report", report })}>评审报告</button> : null}</div></div><p className="text-sm text-[#929aa5]">{report.savedBy.name} · {dateLabel(report.time)} · {report.origin === "manual_edit" ? "人工编辑" : "系统汇总"} · 引用 {report.source.items.length} 个事项、{report.source.findings.length} 个发现项</p><details className="text-sm"><summary className="cursor-pointer">报告正文与引用版本</summary>{diligenceSectionTitles.map(([key, label]) => <div key={key} className="mt-3"><h5 className="font-semibold">{label}</h5><p className="whitespace-pre-wrap">{report.sections[key]}</p></div>)}<ul className="mt-3 space-y-3">{report.source.items.map(item => <li key={item.id}>{item.title} · 底稿 V{last(item.submissions)?.version}{last(item.submissions) ? <SourceLinks submission={last(item.submissions)!} /> : null}</li>)}</ul><ul className="mt-3 space-y-3">{report.source.findings.map(finding => <li key={finding.id}>{finding.description} · 报告留存状态：{status[finding.status]}<EvidenceLinks materials={finding.evidence} /></li>)}</ul></details><Opinions decisions={report.decisions} /></div></details>)}</div> : null}
      {editing ? <DiligenceActionDialog edit={editing} diligence={d} users={users} materials={linked} projectId={project.id} onClose={() => setEditing(null)} onSaved={saved} /> : null}
    </> : null}
    {uploading ? <MaterialUploadDialog projects={[project]} categories={["尽调资料", "财务资料", "法务资料", "其他资料"]} onClose={() => setUploading(false)} onSaved={async () => { await load(); setUploading(false); setNotice("原件已上传并关联当前项目，可用于底稿提交。"); try { await onChanged(); } catch { /* Saved material remains visible in this panel. */ } }} /> : null}
  </section>;
}

function CaseSetup({ project, users, onSaved,onDirtyChange,onBusyChange }: { project: Project; users: WorkflowUser[]; onSaved: (d: DiligenceCase) => Promise<void>;onDirtyChange?:(dirty:boolean)=>void;onBusyChange?:(busy:boolean)=>void }) {
  const [reviewers, setReviewers] = useState<string[]>([]); const [note, setNote] = useState(""); const [id, setId] = useState(() => crypto.randomUUID()); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
  useEffect(()=>{onDirtyChange?.(Boolean(reviewers.length||note));},[reviewers,note,onDirtyChange]);
  return <form className={`${box} space-y-4`} onSubmit={async event => { event.preventDefault(); if (busy) return; if (!reviewers.length) { setError("至少选择一位真实审阅人。"); return; } setBusy(true); setError(""); try { const result = await api.createDiligence(project.id, { requestId: id, reviewerIds: reviewers, note }); await onSaved(result.diligence); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); } }}><h3 className="font-semibold">建立尽调档案</h3>{!project.ownerId ? <p className="text-sm text-orange-300">请先在“三会审批”绑定项目负责人，尽调不会通过自由填写姓名授予独立签署权。<NoticeHelp message="请先在三会审批中绑定项目负责人账号。" projectId={project.id}/></p> : null}<fieldset className="prerequisite-group" id={`diligence-reviewers-${project.id}`} tabIndex={-1} aria-invalid={Boolean(error)&&!reviewers.length} disabled={busy}><legend className="mb-2 text-sm">指定审阅人（普通流程需全部通过，负责人本人可独立放行）</legend><div className="max-h-40 space-y-2 overflow-auto">{users.filter(user => user.canLogin && organizer(user)).map(user => <label key={user.id} className="flex gap-2 text-sm"><input type="checkbox" checked={reviewers.includes(user.id)} onChange={event => { setReviewers(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id)); setId(crypto.randomUUID()); setError(""); }} />{user.name} · {user.email}</label>)}</div></fieldset><label className="block text-sm">尽调说明<textarea className={field} disabled={busy} value={note} onChange={event => { setNote(event.target.value); setId(crypto.randomUUID()); }} /></label><p role="alert" className="text-sm text-orange-300">{error}<NoticeHelp message={error} projectId={project.id} targetId={!reviewers.length?`diligence-reviewers-${project.id}`:undefined} label={!reviewers.length?'选择尽调审阅人':undefined}/></p><button data-ui="primary" type="submit" disabled={busy || !project.ownerId} className={button}>{busy ? "建立中…" : "建立尽调档案"}</button></form>;
}

function DiligenceActionDialog({ edit, diligence, users, materials, projectId, onClose, onSaved }: { edit: Edit; diligence: DiligenceCase; users: WorkflowUser[]; materials: ApiMaterial[]; projectId: string; onClose: () => void; onSaved: (d: DiligenceCase) => Promise<void> }) {
  const item = "item" in edit ? edit.item : undefined;
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()); const [revision] = useState(diligence.revision); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [values, setValues] = useState({ title: item?.title ?? "", category: item?.category ?? "业务尽调", ownerId: item?.owner.id ?? "", dueDate: item?.dueDate ?? new Date().toISOString().slice(0, 10), requirementsText: item?.requirements.map(requirement => requirement.title).join("\n") ?? "", summary: item && last(item.submissions)?.summary || "", opinion: "", decision: "approve", description: "", severity: "medium", note: "" });
  const [requirements, setRequirements] = useState(item?.requirements ?? []); const [evidence, setEvidence] = useState<Record<string, string>>(() => Object.fromEntries((item && last(item.submissions)?.evidence || []).map(entry => [entry.requirementId, entry.material.materialId])));
  const [selectedItems, setSelectedItems] = useState<string[]>([]); const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]); const [blocksReport, setBlocksReport] = useState(true);
  const [sections, setSections] = useState<DiligenceSections>(edit.kind === "report" ? { ...edit.report.sections } : { summary: "", workPerformed: "", findings: "", recommendation: "" });
  const update = (key: keyof typeof values, value: string) => { setValues(current => ({ ...current, [key]: value })); setRequestId(crypto.randomUUID()); setError(""); };
  const changed = () => { setRequestId(crypto.randomUUID()); setError(""); };
  const title = edit.kind === "item" ? item ? "修改尽调分工" : "新增尽调事项" : edit.kind === "submit-item" ? "提交尽调底稿" : edit.kind === "review-item" ? "审阅尽调底稿" : edit.kind === "reopen-item" ? "重开尽调底稿" : edit.kind === "finding" ? "新增尽调发现项" : edit.kind === "finding-status" ? edit.action === "resolve_finding" ? "关闭尽调发现项" : "重开尽调发现项" : edit.kind === "generate-report" ? "汇总尽调草稿" : edit.kind === "report" ? "编辑尽调报告新版本" : edit.kind === "submit-report" ? "提交尽调报告评审" : edit.kind === "review-report" ? "评审尽调报告" : "完成尽调补件";
  const eligible = users.filter(user => user.canLogin && ["admin", "investment_manager", "post_investment"].includes(user.role));
  const ownerField = <label className="block text-sm">负责人账号<select required disabled={busy} className={field} value={values.ownerId} onChange={event => update("ownerId", event.target.value)}><option value="">请选择真实账号</option>{eligible.map(user => <option value={user.id} key={user.id}>{user.name} · {user.email}</option>)}</select></label>;
  const dueField = <label className="block text-sm">截止日<input required type="date" disabled={busy} className={field} value={values.dueDate} onChange={event => update("dueDate", event.target.value)} /></label>;
  const textField = (label: string, key: keyof typeof values, required = true) => <label className="block text-sm">{label}<textarea required={required} disabled={busy} className={field} value={values[key]} aria-describedby="diligence-action-error" onChange={event => update(key, event.target.value)} /></label>;
  const noteField = textField("处理 / 补件说明", "note");
  const reviewFields = <><label className="block text-sm">评审结论<select disabled={busy} className={field} value={values.decision} onChange={event => update("decision", event.target.value)}><option value="approve">通过</option><option value="return">退回补件</option>{edit.kind === "review-report" ? <option value="reject">否决</option> : null}</select></label>{textField("审阅意见", "opinion")}<p className="text-sm text-[#929aa5]">意见追加留存，不能修改；负责人独立放行只对本人项目生效。</p></>;
  let fields: ReactNode;
  switch (edit.kind) {
    case "item": fields = <><label className="block text-sm">事项名称<input autoFocus required disabled={busy} maxLength={500} className={field} value={values.title} onChange={event => update("title", event.target.value)} /></label><label className="block text-sm">尽调类别<input required disabled={busy} maxLength={200} className={field} value={values.category} onChange={event => update("category", event.target.value)} /></label>{ownerField}{dueField}<label className="block text-sm">资料要求（每行一项）<textarea required disabled={busy} className={field} value={values.requirementsText} onChange={event => { update("requirementsText", event.target.value); setRequirements(previous => parseDiligenceRequirements(event.target.value, previous, () => crypto.randomUUID())); }} /></label></>; break;
    case "submit-item": fields = <><p className="font-semibold">{edit.item.title}</p>{textField("底稿结论与核查说明", "summary")}{edit.item.requirements.map(requirement => <label key={requirement.id} className="block text-sm">{requirement.title}<select required disabled={busy} className={field} value={evidence[requirement.id] ?? ""} onChange={event => { setEvidence(current => ({ ...current, [requirement.id]: event.target.value })); changed(); }}><option value="">请选择本项目关联原件</option>{materials.map(material => <option key={material.id} value={material.id}>{material.name} · {material.currentVersion ? `V${material.currentVersion}` : "历史原件"}</option>)}</select></label>)}<p className="text-sm text-[#929aa5]">提交时留存当前原件版本。以后更新资料不会覆盖本次底稿；资料不足请先上传或维护项目关联。</p></>; break;
    case "review-item": fields = <><p className="font-semibold">{edit.item.title}</p><p className="whitespace-pre-wrap text-sm">{last(edit.item.submissions)?.summary}</p>{last(edit.item.submissions) ? <SourceLinks submission={last(edit.item.submissions)!} /> : null}{reviewFields}</>; break;
    case "reopen-item": fields = <><p className="text-sm">保留已通过的旧底稿与审阅意见，重开后须补件、提交新版本并重新审阅。旧报告不会自动引用新结论。</p>{noteField}</>; break;
    case "finding": fields = <>{textField("发现项描述", "description")}<label className="block text-sm">严重度<select disabled={busy} className={field} value={values.severity} onChange={event => update("severity", event.target.value)}>{Object.entries(severity).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{ownerField}{dueField}<label className="flex gap-2 text-sm"><input type="checkbox" disabled={busy} checked={blocksReport} onChange={event => { setBlocksReport(event.target.checked); changed(); }} />未关闭时阻断报告提交</label><fieldset disabled={busy}><legend className="mb-2 text-sm">关联尽调事项</legend>{diligence.items.map(item => <label className="flex gap-2 text-sm" key={item.id}><input type="checkbox" checked={selectedItems.includes(item.id)} onChange={event => { setSelectedItems(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id)); changed(); }} />{item.title}</label>)}</fieldset><fieldset disabled={busy}><legend className="mb-2 text-sm">发现项证据原件（提交时留存版本）</legend>{materials.map(material => <label className="flex gap-2 text-sm" key={material.id}><input type="checkbox" checked={selectedMaterials.includes(material.id)} onChange={event => { setSelectedMaterials(current => event.target.checked ? [...current, material.id] : current.filter(id => id !== material.id)); changed(); }} />{material.name}</label>)}</fieldset></>; break;
    case "finding-status": fields = <><p className="whitespace-pre-wrap text-sm">{edit.finding.description}</p>{noteField}</>; break;
    case "generate-report": fields = <p className="text-sm">将本档案的真实事项底稿与发现项汇总为新的内部报告草稿，保留来源留存记录。请随后人工编辑结论建议并保存新版本；自动汇总稿不能直接提交。</p>; break;
    case "report": fields = <>{diligenceSectionTitles.map(([key, label]) => <label className="block text-sm" key={key}>{label}<textarea required disabled={busy} rows={4} className={field} value={sections[key]} onChange={event => { setSections(current => ({ ...current, [key]: event.target.value })); changed(); }} /></label>)}<p className="text-sm text-[#929aa5]">保存新版本会重新留存当前底稿留存记录，旧报告正文与来源继续保留。</p></>; break;
    case "submit-report": fields = <>{dueField}<p className="text-sm">提交报告 V{edit.report.version}。所有事项须通过、阻断发现项及补件须关闭，报告源版本须与当前底稿一致。待审期间暂停修改底稿。</p></>; break;
    case "review-report": fields = <><p className="font-semibold">报告 V{edit.report.version}</p><p className="whitespace-pre-wrap text-sm">{edit.report.sections.recommendation}</p>{reviewFields}</>; break;
    case "supplement": fields = <><p className="whitespace-pre-wrap text-sm">{edit.supplement.opinion}</p><p className="text-sm text-[#929aa5]">完成补件只关闭该待办；底稿或报告仍需重新提交评审。</p>{noteField}</>; break;
  }
  return <WorkflowDialog title={title} busy={busy} onClose={onClose}><form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    const base = { requestId, expectedRevision: revision }; let input: DiligenceAction;
    switch (edit.kind) {
      case "item": { const fields = { title: values.title, category: values.category, ownerId: values.ownerId, dueDate: values.dueDate, requirements }; input = edit.item ? { ...base, action: "update_item", itemId: edit.item.id, ...fields } : { ...base, action: "add_item", ...fields }; break; }
      case "submit-item": input = { ...base, action: "submit_item", itemId: edit.item.id, summary: values.summary, evidence: edit.item.requirements.map(requirement => ({ requirementId: requirement.id, materialId: evidence[requirement.id] ?? "" })) }; break;
      case "review-item": input = { ...base, action: "review_item", itemId: edit.item.id, decision: values.decision as "approve" | "return", opinion: values.opinion }; break;
      case "reopen-item": input = { ...base, action: "reopen_item", itemId: edit.item.id, note: values.note }; break;
      case "finding": input = { ...base, action: "add_finding", description: values.description, severity: values.severity as DiligenceFinding["severity"], ownerId: values.ownerId, dueDate: values.dueDate, itemIds: selectedItems, materialIds: selectedMaterials, blocksReport }; break;
      case "finding-status": input = { ...base, action: edit.action, findingId: edit.finding.id, note: values.note }; break;
      case "generate-report": input = { ...base, action: "save_report" }; break;
      case "report": input = { ...base, action: "save_report", sections }; break;
      case "submit-report": input = { ...base, action: "submit_report", reportId: edit.report.id, dueDate: values.dueDate }; break;
      case "review-report": input = { ...base, action: "review_report", reportId: edit.report.id, decision: values.decision as "approve" | "return" | "reject", opinion: values.opinion }; break;
      case "supplement": input = { ...base, action: "complete_supplement", taskId: edit.supplement.taskId, note: values.note }; break;
    }
    try { const result = await api.actOnDiligence(projectId, input); await onSaved(result.diligence); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }}>{fields}<p role="alert" id="diligence-action-error" className="text-sm text-orange-300">{error}<NoticeHelp message={error} projectId={projectId}/></p><div className="flex justify-end gap-3"><button data-ui="secondary" type="button" disabled={busy} className={button} onClick={onClose}>取消</button><button data-ui="primary" type="submit" disabled={busy} className={`${button} bg-gold text-[#181a20]`}>{busy ? "保存中…" : "确认并保存"}</button></div></form></WorkflowDialog>;
}
