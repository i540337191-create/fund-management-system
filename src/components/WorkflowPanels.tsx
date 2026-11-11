import '../iterationA/task-center.css';
import {RefreshButton} from '../iterationA/RefreshButton';
import './prerequisite-fields.css';
import {CompositionRing} from './CompositionRing';
import {TaskDeadlineOutlook} from './TaskDeadlineOutlook';
import {StatCard,StatusBadge} from './ui';
import {taskDeadlineSummary,isOpenTask,isOverdueTask} from '../lib/taskDeadlineSummary';
import {NoticeHelp} from './NoticeHelp';
import {accountRoleLabels} from '../lib/accountTypes';
import {MaterialReferenceLink} from './MaterialReferenceLink';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import {filterSeedDemoRecords} from '../lib/dataOriginFilter';
import {isReturnTask,returnTaskHref,returnTaskSummary} from '../lib/returnBasisView';
import { postTaskTab } from "../lib/postInvestmentView";
import { dataOriginLabel } from "../lib/dataOrigin";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../data/projects";
import { createApiClient, type ApiMaterial, type ApprovalRound, type ApprovalState, type WorkflowTask, type WorkflowTaskInput, type WorkflowTaskUpdate, type WorkflowUser } from "../lib/apiClient";
import { WorkflowDialog } from "./MaterialFileDialogs";
import {confirmAction} from './SystemConfirmation';
const api = createApiClient();
const field = "mt-1 block w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 py-2 text-sm";
const button = "rounded-md border border-[#2b3139] px-3 py-2 text-sm disabled:opacity-50";
const box = "rounded-lg border border-[#2b3139] bg-[#11161d] p-4";
const meetingTypes = ["立项会", "总办会", "投委会"];
const statusLabels = { pending: "待审", approved: "已通过", returned: "已退回", rejected: "已否决" };
const decisionLabels = { approve: "通过", return: "退回补件", reject: "否决" };
function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function message(error: unknown) {
  const { code, status } = (error ?? {}) as { code?: string; status?: number };
  const errors: Record<string,string> = {
    project_owner_required: "请先绑定可登录的真实项目负责人。",
    ineligible_user: "所选账号尚不能登录或不具备本操作权限。",
    material_not_linked: "材料必须先关联当前项目。",
    material_version_unavailable: "材料原件不可用，请核对原件或版本。",
    material_integrity_failure: "原件与登记文件内容不一致，审批未提交。",
    supplement_incomplete: "请先完成退回生成的补件任务，再重新提交。",
    meeting_sequence_conflict: "前序会议未通过，或当前流程已否决；不能跳过顺序。",
    review_task_managed_by_approval: "审批任务由签署结论关闭，请前往三会审批。",
    completion_note_required: "完成、取消或重开任务需要填写操作说明。",
    task_owner_required: "请先选择真实负责人账号。",
    supplement_consumed_by_resubmission: "该补件已用于后续审批，历史记录已冻结，不能重开或改写。",
    supplement_task_frozen: "该补件已用于后续审批，历史记录已冻结，不能重开或改写。",
    supplement_cannot_cancel: "必需补件任务不能取消，请完成补件后重新提交审批。",
    email_exists: "该邮箱已存在，请选择已有账号或使用其他邮箱。",
    reserved_email: "该邮箱为配置管理员保留。",
  };
  if (code && errors[code]) return errors[code];
  if (status === 409) return "记录状态或版本已变化。请关闭编辑并刷新列表；未确认结果时可原样重试。";
  if (status === 403 || status === 401) return "没有操作权限或登录已失效，请切换到有权限的账号。";
  if (status === 400) return "输入不符合要求，请检查必填字段、日期和账号选择。";
  return "未能确认保存结果，请保留当前内容重试；同一次请求不会重复写入。";
}

