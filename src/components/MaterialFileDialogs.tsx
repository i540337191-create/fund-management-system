import {FileUploadButton} from './FileUploadButton';
import {RefreshButton} from '../iterationA/RefreshButton';
import {confirmAction} from './SystemConfirmation';
import './MaterialVersionDialog.css';
import {NoticeHelp} from './NoticeHelp';
import {inferFileProject,inferFileType} from '../lib/intakeFiles';
import {useBackdropDismiss,dialogNavigationEvent} from '../lib/useBackdropDismiss';
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Project } from "../data/projects";
import { createApiClient, type ApiMaterialVersion } from "../lib/apiClient";
import type { ApiMaterialRecord } from "../lib/materialFilters";
import { Badge } from "./ui";
import { dataPurposeLabel } from "../lib/dataOrigin";
const api = createApiClient();
const inputClass = "mt-2 block w-full rounded-md border border-[#2b3139] bg-[#11161d] p-2 text-sm";
const buttonClass = "rounded-md border border-[#2b3139] px-3 py-2 text-sm disabled:opacity-50";
const accepted = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.wav,.mp3,.m4a,.ogg,.webm,.flac";
function failure(error: unknown) {
  const { status, code } = (error ?? {}) as { status?: number; code?: string };
  if (code === "legacy_original_integrity_mismatch") return "历史原件与登记的文件内容或大小不一致，已阻止更新。请先核对原件，历史文件未被覆盖。";
  if (code === "legacy_original_unavailable" || code === "legacy_original_metadata_invalid") return "没有可核验的历史登记原件，暂不能更新版本。请先核对原件登记。";
  if (code === "material_project_association_required") return "请先保存该资料的项目关联，再上传新版本。";
  if (status === 409) return "资料已存在或版本已变化。请在该资料的“版本 / 关联”中刷新版本，重新选择文件后再保存。";
  if (status === 413) return "文件超过25 MiB上限，请选择较小文件。";
  if (status === 415 || status === 400) return "文件类型、内容或关联项目不符合要求，请检查后重试。";
  if (status === 401 || status === 403) return "登录已失效或没有操作权限，请重新登录或联系管理员。";
  return "未能确认操作结果。请保留当前文件重试；同一次上传不会重复生成版本。";
}
function FileDialog({ title, busy, onClose, children,className='',headerAction,open=true }: { open?:boolean; title: string; busy: boolean; onClose: () => void | Promise<void>; children: ReactNode;className?:string;headerAction?:ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement|null>(typeof document==='undefined'?null:document.activeElement instanceof HTMLElement?document.activeElement:null);
  const dismiss=useBackdropDismiss(onClose,busy);
  useEffect(()=>{
    const element=dialog.current;if(!element)return;
    const requestClose=async(event:Event)=>{event.preventDefault();const resolve=(event as CustomEvent<{resolve:(closed:boolean)=>void}>).detail.resolve;if(busy){resolve(false);return;}try{await onClose();setTimeout(()=>resolve(!element.isConnected||!element.open),0);}catch{resolve(false);}};
    const preventNativeCancel=(event:Event)=>{if(event.target!==element)return;event.preventDefault();event.stopImmediatePropagation();if(!busy)void onClose();};
    // Repeated Escape can produce a non-cancelable CloseWatcher event in Chromium.
    const escape=(event:KeyboardEvent)=>{if(event.key!=='Escape'||(event.target instanceof Element&&event.target.closest('dialog')!==element))return;event.preventDefault();event.stopPropagation();if(!busy)void onClose();};
    element.addEventListener('keydown',escape);
    element.addEventListener('cancel',preventNativeCancel);
    element.addEventListener(dialogNavigationEvent,requestClose);
    return()=>{element.removeEventListener('keydown',escape);element.removeEventListener('cancel',preventNativeCancel);element.removeEventListener(dialogNavigationEvent,requestClose);};
  },[onClose,busy]);
  useEffect(() => {
    const element = dialog.current;
    if(!open)return;
    let frame:number|undefined,shown=false;
    const show=()=>{if(!element?.isConnected)return;const parent=element.parentElement?.closest('dialog');
      // A nested dialog must enter the top layer after its parent, including validation opens.
      if(parent&&!parent.open){frame=requestAnimationFrame(show);return;}
      opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;element.showModal();shown=true;
    };
    show();
    return () => { if(frame!==undefined)cancelAnimationFrame(frame);if(!shown)return;element?.close(); const target=opener.current;if(target?.isConnected){target.focus({preventScroll:true});if(document.activeElement!==target)requestAnimationFrame(()=>{if(target.isConnected)target.focus({preventScroll:true});});} };
  }, [open]);
  return <dialog {...dismiss} ref={dialog} aria-label={title} aria-busy={busy} className={`max-h-[90vh] w-[min(92vw,760px)] overflow-y-auto rounded-xl border border-[#2b3139] bg-[#1e2329] p-5 text-[#eaecef] backdrop:bg-black/60 ${className}`}>
    <div className="mb-5 flex items-start justify-between gap-4"><h2 className="min-w-0 break-words text-xl font-semibold">{title}</h2><div className="flex flex-wrap justify-end gap-2">{headerAction}<button data-ui="secondary" type="button" className={`${buttonClass} shrink-0`} style={{whiteSpace:'nowrap'}} disabled={busy} onClick={onClose} aria-label={`关闭${title}`}>关闭</button></div></div>{children}
  </dialog>;
}
export function MaterialUploadDialog({ projects, categories, onClose, onSaved, initialFiles=[],initialProjectId='',fund,onUploaded }: { projects: Project[]; categories: string[]; onClose: () => void; onSaved: () => Promise<void>;initialFiles?:File[];initialProjectId?:string;fund?:{id:string;name:string};onUploaded?:(materials:ApiMaterialRecord[])=>void }) {
  type UploadRow={file:File;projectId:string;type:string;requestId:string;result?:ApiMaterialRecord;submitted?:boolean;extraction?:string};
  const rowsFor=(files:File[])=>files.map(file=>({file,projectId:inferFileProject(file.name,projects,initialProjectId),type:inferFileType(file.name,categories),requestId:crypto.randomUUID()}));
  const [rows,setRows]=useState<UploadRow[]>(()=>rowsFor(initialFiles)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(''),[errorMaterialId,setErrorMaterialId]=useState('');
  const records=useRef<UploadRow[]>(rows);records.current=rows;
  const collect=(files:File[])=>{const added=rowsFor(files).filter(next=>!rows.some(row=>row.file.name===next.file.name&&row.file.size===next.file.size&&row.file.lastModified===next.file.lastModified));if(rows.length+added.length>10){setError('每批最多10份原件，本次新增未加入，请分批选择。');return;}setError('');setRows(current=>[...current,...added]);};
  const close=async ()=>{if(!busy&&(!rows.some(row=>!row.result)||await confirmAction("尚有未完成上传的原件，关闭将放弃本次选择；已保存原件仍会保留。是否关闭？")))onClose();};
  return <FileDialog title="上传资料" busy={busy} onClose={close}><form className="space-y-4" onSubmit={async event=>{
    event.preventDefault();if(busy)return;
    if(!rows.length||rows.some(row=>(!fund&&!row.projectId)||!row.file.size||row.file.size>25*1024*1024)){setError('请核对每份原件的关联项目，单文件须为1字节至25 MiB。');return;}
    setBusy(true);setError('');const next=[...records.current];
    try{for(let index=0;index<next.length;index++){const row=next[index];if(row.result)continue;setProgress(`正在保存 ${index+1} / ${next.length}：${row.file.name}`);row.submitted=true;setRows([...next]);const result=await api.uploadMaterial({file:row.file,...(fund?{fundId:fund.id}:{projectId:row.projectId}),type:row.type,requestId:row.requestId});row.result=result.material;row.extraction='unknown';setRows([...next]);try{row.extraction=(await api.getMaterialExtraction(result.material.id)).status;}catch{row.extraction='unknown';}setRows([...next]);}
      onUploaded?.(next.map(row=>row.result!));setProgress('原件已保存，正在更新资料列表…');await onSaved();
    }catch(cause){const status=(cause as {status?:number}).status;if(status&&status<500){for(const row of next)if(!row.result)row.submitted=false;setRows([...next]);}setErrorMaterialId((cause as {existingMaterialId?:string}).existingMaterialId??'');setError(next.every(row=>row.result)?'资料列表刷新未完成。上方原件上传结果保留，重试会跳过已完成项。':failure(cause)+' 已成功的原件保留，重试会跳过已完成项。');}finally{setBusy(false);setProgress('');}
  }} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)collect(Array.from(e.dataTransfer.files));}}>
    <p id="material-upload-help" className="text-sm text-[#929aa5]">拖入或选择最多10份原件，每份最大25 MiB。支持PDF、Office、文本、PNG/JPEG及WAV/MP3/M4A/OGG/WebM/FLAC录音。会自动解析正文，录音限60分钟。项目和类型会预填建议，请核对；无法确定的归属会留空。同名资料请在“版本 / 关联”上传新版，旧原件保留。</p>
    <div className="block text-sm">原始文件<span className="material-file-picker"><FileUploadButton showSelection={false} autoFocus multiple disabled={busy} accept={accepted} aria-label="原始文件" aria-describedby="material-upload-help material-upload-ocr material-upload-error" className={`${inputClass} batch-file-input`} onChange={e=>{collect(Array.from(e.target.files??[]));e.target.value='';}}/><span aria-live="polite" className="batch-file-count">{rows.length?`已选择 ${rows.length} 份原件`:'尚未选择原件'}</span><strong className="material-ocr-label">支持 OCR 文字识别</strong></span></div><p id="material-upload-ocr" className="text-xs text-[var(--secondary)]">扫描件和图片自动识别；保存原件后可在 AI 对话中提取建档字段、整理会议纪要、建立任务或起草报告，实际写入前核对确认卡。</p>
    {rows.map((row,index)=><fieldset disabled={busy||row.submitted} className="rounded-lg border border-[var(--line)] p-3 space-y-3" key={row.requestId}><legend className="px-1 text-sm">{row.file.name} {row.result?'· ✓ 原件已上传':row.submitted?'· 待核对结果':''}</legend><div role="status" className="upload-row-feedback">{row.result?<><p className="text-[var(--success)]">✓ 原件已保存。</p><p className={row.extraction==='failed'?'text-[var(--danger)]':'text-[var(--secondary)]'}>{row.extraction==='ready'?'正文已识别，字段与完整性仍须人工核对。':row.extraction==='pending'?'正文识别或录音转写进行中。':row.extraction==='failed'?'正文识别未完成，可重试识别；上传已成功。':'识别状态暂未取得，请在资料详情重读。'}</p></>:<p>{row.submitted?'正在保存原件，请等待确认结果…':'等待保存原件，保存后单独读取正文识别状态。'}</p>}</div><label className="block text-sm">{fund?`归属基金：${fund.name}`:'关联项目'}{fund?null:<select required className={inputClass} value={row.projectId} onChange={e=>setRows(current=>current.map((v,i)=>i===index?{...v,projectId:e.target.value}:v))}><option value="">请选择项目</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}</label><label className="block text-sm">资料类型<select className={inputClass} value={row.type} onChange={e=>setRows(current=>current.map((v,i)=>i===index?{...v,type:e.target.value}:v))}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><button data-ui="secondary" type="button" onClick={()=>setRows(current=>current.filter((_,i)=>i!==index))}>移除此文件</button></fieldset>)}
    <div id="material-upload-error" role={error?'alert':'status'} className="upload-operation-feedback" style={{color:error?'var(--danger)':'var(--secondary)'}}>{error||progress||'选择原件并核对归属后保存，上传与正文识别结果将分别显示。'}{error?<a data-ui="navigation" className="ml-3" href={errorMaterialId?`/materials?materialId=${encodeURIComponent(errorMaterialId)}`:'/materials'}>打开资料库核对原件 →</a>:null}</div>
    <div className="flex justify-end gap-3"><button data-ui="secondary" type="button" disabled={busy} className={buttonClass} onClick={close}>取消</button><button data-ui="primary" type="submit" disabled={busy||!rows.length} className={`${buttonClass} bg-gold text-[#181a20]`}>{busy?'上传并保存中…':'上传并保存'}</button></div>
  </form></FileDialog>;
}
export function MaterialVersionDialog({ material, projects, onClose, onSaved }: { material: ApiMaterialRecord; projects: Project[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [versions, setVersions] = useState<ApiMaterialVersion[]>([]);
  const [projectIds, setProjectIds] = useState(() => material.relationships?.projects.map((project) => project.id) ?? (material.projectId ? [material.projectId] : []));
  const savedProjects = useRef([...projectIds].sort().join("\0"));
  const [file, setFile] = useState<File | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [primaryProjectId, setPrimaryProjectId] = useState(material.projectId ?? "");
  const [expectedVersion, setExpectedVersion] = useState(material.currentVersion ?? 0);
  const [fileReset, setFileReset] = useState(0);
  const [extraction, setExtraction] = useState<{status:string;pages:number;characters:number} | null>(null);
  const [extractionError, setExtractionError] = useState("");
  const [extractionLoading,setExtractionLoading]=useState(Boolean(material.currentVersionId));
  const extractionRead=useRef(0);
  useEffect(() => { let active=true;const seq=++extractionRead.current;setExtraction(null);setExtractionError("");setExtractionLoading(Boolean(material.currentVersionId)); if(material.currentVersionId)api.getMaterialExtraction(material.id).then(value=>{if(active&&seq===extractionRead.current){setExtraction(value);setExtractionError("");}}).catch(()=>{if(active&&seq===extractionRead.current)setExtractionError("暂未取得正文解析状态，请重试。");}).finally(()=>{if(active&&seq===extractionRead.current)setExtractionLoading(false);});return ()=>{active=false;};},[material.id,material.currentVersionId]);
  useEffect(()=>{if(extraction?.status!=='pending')return;let active=true;const timer=setInterval(()=>{const seq=++extractionRead.current;void api.getMaterialExtraction(material.id).then(value=>{if(active&&seq===extractionRead.current){setExtraction(value);setExtractionError("");}}).catch(()=>{if(active&&seq===extractionRead.current)setExtractionError('暂未取得解析进度，请稍后重试。');});},3000);return()=>{active=false;clearInterval(timer);};},[material.id,extraction?.status]);
  const load = async () => { const result = await api.getMaterialVersions(material.id); setVersions(result.versions); };
  useEffect(() => { let active = true; api.getMaterialVersions(material.id).then((result) => { if (active) setVersions(result.versions); }).catch((error) => { if (active) setError(failure(error)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [material.id]);
  const latest = Math.max(0, ...versions.map((version) => version.version));
  const close=async ()=>{const changed=Boolean(file)||[...projectIds].sort().join("\0")!==savedProjects.current;if(!busy&&(!changed||await confirmAction("文件选择或项目关联尚未保存，是否放弃修改并关闭？")))onClose();};
  return <FileDialog title="版本与项目关联" busy={busy} onClose={close}><div className="material-version-content">
    <p className="mb-4 break-words font-semibold">{material.name}</p><p role="alert" id="material-version-error" className="mb-3 min-h-6 text-sm text-red-600 dark:text-red-400">{error}<NoticeHelp message={error}/></p><p role="status" className={`mb-3 min-h-6 text-sm ${loading?'text-[var(--secondary)]':'text-green-700 dark:text-green-400'}`}>{loading ? "正在读取历史版本…" : notice}</p>
    <div className="material-version-extraction mb-4 rounded-md border border-[#2b3139] p-3 text-sm">
      <p role="status" className="min-h-24 sm:min-h-12">{extractionLoading ? "正在读取当前版本识别状态…" : !extraction ? !material.currentVersionId&&!versions.length?"当前资料尚无已核验的版本原件，请先核对原件登记；未判定识别状态。":"尚未取得当前版本识别状态，请重试读取；不能判断正在排队或识别完成。" : extraction?.status === "ready" ? `当前版本正文已解析，${extraction.pages} 段、${extraction.characters} 字。识别结果用于检索，关键数值请核对原件。` : extraction?.status === "failed" ? "当前版本正文未能解析，原件已保存。可重试；未解析内容不会用于AI引用。" : "当前版本正在排队或解析，请稍候；完成后可用于AI检索与引用。"}</p>
      <div className="material-version-extraction-feedback"><p role="alert" className="mt-2 min-h-12 text-red-600 dark:text-red-400">{extractionError}</p>
      <div className="mt-2 min-h-10">{extraction?.status !== "ready" && extraction?.status !== "pending" ? <button data-ui="secondary" type="button" disabled={busy || loading || extractionLoading} className={buttonClass} onClick={async()=>{if(busy||extractionLoading)return;const seq=++extractionRead.current;setBusy(true);setExtractionError("");try{const value=await api.retryMaterialExtraction(material.id);if(seq===extractionRead.current){setExtraction(value);setExtractionLoading(false);setExtractionError("");}}catch{if(seq===extractionRead.current)setExtractionError("暂未完成正文解析，请稍后重试。原件仍然保留。");}finally{setBusy(false);}}}>{busy ? "正在解析…" : "重试正文解析"}</button> : null}</div></div>
    </div>
    <form className="space-y-3 border-b border-[#2b3139] pb-5" onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; if (!projectIds.length) { setError("请至少关联一个项目。"); return; }
      setBusy(true); setError(""); setNotice("");
      try { await api.updateMaterialProjects(material.id, projectIds); await onSaved(); savedProjects.current=[...projectIds].sort().join("\0"); setPrimaryProjectId(projectIds[0]); setNotice("项目关联已保存，所有版本继续保留。"); }
      catch (error) { setError(failure(error)); } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy}><legend className="mb-2 text-sm">关联项目（至少一项，多个项目共享同一原件）</legend><div className="max-h-40 space-y-2 overflow-auto">{projects.map((project) => <label key={project.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={projectIds.includes(project.id)} onChange={(event) => setProjectIds((current) => event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id))} />{project.name}</label>)}</div></fieldset>
      <button data-ui="primary" type="submit" disabled={busy || loading} className={buttonClass}>保存项目关联</button>
    </form>
    {versions.length === 0 && !loading ? <p className="mt-4 text-sm text-[#929aa5]">{material.originalFilePath ? "首次更新会将已登记原件保留为V1，新文件保存为V2；历史来源文件保持不变。请先保存至少一个项目关联。" : "该资料没有已登记原件，暂不能更新版本。"}</p> : null}
    {versions.length === 0 && material.originalFilePath ? <a data-ui="info" href={`/${material.originalFilePath}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-gold">下载历史原件</a> : null}
    <form className="my-5 space-y-3" onSubmit={async (event) => {
      event.preventDefault(); if (busy) return;
      if (!file || file.name !== material.name || file.size === 0 || file.size > 25 * 1024 * 1024 || (!primaryProjectId&&!material.fundId) || !material.originalFilePath) { setError("请先保存项目关联，再选择与原件同名的有效文件，大小须为1字节至25 MiB。"); return; }
      setBusy(true); setError(""); setNotice("");
      let uploaded=false;
      try { await api.uploadMaterial({ file, requestId, type: material.type, ...(primaryProjectId?{projectId:primaryProjectId}:{fundId:material.fundId!}), materialId: material.id, expectedVersion }); uploaded=true;++extractionRead.current;setExtraction(null);setExtractionLoading(false);setExtractionError("新版本识别状态尚未读取，请重试正文解析。");setNotice("✓ 新版本原件已上传，旧版本可继续下载；识别与完整性仍须单独核对。");setFile(null);setFileReset(current=>current+1);await onSaved(); await load(); const seq=++extractionRead.current;try { const value=await api.getMaterialExtraction(material.id);if(seq===extractionRead.current){setExtraction(value);setExtractionLoading(false);setExtractionError("");} } catch { if(seq===extractionRead.current){setExtraction(null);setExtractionLoading(false);setExtractionError("暂未取得正文解析状态，请重试。");} } setNotice("✓ 新版本原件已上传，旧版本可继续下载；正文识别与内容完整性单独核对。"); }
      catch (error) { setError(uploaded?"原件已上传，列表刷新未完成，请点击刷新版本；原件未丢失。":failure(error)); } finally { setBusy(false); }
    }}>
      <div className="block text-sm">上传新版本（文件须同名）<FileUploadButton aria-label="上传资料新版本" selectedNames={file?[file.name]:[]} key={fileReset} required disabled={busy || loading} accept={accepted} aria-describedby="material-version-error" className={inputClass} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setRequestId(crypto.randomUUID()); setExpectedVersion(latest); setError(""); }} /></div>
      <button data-ui="primary" type="submit" disabled={busy || loading || (!primaryProjectId&&!material.fundId) || !material.originalFilePath} className={`${buttonClass} bg-gold text-[#181a20]`}>{busy ? "保存中…" : "保存新版本"}</button>
    </form>
    <div className="flex items-center justify-between"><h3 className="font-semibold">历史版本</h3><RefreshButton data-ui="info" type="button" className={buttonClass} disabled={busy} onClick={async () => { setError(""); try { await load(); } catch (error) { setError(failure(error)); } }}>刷新版本</RefreshButton></div>
    {material.generatedDocumentHref?<p className="text-sm"><a data-ui="secondary" href={material.generatedDocumentHref} target="_blank" rel="noreferrer">下载生成副本</a><span className="block text-[var(--secondary)]">{material.generatedDocumentSource}</span></p>:null}
    <ul className="mt-3 space-y-3">{versions.map((version) => <li key={version.id} className="space-y-3 rounded-md border border-[#2b3139] p-3 text-sm"><div className="flex flex-wrap items-center gap-3"><strong>V{version.version}</strong><Badge tone={version.dataPurpose === "engineering_fixture" ? "orange" : "slate"}>{dataPurposeLabel(version.dataPurpose)}</Badge><span className="min-w-0 break-words text-xs text-[var(--secondary)]">{version.sizeBytes} 字节 · {version.uploadedBy} · {version.historical ? `${version.createdAt.slice(0, 10)}（历史记录日期）` : new Date(version.createdAt).toLocaleString("zh-CN")}</span></div><a data-ui="info" href={version.downloadHref} className="inline-flex min-h-10 items-center text-gold" target="_blank" rel="noreferrer">下载 V{version.version} 原件</a></li>)}</ul>
  </div></FileDialog>;
}

export { FileDialog as WorkflowDialog };