export function ProjectApprovalPanel({ project, onChanged,onEditingChange }: { project: Project; onChanged: () => Promise<void>;onEditingChange?:(value:{dirty:boolean;busy:boolean})=>void }) {
  const [state, setState] = useState<ApprovalState | null>(null);
  const [users, setUsers] = useState<WorkflowUser[]>([]);
  const [materials, setMaterials] = useState<ApiMaterial[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(() => localDate(new Date(Date.now() + 7 * 86400000)));
  const [note, setNote] = useState("");
  const initialDue=useRef(dueDate);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<ApprovalRound | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [approval, directory, files] = await Promise.all([api.getApprovals(project.id), api.getUsers(), api.getMaterials()]);
    setState(approval); setUsers(directory.users); setMaterials(files.materials); setOwnerId(approval.ownerId ?? "");
  }, [project.id]);
  useEffect(() => { let active = true; load().catch((error) => { if (active) setError(message(error)); }); return () => { active = false; }; }, [load]);
  const requestedRound=new URLSearchParams(window.location.search).get('roundId');
  useEffect(()=>{if(!requestedRound||!state?.rounds.some(round=>round.id===requestedRound))return;const frame=requestAnimationFrame(()=>{const node=document.getElementById(`approval-round-${requestedRound}`);node?.scrollIntoView({block:'center'});node?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[requestedRound,state]);
  const eligible = users.filter((user) => user.canLogin && ["admin", "investment_manager"].includes(user.role));
  const linked = materials.filter((material) => material.originalFilePath && (material.projectId === project.id || material.relationships?.projects.some((relation) => relation.id === project.id)));
  const pending = state?.rounds.some((round) => round.status === "pending");
  const mayWrite = state && ["admin", "investment_manager"].includes(state.currentUser.role);
  const dirty=Boolean(state)&&((state?.currentUser.role==='admin'&&ownerId!==(state.ownerId??''))||Boolean(mayWrite&&state?.nextMeetingType&&(reviewers.length||materialIds.length||note||dueDate!==initialDue.current)));
  useEffect(()=>{onEditingChange?.({dirty,busy});},[dirty,busy,onEditingChange]);
  useEffect(()=>()=>onEditingChange?.({dirty:false,busy:false}),[onEditingChange]);
  const changed = () => { setRequestId(crypto.randomUUID()); setError(""); setNotice(""); };
  return <div className="space-y-4">
    <div className={box}><h3 className="font-semibold">三会审批</h3><p className="mt-2 text-sm text-[#929aa5]">立项会 → 总办会 → 投委会。尽调落点暂未固定；三会通过不代表已交割或进入投后。材料版本和签署意见按提交时留存。</p>{state ? <p className="mt-2 text-sm">当前签署账号：{state.currentUser.name}（{state.currentUser.email}）</p> : <p role="status">正在读取审批记录…</p>}</div>
    <p role="alert" className="text-sm text-orange-300">{error}<NoticeHelp message={error} projectId={project.id} targetId={error==='请至少选择一位审批人。'?`approval-reviewers-${project.id}`:error==='请至少选择一份已关联原件。'&&linked.length?`approval-materials-${project.id}`:undefined} label={error==='请至少选择一位审批人。'?'选择审批人':error==='请至少选择一份已关联原件。'&&linked.length?'选择审批原件':undefined}/></p><p role="status" className="text-sm text-green-300">{notice}</p>
    {state?.currentUser.role === "admin" ? <form className={`${box} space-y-3`} onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setBusy(true); setError("");
      try { await api.setProjectOwner(project.id, ownerId); await onChanged(); await load(); setNotice("负责人账号已绑定。"); }
      catch (error) { setError(message(error)); } finally { setBusy(false); }
    }}><label className="block text-sm">项目负责人账号<select required disabled={busy || pending} value={ownerId} className={field} onChange={(event) => setOwnerId(event.target.value)}><option value="">请选择真实账号</option>{eligible.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label><button data-ui="primary" type="submit" disabled={busy || pending} className={button}>保存负责人</button><p className="text-xs text-[#929aa5]">负责人自评及独立放行只依据绑定账号ID。待审期间不能更换负责人。</p></form> : null}
    {mayWrite && state.nextMeetingType ? <form className={`${box} space-y-4`} onSubmit={async (event) => {
      event.preventDefault(); if (busy) return;
      if (!reviewers.length) { setError("请至少选择一位审批人。"); return; }
      if (!materialIds.length) { setError("请至少选择一份已关联原件。"); return; }
      setBusy(true); setError(""); setNotice("");
      try { await api.submitApproval(project.id, { requestId, meetingType: state.nextMeetingType!, reviewerIds: reviewers, materialIds, dueDate, note }); await onChanged(); await load(); setRequestId(crypto.randomUUID()); setReviewers([]);setMaterialIds([]);setNote("");initialDue.current=dueDate;setNotice("审批已提交，材料版本已留存，审批任务已生成。"); }
      catch (error) { setError(message(error)); } finally { setBusy(false); }
    }}><h3 className="font-semibold">发起{state.nextMeetingType}</h3>
      <fieldset className="prerequisite-group" id={`approval-reviewers-${project.id}`} tabIndex={-1} aria-invalid={error==='请至少选择一位审批人。'} disabled={busy}><legend className="mb-2 text-sm">审批人（普通流程需所选审批人全部通过；负责人本人可独立放行）</legend><div className="max-h-36 space-y-2 overflow-auto">{eligible.map((user) => <label className="flex gap-2 text-sm" key={user.id}><input type="checkbox" checked={reviewers.includes(user.id)} onChange={(event) => { setReviewers((ids) => event.target.checked ? [...ids, user.id] : ids.filter((id) => id !== user.id)); changed(); }} />{user.name} · {user.email}</label>)}</div></fieldset>
      <fieldset className="prerequisite-group" id={`approval-materials-${project.id}`} tabIndex={-1} aria-invalid={error==='请至少选择一份已关联原件。'} disabled={busy}><legend className="mb-2 text-sm">审批材料包（至少一份原件）</legend><div className="max-h-44 space-y-2 overflow-auto">{linked.map((material) => <label className="flex gap-2 text-sm" key={material.id}><input type="checkbox" checked={materialIds.includes(material.id)} onChange={(event) => { setMaterialIds((ids) => event.target.checked ? [...ids, material.id] : ids.filter((id) => id !== material.id)); changed(); }} />{material.name} · {material.currentVersion ? `V${material.currentVersion}` : "历史登记原件"}</label>)}</div>{!linked.length ? <p className="text-sm text-[#929aa5]">暂无已关联原件。<NoticeHelp message="请在资料库上传关联原件" projectId={project.id}/></p> : null}</fieldset>
      <label className="block text-sm">审批截止日<input required disabled={busy} className={field} type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); changed(); }} /></label>
      <label className="block text-sm">提交说明<textarea disabled={busy} className={field} value={note} onChange={(event) => { setNote(event.target.value); changed(); }} /></label>
      <button data-ui="primary" type="submit" disabled={busy || !state.ownerId} className={`${button} bg-gold text-[#181a20]`}>{busy ? "提交中…" : `提交${state.nextMeetingType}`}</button>
    </form> : state ? <p role="status" className={box}>{pending ? "已有待审实例，请签署或等待指定审批人处理。" : state.rounds.some((round) => round.status === "rejected") ? "项目存在有效否决，本流程已冻结，不能用负责人放行覆盖。" : "三会基础流程已通过；后续尽调和交割须按另行确定的规则推进。"}</p> : null}
    <div className="space-y-3">{state?.rounds.map((round) => <section key={round.id} id={`approval-round-${round.id}`} tabIndex={-1} data-source-selected={requestedRound===round.id} className={box}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{round.meetingType} · 第{round.attempt}次 · {statusLabels[round.status]}</h3>{round.status === "pending" && mayWrite && (state.currentUser.id === round.ownerId || round.reviewers.some((user) => user.id === state.currentUser.id)) && !round.decisions.some((decision) => decision.actor.id === state.currentUser.id) ? <button data-ui="secondary" type="button" className={`${button} text-gold`} onClick={() => setSelected(round)}>签署意见</button> : null}</div>
      <p className="mt-2 text-sm text-[#929aa5]">提交人：{round.submittedBy.name} · {new Date(round.createdAt).toLocaleString("zh-CN")} · 截止：{round.dueDate}</p>
      <p className="mt-2 text-sm">审批人：{round.reviewers.map((user) => `${user.name}（${user.email}）`).join("、")}</p><p className="mt-2 text-sm">{round.note}</p>
      <ul className="mt-3 space-y-2">{round.materials.map((material) => <li key={material.materialId} className="text-sm"><MaterialReferenceLink material={material} className="text-gold">{material.name} · {"留存原件"}</MaterialReferenceLink></li>)}</ul>
      <ul className="mt-3 space-y-2">{round.decisions.map((decision, index) => <li key={`${decision.actor.id}-${index}`} className="border-t border-[#2b3139] pt-2 text-sm">{decision.actor.name} · {accountRoleLabels[decision.actor.role]} · {decisionLabels[decision.decision]} · {new Date(decision.time).toLocaleString("zh-CN")}<p className="mt-1 whitespace-pre-wrap">{decision.opinion}</p></li>)}</ul>
    </section>)}</div>
    <RefreshButton data-ui="info" type="button" disabled={busy} className={button} onClick={() => { setError(""); load().catch((error) => setError(message(error))); }}>刷新审批记录</RefreshButton>
    {state?.currentUser.role === "admin" ? <div className={box}><p className="text-sm">审批与任务使用有效登录账号；账号启停、改密和角色统一在系统设置维护。</p><a data-ui="info" className="mt-3 inline-block text-gold underline" href="/settings#accounts">管理审批与任务账号</a></div> : null}
    {selected ? <DecisionDialog round={selected} projectId={project.id} onClose={() => setSelected(null)} onSaved={async () => { await onChanged(); await load(); setSelected(null); setNotice("签署意见已保存，审批和任务状态已同步。"); }} /> : null}
  </div>;
}

function DecisionDialog({ round, projectId, onClose, onSaved }: { round: ApprovalRound; projectId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [decision, setDecision] = useState<"approve" | "return" | "reject">("approve");
  const [opinion, setOpinion] = useState(""); const [requestId, setRequestId] = useState(() => crypto.randomUUID()); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const dirty=useRef(false);
  const close=async()=>{if(busy)return;if(dirty.current&&!await confirmAction('签署意见尚未确认保存，关闭将放弃当前填写。确认关闭？'))return;onClose();};
  return <WorkflowDialog title={`签署${round.meetingType}意见`} busy={busy} onClose={close}><form className="space-y-4" onChangeCapture={()=>{dirty.current=true;}} onSubmit={async (event) => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { await api.decideApproval(projectId, round.id, { requestId, expectedRevision: round.revision, decision, opinion }); await onSaved(); } catch (error) { setError(message(error)); } finally { setBusy(false); } }}>
    <p className="text-sm text-[#929aa5]">签署后意见追加留存，不能修改。否决会冻结本流程；退回会生成补件任务。</p>
    <label className="block text-sm">审批结论<select disabled={busy} className={field} value={decision} onChange={(event) => { setDecision(event.target.value as typeof decision); setRequestId(crypto.randomUUID()); }}><option value="approve">通过</option><option value="return">退回补件</option><option value="reject">否决</option></select></label>
    <label className="block text-sm">签署意见<textarea required autoFocus disabled={busy} className={field} value={opinion} aria-describedby="decision-error" onChange={(event) => { setOpinion(event.target.value); setRequestId(crypto.randomUUID()); }} /></label><p role="alert" id="decision-error" className="text-sm text-orange-300">{error}<NoticeHelp message={error} projectId={projectId}/></p><button data-ui="primary" type="submit" disabled={busy} className={`${button} bg-gold text-[#181a20]`}>{busy ? "签署中…" : "确认签署"}</button>
  </form></WorkflowDialog>;
}

export function WorkflowTaskBoard({ projects, projectId, onChanged }: { projects: Project[]; projectId?: string; onChanged: () => Promise<void> }) {
  const hideDemo=useHideSeedDemo();
  const [tasks, setTasks] = useState<WorkflowTask[]>([]); const [users, setUsers] = useState<WorkflowUser[]>([]); const [role, setRole] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [filter, setFilter] = useState("全部"); const [owner, setOwner] = useState(""); const [query, setQuery] = useState(""); const [editing, setEditing] = useState<WorkflowTask | "new" | null>(null);
  const readGeneration=useRef(0),locatedTask=useRef('');
  const [requestedTaskId,setRequestedTaskId]=useState(()=>projectId?new URLSearchParams(window.location.search).get('taskId')??'':'');
  useEffect(()=>{const select=()=>{locatedTask.current='';setRequestedTaskId(projectId?new URLSearchParams(window.location.search).get('taskId')??'':'');};select();window.addEventListener('popstate',select);return()=>window.removeEventListener('popstate',select);},[projectId]);
  const load = useCallback(async () => {
    const generation=++readGeneration.current;setLoading(true);
    try{const [result, directory, session] = await Promise.all([api.getWorkflowTasks(projectId), api.getUsers(), api.getSessionMe()]);
      if(generation!==readGeneration.current)return;
      setTasks(result.tasks);setUsers(directory.users);setRole(session.user.role);setError('');
    }catch(error){if(generation===readGeneration.current)throw error;}finally{if(generation===readGeneration.current)setLoading(false);}
  }, [projectId]);
  useEffect(() => { let active = true; load().catch((error) => { if (active) { setError(message(error)); setLoading(false); } }); return () => { active = false;readGeneration.current++; }; }, [load]);
  const [dateScope,setDateScope]=useState("all");
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
  const mayWrite = ["admin", "investment_manager", "post_investment"].includes(role);
  const visible = filterSeedDemoRecords(tasks,hideDemo).filter((task) => (dateScope==='all'||isOpenTask(task)&&(dateScope==='open'?true:dateScope==='overdue'?isOverdueTask(task,today):task.dueDate===dateScope)) && (filter === "全部" || task.status === filter) && (!owner || task.ownerId === owner) && (!query.trim() || [task.name, task.owner, task.note, projects.find((project) => project.id === task.projectId)?.name].join(" ").toLowerCase().includes(query.trim().toLowerCase())));
  const scopedTasks=filterSeedDemoRecords(tasks,hideDemo);
  const requestedTask=scopedTasks.find(task=>task.id===requestedTaskId),requestedVisible=visible.some(task=>task.id===requestedTaskId);
  const locateTask=()=>{const node=document.getElementById('workflow-task-'+requestedTaskId);if(node){node.focus({preventScroll:true});node.scrollIntoView({block:'center',inline:'nearest'});locatedTask.current=requestedTaskId;}};
  useEffect(()=>{if(!requestedTaskId||!requestedVisible||loading||error||editing||locatedTask.current===requestedTaskId)return;const frame=requestAnimationFrame(locateTask);return()=>cancelAnimationFrame(frame);},[requestedTaskId,requestedVisible,loading,error,editing]);
  const deadlines=taskDeadlineSummary(scopedTasks,today);
  const selectDate=(date:string)=>{setDateScope(date);setFilter("全部");setOwner("");setQuery("");};
  const selectStatus=(status:string)=>{setDateScope("all");setFilter(status);setOwner("");setQuery("");};
  return <section className="workflow-task-workspace space-y-4">
    {!projectId?<section className="operations-hero task-hero" aria-label="项目任务概览">
      <div className="operations-lead"><p className="operations-kicker">项目任务 · 当前可见范围</p><h2>项目任务推进</h2><div className="operations-value"><strong>{loading||error?'—':scopedTasks.filter(isOpenTask).length}</strong><span>项未完成</span></div><button type="button" className="operations-action" aria-pressed={dateScope==='open'} onClick={()=>{selectDate('open');document.getElementById('project-task-register')?.scrollIntoView({block:'start'});}}>查看待推进任务 <span aria-hidden="true">↗</span></button></div>
      <div className="operations-aside"><button type="button" className="operations-alert" aria-pressed={dateScope==='overdue'} onClick={()=>{selectDate('overdue');document.getElementById('project-task-register')?.scrollIntoView({block:'start'});}}><span className="operations-alert-label">逾期待跟进 <span aria-hidden="true">↗</span></span><strong>{loading||error?'—':deadlines.overdue}<small>项</small></strong><span>按截止日核对，优先处理</span></button><div className="operations-secondary"><button type="button" onClick={()=>selectDate('all')}><span>全部项目任务</span><strong>{loading||error?'—':scopedTasks.length}</strong></button><button type="button" onClick={()=>selectStatus('已完成')}><span>已完成</span><strong>{loading||error?'—':scopedTasks.filter(t=>t.status==='已完成').length}</strong></button></div></div>
    </section>:<div className="task-metrics"><StatCard label="项目任务" value={loading||error?'—':String(scopedTasks.length)} tone="navy" onClick={()=>selectDate('all')}/><StatCard featured label="未完成" value={loading||error?'—':String(scopedTasks.filter(isOpenTask).length)} tone="gold" onClick={()=>selectDate('open')}/><StatCard label="逾期未完成" value={loading||error?'—':String(deadlines.overdue)} tone="red" onClick={()=>selectDate('overdue')}/><StatCard label="已完成" value={loading||error?'—':String(scopedTasks.filter(t=>t.status==='已完成').length)} tone="green" onClick={()=>selectStatus('已完成')}/></div>}
    {!error&&!loading&&!projectId?<div className="task-chart-row"><CompositionRing title="任务进展构成" centerLabel="项目任务" focusLabel="未完成" selectedLabel={dateScope==='open'?'未完成':dateScope==='all'&&['已完成','已取消'].includes(filter)?filter:undefined} segments={[{label:'未完成',value:scopedTasks.filter(isOpenTask).length,tone:'bronze',onSelect:()=>selectDate('open')},{label:'已完成',value:scopedTasks.filter(t=>t.status==='已完成').length,tone:'success',onSelect:()=>selectStatus('已完成')},{label:'已取消',value:scopedTasks.filter(t=>t.status==='已取消').length,tone:'muted',onSelect:()=>selectStatus('已取消')}]}/><TaskDeadlineOutlook summary={deadlines} selected={dateScope} onSelect={selectDate}/></div>:null}
    <div id={projectId?undefined:"project-task-register"} className="task-register business-block space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">项目任务办理</h2><div className="flex gap-2"><RefreshButton data-ui="info" type="button" className={button} onClick={() => { setError(""); load().catch((error) => setError(message(error))); }}>刷新任务</RefreshButton>{mayWrite ? <button data-action="create" data-ui="primary" type="button" className={`${button} bg-gold text-[#181a20]`} onClick={() => setEditing("new")}>新建任务</button> : null}</div></div>
    <div className="grid gap-3 md:grid-cols-3"><label className="text-sm">任务状态<select className={field} value={filter} onChange={(event) => setFilter(event.target.value)}>{["全部", "未开始", "进行中", "已完成", "已取消", "待确认", "已逾期"].map((status) => <option key={status}>{status}</option>)}</select></label><label className="text-sm">任务负责人<select className={field} value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">全部负责人</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label><label className="text-sm">检索任务<input className={field} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
    {requestedTaskId?<div className="task-source-location" role="status"><p>{loading?'正在读取并定位链接中的任务…':error?'任务读取未完成，暂不能定位，请重试。':!requestedTask?'目标任务不在当前账号可见任务范围内，请核对链接、来源范围或记录状态。':requestedVisible?`已定位到下方任务：${requestedTask.name}`:`目标任务被当前筛选隐藏：${requestedTask.name}`}</p>{!loading&&!error&&requestedTask?<button data-ui="info" type="button" onClick={()=>{if(requestedVisible)locateTask();else{locatedTask.current='';selectDate('all');}}}>{requestedVisible?'再次定位':'显示并定位该任务'}</button>:null}</div>:null}
    {dateScope!=="all"?<div className="deadline-selection" role="status"><span>{dateScope==='open'?'正在查看全部未完成任务':dateScope==='overdue'?'正在查看逾期未完成任务':`正在查看 ${dateScope} 到期的未完成任务`}</span><button data-ui="secondary" type="button" onClick={()=>setDateScope("all")}>清除日期筛选</button></div>:null}
    <p role="alert" className="text-sm text-orange-300">{error}<NoticeHelp message={error} projectId={projectId}/></p>{loading ? <p role="status">正在读取任务…</p> : null}
    <div className="task-table-scroll overflow-x-auto" tabIndex={0} role="region" aria-label="项目任务列表，可滚动查看全部任务"><table className="workflow-task-table w-full text-left text-sm"><thead><tr>{["任务 / 项目", "负责人 / 截止", "状态", "来源", "操作"].map((title) => <th className="border-b border-[#2b3139] p-3" key={title}>{title}</th>)}</tr></thead><tbody>{visible.map((task) => <tr key={task.id} id={'workflow-task-'+task.id} tabIndex={-1} data-source-selected={requestedTaskId===task.id}>
      <td data-label="任务 / 项目" className="border-b border-[#2b3139] p-3"><p className="font-semibold">{task.name}</p><p className="mt-1 text-xs text-[#929aa5]">{projects.find((project) => project.id === task.projectId)?.name ?? '关联项目'} · {dataOriginLabel(task.dataOrigin)}</p></td>
      <td data-label="负责人 / 截止" className="border-b border-[#2b3139] p-3"><p>{task.owner || "未分配"}{!task.ownerId ? "（未绑定账号）" : ""}</p><p className="mt-1">{task.dueDate}{!["已完成", "已取消"].includes(task.status) && task.dueDate < localDate() ? " · 已逾期" : ""}</p></td>
      <td data-label="状态" className="border-b border-[#2b3139] p-3"><StatusBadge status={task.status}/>{task.completedAt ? <p className="mt-1 text-xs text-[#929aa5]">{new Date(task.completedAt).toLocaleString("zh-CN")}</p> : null}</td>
      <td data-label="来源" className="max-w-sm border-b border-[#2b3139] p-3"><p>{task.kind === "diligence" ? "尽调派生" : task.kind === "review" ? "审批派生" : task.kind === "post_clause" ? "投后派生" : task.kind === "supplement" ? "退回补件" : "人工 / 业务任务"}</p>{projectId?<details className="archive-task-source"><summary>来源与办理说明</summary><p className="mt-1 whitespace-pre-wrap text-xs text-[#929aa5]">{isReturnTask(task)?returnTaskSummary(task):`${task.relation} ${task.note}`}</p></details>:<p className="mt-1 whitespace-pre-wrap text-xs text-[#929aa5]">{isReturnTask(task)?returnTaskSummary(task):`${task.relation} ${task.note}`}</p>}</td>
      <td data-label="操作" className="border-b border-[#2b3139] p-3">{isReturnTask(task)?returnTaskHref(task.projectId,task)?<a className="text-gold" href={returnTaskHref(task.projectId,task)!}>前往收益依据审核</a>:<span>收益审核来源待核对</span>:(task.kind === "review" || task.kind === "diligence" || task.kind === "post_clause") ? <a className="text-gold" href={`/projects/${encodeURIComponent(task.projectId)}?tab=${encodeURIComponent(task.kind === "post_clause" ? postTaskTab(task.type) : task.kind === "diligence" ? "尽调分析" : "三会审批")}${(task.kind === "diligence" || task.kind === "post_clause") ? `&taskId=${encodeURIComponent(task.id)}` : task.approvalRoundId ? `&roundId=${encodeURIComponent(task.approvalRoundId)}` : ""}`}>{task.kind === "post_clause" ? "前往投后处理" : task.kind === "diligence" ? task.status === "已完成" ? "查看尽调记录" : "前往尽调" : task.status === "已完成" ? "查看审批记录" : "前往审批"}</a> : mayWrite ? <button data-ui="secondary" type="button" className={`${button} text-gold`} onClick={() => setEditing(task)}>处理 / 改派</button> : "只读"}</td>
    </tr>)}</tbody></table></div>{!loading && !visible.length ? <p role="status" className={box}>没有匹配的任务。</p> : null}
    </div>
    {editing ? <WorkflowTaskDialog projects={projects} projectId={projectId} task={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={async () => { await onChanged(); await load(); setEditing(null); }} /> : null}
  </section>;
}

export function WorkflowTaskDialog({ projects, projectId, task, seed, onClose, onSaved }: { projects: Project[]; projectId?: string; task?: WorkflowTask; seed?: Partial<WorkflowTask>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [users, setUsers] = useState<WorkflowUser[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [requestId, setRequestId] = useState(() => crypto.randomUUID()); const [completionNote, setCompletionNote] = useState("");
  const [draft, setDraft] = useState(() => ({ projectId: task?.projectId ?? projectId ?? "", name: task?.name ?? seed?.name ?? "", type: task?.type ?? seed?.type ?? "人工任务", stage: task?.stage ?? seed?.stage ?? projects.find((project) => project.id === projectId)?.stage ?? "初筛", ownerId: task?.ownerId ?? seed?.ownerId ?? "", dueDate: task?.dueDate ?? seed?.dueDate ?? localDate(), priority: task?.priority ?? seed?.priority ?? "中", relation: task?.relation ?? seed?.relation ?? "", note: task?.note ?? seed?.note ?? "", status: task?.status ?? "未开始" }));
  useEffect(() => { let active = true; api.getUsers().then((result) => { if (active) setUsers(result.users); }).catch((error) => { if (active) setError(message(error)); }); return () => { active = false; }; }, []);
  const update = (key: keyof typeof draft, value: string) => { setDraft((current) => ({ ...current, [key]: value })); setRequestId(crypto.randomUUID()); setError(""); };
  const eligible = users.filter((user) => user.canLogin && ["admin", "investment_manager", "post_investment"].includes(user.role));
  const readOnly = task?.kind === "review" || task?.kind === "diligence" || task?.kind === "post_clause";
  const dirty=useRef(false);
  const close=async()=>{if(busy)return;if(dirty.current&&!await confirmAction('任务办理内容尚未确认保存，关闭将放弃当前填写。确认关闭？'))return;onClose();};
  return <WorkflowDialog title={task ? "处理任务" : "新建任务"} busy={busy} onClose={close}><form className="grid gap-4 md:grid-cols-2" onChangeCapture={()=>{dirty.current=true;}} onSubmit={async (event) => {
    event.preventDefault(); if (busy || readOnly) return; setBusy(true); setError("");
    try {
      if (task) {
        const input: WorkflowTaskUpdate = { requestId, expectedRevision: task.revision ?? 1 };
        for (const key of ["name", "type", "ownerId", "dueDate", "priority", "relation", "note", "status"] as const) if (draft[key] !== (task[key] ?? "")) input[key] = draft[key];
        if (completionNote.trim()) input.completionNote = completionNote;
        await api.updateWorkflowTask(task.id, input);
      } else { const { status: _status, ...input } = draft; await api.createWorkflowTask({ ...input, requestId } as WorkflowTaskInput); }
      await onSaved();
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }}>
    <label className="text-sm">所属项目<select required disabled={busy || !!task} className={field} value={draft.projectId} onChange={(event) => update("projectId", event.target.value)}><option value="">请选择项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <label className="text-sm">任务名称<input autoFocus required maxLength={500} disabled={busy || readOnly} className={field} value={draft.name} onChange={(event) => update("name", event.target.value)} /></label>
    <label className="text-sm">任务类型<input required disabled={busy || readOnly} className={field} value={draft.type} onChange={(event) => update("type", event.target.value)} /></label>
    <label className="text-sm">任务阶段<input required disabled={busy || !!task} className={field} value={draft.stage} onChange={(event) => update("stage", event.target.value)} /></label>
    <label className="text-sm">负责人账号<select required disabled={busy || readOnly} className={field} value={draft.ownerId} onChange={(event) => update("ownerId", event.target.value)}><option value="">请选择真实账号</option>{eligible.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>
    <label className="text-sm">截止日<input required disabled={busy || readOnly} type="date" className={field} value={draft.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></label>
    <label className="text-sm">优先级<select disabled={busy || readOnly} className={field} value={draft.priority} onChange={(event) => update("priority", event.target.value)}>{["高", "中", "低"].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
    {task ? <label className="text-sm">任务状态<select disabled={busy || readOnly} className={field} value={draft.status} onChange={(event) => update("status", event.target.value)}>{Array.from(new Set([draft.status, "未开始", "进行中", "已完成", ...(task.kind === "supplement" ? [] : ["已取消"])])).map((status) => <option key={status}>{status}</option>)}</select></label> : <p className="self-end text-sm text-[#929aa5]">新任务从“未开始”建立。</p>}
    <label className="text-sm md:col-span-2">关联来源<input disabled={busy || readOnly} className={field} value={draft.relation} onChange={(event) => update("relation", event.target.value)} /></label>
    <label className="text-sm md:col-span-2">任务备注<textarea disabled={busy || readOnly} className={field} value={draft.note} onChange={(event) => update("note", event.target.value)} /></label>
    {task ? <label className="text-sm md:col-span-2">完成 / 取消 / 重开说明<textarea disabled={busy || readOnly} className={field} value={completionNote} aria-describedby="task-edit-error" onChange={(event) => { setCompletionNote(event.target.value); setRequestId(crypto.randomUUID()); }} /></label> : null}
    {task?.status === "已完成" ? <p className="text-sm text-[#929aa5] md:col-span-2">如需继续处理或改派，请选择“进行中”并填写重开说明。</p> : null}
    {readOnly&&task&&isReturnTask(task)?returnTaskHref(task.projectId,task)?<a href={returnTaskHref(task.projectId,task)!} className="text-gold md:col-span-2">该任务由收益依据审核维护，前往对应来源版本</a>:<p className="md:col-span-2">收益审核来源待核对，不能手工关闭。</p>:readOnly ? <a href={`/projects/${task!.projectId}?tab=${encodeURIComponent(task!.kind === "post_clause" ? postTaskTab(task!.type) : task!.kind === "diligence" ? "尽调分析" : "三会审批")}${(task!.kind === "diligence" || task!.kind === "post_clause") ? `&taskId=${encodeURIComponent(task!.id)}` : task!.approvalRoundId ? `&roundId=${encodeURIComponent(task!.approvalRoundId)}` : ""}`} className="text-gold md:col-span-2">{task!.kind === "post_clause" ? "该任务由投后记录维护，前往投后处理" : task!.kind === "diligence" ? "该任务由尽调事项维护，前往尽调" : "该任务须由审批结论关闭，前往三会审批"}</a> : null}
    <p role="alert" id="task-edit-error" className="text-sm text-orange-300 md:col-span-2">{error}<NoticeHelp message={error} projectId={projectId}/></p><div className="flex justify-end gap-3 md:col-span-2"><button data-ui="secondary" type="button" disabled={busy} className={button} onClick={close}>取消</button><button data-ui="primary" type="submit" disabled={busy || readOnly} className={`${button} bg-gold text-[#181a20]`}>{busy ? "保存中…" : "保存任务"}</button></div>
  </form></WorkflowDialog>;
}
