import {rememberReportGeneration,forgetReportGeneration,reportGenerationEvent,type ReportGeneration} from '../lib/reportGeneration';
import {useEffect,useRef,useState} from 'react';
import {Check,ChevronRight,FileText,LoaderCircle} from 'lucide-react';
import {WorkflowDialog,MaterialUploadDialog} from './MaterialFileDialogs';
import {useRecordManagement} from './RecordManagement';
import {confirmAction} from './SystemConfirmation';
import {ReportContentEditor,reportTemplatePrompt} from './ReportContentEditor';
import {createApiClient,type WorkflowUser} from '../lib/apiClient';
import {assistantClient,assistantError,streamAssistantTurn,type Conversation} from '../lib/assistantClient';
import {useAgentWorkspace} from '../lib/agentWorkspaceClient';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import {parseReportDraft} from '../lib/reportCatalogue';
import {savePreparedReport} from '../lib/reportPreparationSave';
import type {ApiMaterialRecord} from '../lib/materialFilters';
import type {Project} from '../data/projects';
import type {ReportRecord} from '../data/reports';
import {dataOriginLabel,dataPurposeLabel} from '../lib/dataOrigin';
import {AssistantMarkdown} from './AssistantMarkdown';
import './ReportCatalogue.css';
const api=createApiClient();
const steps=['基金与对象','选择模板','资料来源','数据负责人','AI 生成草稿','人工审核与导出'];
type Fund={id:string;name:string};
export function ReportCreationDialog({type,funds,projects,preset,resume,onClose,onSaved}:{type:string;funds:Fund[];projects:Project[];resume?:ReportGeneration;preset?:{targetId?:string;targetType?:'project'|'fund';target?:string};onClose:()=>void;onSaved:(report:ReportRecord)=>Promise<void>}){
 const initialProject=projects.find(p=>preset?.targetType==='project'?p.id===preset.targetId:p.name===preset?.target);
 const initialFund=funds.find(f=>preset?.targetType==='fund'?f.id===preset.targetId:f.name===preset?.target);
 const [fundId,setFundId]=useState(resume?.fundId??initialFund?.id??initialProject?.fundId??''),[projectId,setProjectId]=useState(resume?.projectId??initialProject?.id??''),[name,setName]=useState(resume?.name??''),[period,setPeriod]=useState(resume?.period??'');
 const [step,setStep]=useState(resume?4:0),[templateKey,setTemplateKey]=useState(resume?.templateKey??''),[materialIds,setMaterialIds]=useState<string[]>(resume?.materialIds??[]),[ownerId,setOwnerId]=useState(resume?.ownerId??''),[query,setQuery]=useState('');
 const [materials,setMaterials]=useState<ApiMaterialRecord[]>([]),[users,setUsers]=useState<WorkflowUser[]>([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(Boolean(resume)),[progress,setProgress]=useState(''),[missingText,setMissingText]=useState(false),[sections,setSections]=useState<{title:string;text:string}[]>([]),[report,setReport]=useState<ReportRecord|null>(null);
 const model=useAgentWorkspace(),hideDemo=useHideSeedDemo();
 const {role}=useRecordManagement(),canUpload=['admin','post_investment'].includes(role);
 const [uploadOpen,setUploadOpen]=useState(false),[usersLoading,setUsersLoading]=useState(true),[userError,setUserError]=useState('');
 const uploaded=useRef<ApiMaterialRecord[]>([]);
 const fund=funds.find(f=>f.id===fundId),project=projects.find(p=>p.id===projectId&&p.fundId===fundId),target=project?{...project,type:'project' as const}:fund?{...fund,type:'fund' as const}:null;
 const templates=(model.state?.templates??[]).filter(t=>t.status==='published'&&t.enabled!==false&&(t.objectType==='report'||t.objectType===target?.type||(type==='企业监控报告'&&t.objectType==='company')));
 const template=templates.find(t=>`${t.id}:${t.version}`===templateKey),owner=users.find(u=>u.id===ownerId&&u.canLogin);
 const selectedMaterials=materials.filter(m=>materialIds.includes(m.id));
 const relevant=materials.filter(m=>project?(m.projectId===project.id||m.relationships?.projects.some(p=>p.id===project.id)):(m.fundId===fundId||m.relationships?.funds.some(f=>f.id===fundId)||projects.some(p=>p.fundId===fundId&&(m.projectId===p.id||m.relationships?.projects.some(r=>r.id===p.id)))));
 const visible=relevant.filter(m=>[m.name,m.type].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 const id=useRef(resume?.id??'report-'+crypto.randomUUID()),pending=useRef<ReportRecord|null>(null),created=useRef<ReportRecord|null>(null),saved=useRef<ReportRecord|null>(null),conversation=useRef<Conversation|null>(null),controller=useRef<AbortController|null>(null),mounted=useRef(true),requestId=useRef(crypto.randomUUID());
 const taskRecord=useRef<ReportGeneration|null>(resume??null);
 const [generating,setGenerating]=useState(Boolean(resume)),[backgroundReady,setBackgroundReady]=useState(false);
 useEffect(()=>{if(!resume||!model.state)return;let alive=true;let timer:ReturnType<typeof setInterval>;const poll=async()=>{try{const c=await assistantClient.get(resume.conversationId);if(!alive)return;conversation.current=c;const m=c.messages.find(m=>m.role==='assistant'&&m.requestId===resume.requestId);if(c.activeRequestId===resume.requestId){setBusy(true);setGenerating(true);setBackgroundReady(true);setProgress('报告正在后台生成，离开页面后仍会继续。');return;}clearInterval(timer);setBusy(false);setGenerating(false);if(m?.status==='complete'){const titles=resume.chapterTitles??(template?.fields??[]).filter((f:any)=>f.enabled!==false).map((f:any)=>String(f.label));if(!titles.length)throw Error('模板版本暂不可读取，请保留任务并核对模板。');setSections(parseReportDraft(m.content,titles));setProgress('后台草稿已生成，请核对后保存。');}else setError(m?.error??'生成请求尚未确认，请保留本任务并重试。');}catch{if(alive){setBusy(false);setGenerating(false);setError('暂未读取生成任务，请保留任务并重新打开。');}}};timer=setInterval(()=>void poll(),3000);void poll();return()=>{alive=false;clearInterval(timer);};},[resume?.conversationId,resume?.requestId,Boolean(model.state)]);
 const dirty=Boolean(fundId||projectId||name||templateKey||materialIds.length||ownerId||sections.length);
 async function loadMaterials(){setLoading(true);setLoadError('');try{const {materials:rows}=await api.getMaterials();if(mounted.current)setMaterials(rows);return rows;}catch(cause){if(mounted.current)setLoadError('资料未读取成功，请重新读取后继续。');throw cause;}finally{if(mounted.current)setLoading(false);}}
 async function loadUsers(){setUsersLoading(true);setUserError('');try{const {users:rows}=await api.getUsers();if(mounted.current)setUsers(rows.filter(x=>x.canLogin));}catch(cause){if(mounted.current)setUserError('负责人目录未读取成功，请重新读取后继续。');throw cause;}finally{if(mounted.current)setUsersLoading(false);}}
 useEffect(()=>{mounted.current=true;void Promise.allSettled([loadMaterials(),loadUsers()]);return()=>{mounted.current=false;controller.current?.abort();};},[]);
 async function finishUpload(){
  const rows=await loadMaterials();if(uploaded.current.some(m=>!rows.some(row=>row.id===m.id)))throw Error('原件已上传，资料列表尚未读到，请重试读取。');
  const selected=[...new Set([...materialIds,...uploaded.current.map(m=>m.id)])];
  if(selected.length<=10){setMaterialIds(selected);setProgress('原件已上传并选入本次报告，请核对正文识别结果后继续。');}
  else setProgress('原件已上传；合计超过10份，已有勾选保持，请自行选择本次报告使用的资料。');
  setQuery('');setError('');setUploadOpen(false);
 }
 useEffect(()=>{if(!dirty||saved.current)return;const unload=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[dirty,report]);
 const close=async()=>{if(uploadOpen||busy&&!(generating&&backgroundReady))return;if(generating){onClose();return;}if(!saved.current&&dirty&&!await confirmAction(created.current?'报告已保存，但模板关联尚未确认。关闭后可在报告列表继续核对，确认关闭？':'报告准备内容尚未保存，确认放弃本次选择并关闭？'))return;onClose();};
 function validate(index:number){if(index===0&&(!fund||!name.trim()))return '请选择基金并填写报告名称。';if(index===1&&(!template||(template.fields??[]).every((f:any)=>f.enabled===false)))return '请选择有启用章节的已发布模板；可在业务模板管理中补齐。';if(index===2&&(loading||loadError))return loading?'资料正在读取，请稍候。':'资料未读取成功，请点击刷新资料重试。';if(index===2&&(!selectedMaterials.length||selectedMaterials.length!==materialIds.length))return '请选择至少一份当前可读取的资料作为报告依据。';if(index===3&&(usersLoading||userError))return usersLoading?'负责人目录正在读取，请稍候。':'负责人目录未读取成功，请重新读取后继续。';if(index===3&&!owner)return '请选择当前有效的数据负责人账号。';return '';}
 function next(){const message=validate(step);if(message){setError(message);requestAnimationFrame(()=>document.querySelector<HTMLElement>(step===0?(!fund?'[data-i18n-label="所属基金"]':'[data-i18n-label="报告名称"]'):step===1?'[data-i18n-label="业务模板"]':step===2?'[data-i18n-label="搜索报告资料"]':'[data-i18n-label="数据负责人"]')?.focus());return;}setError('');setStep(s=>Math.min(s+1,4));}
 async function generate(){
  if(busy||pending.current)return;for(let i=0;i<4;i++){const message=validate(i);if(message){setStep(i);setError(message);return;}}
  setBusy(true);setGenerating(true);setBackgroundReady(false);setError('');setMissingText(false);setProgress('正在核对模板和所选资料，等待 AI 返回草稿…');controller.current=new AbortController();
  try{
   const c=conversation.current??await assistantClient.create(requestId.current,!hideDemo);conversation.current=c;
   const draft:ReportRecord={name:name.trim(),type,target:target!.name,targetType:target!.type,targetId:target!.id,owner:owner!.name,status:'草稿',updatedAt:''};
   const prompt=reportTemplatePrompt(draft,template!)+`\n本次仅起草，不准备业务操作确认卡，不保存、不审批、不发送。报告期：${period.trim()||'未指定，正文须标明待核对'}。数据负责人：${owner!.name}。仅使用这${selectedMaterials.length}份所选资料的实际正文：${selectedMaterials.map(m=>m.name+'（资料ID '+m.id+'，版本 '+(m.currentVersionId??'待核对')+'）').join('；')}。不使用其他基金或项目事实；无正文或缺少依据的章节必须标为“待补充/待核对”，不可把文件名当正文。每处业务事实附原件名与页码。以 Markdown 正文返回，按模板启用章节顺序逐章输出，每章以“## 模板章节原名”开头，章节原名必须完全一致，不增删章节；每章内容非空，引用与待补内容放入相应章节。不要返回JSON或代码围栏。`;
   const {user}=await api.getSessionMe();
   const turnId=crypto.randomUUID();taskRecord.current={id:id.current,userId:user.id,type,fundId,projectId,name,period,templateKey,materialIds,ownerId,conversationId:c.id,requestId:turnId,chapterTitles:(template!.fields??[]).filter((f:any)=>f.enabled!==false).map((f:any)=>String(f.label))};
   try{rememberReportGeneration(localStorage,taskRecord.current);}catch{throw Error('报告生成任务无法保存，请恢复浏览器存储后重试；本次尚未开始生成。');}window.dispatchEvent(new Event(reportGenerationEvent));
   let completed=false;
   await streamAssistantTurn(c,{requestId:turnId,expectedRevision:c.revision,prompt,projectId:project?.id??'',materialIds},controller.current.signal,(event,value)=>{
    if(!mounted.current)return;
    if(event==='meta'){setBackgroundReady(true);if(value.missingSelectedText)setMissingText(true);}
    if(event==='progress')setProgress(value.text);
    if(event==='done'){conversation.current=value.conversation;const last=value.conversation.messages.at(-1);if(last?.status!=='complete'||last.error)throw Error('AI 草稿未完整生成，请保留当前选择并重试。');setSections(parseReportDraft(last.content,(template!.fields??[]).filter((f:any)=>f.enabled!==false).map((f:any)=>String(f.label))));completed=true;}
   });
   if(!completed)throw Error('尚未取得完整草稿，请重新读取后重试。');
   setProgress('AI 草稿已返回，尚未保存或审核。请逐章核对依据与待补内容。');window.dispatchEvent(new CustomEvent('fundapp:conversation-changed',{detail:{id:c.id}}));
  }catch(cause){if(mounted.current){setError(cause instanceof SyntaxError?'AI 返回的章节格式不完整，请重新生成；当前选择已保留。':cause instanceof Error&&/草稿|章节|任务/.test(cause.message)?cause.message:assistantError(cause));if(conversation.current)try{conversation.current=await assistantClient.get(conversation.current.id);}catch{}}}
  finally{if(mounted.current){setBusy(false);setGenerating(false);}window.dispatchEvent(new Event(reportGenerationEvent));}
 }
 async function save(){
  if(busy)return;setBusy(true);setError('');
  try{
   if(!saved.current){
    if(!pending.current){if(!target||!template||!owner||!sections.length)throw Error('请先完成选择并生成报告草稿。');const {user}=await api.getSessionMe();pending.current={id:id.current,name:name.trim(),type,target:target.name,targetType:target.type,targetId:target.id,fundId:fundId,projectId:project?.id??null,owner:user.name,status:'草稿',updatedAt:new Date().toISOString(),sections:[...sections,{title:'编制与资料依据',text:`数据负责人：${owner.name}\n归属基金：${fund!.name}\n报告期：${period.trim()||'未指定，待人工核对'}\n写作模板：${template.title} · V${template.version}\n所选资料：\n${selectedMaterials.map(m=>`${m.name} · 版本 ${m.currentVersionId??'未登记版本'} · ${dataOriginLabel(m.dataOrigin)} · ${dataPurposeLabel(m.dataPurpose)}`).join('\n')}\nAI 草稿须经人工核对；所选资料不等同于资料完整性通过。`}]};}
    saved.current=await savePreparedReport(pending.current,{id:template!.id,version:template!.version},{list:async()=>(await api.getReports()).reports,create:async draft=>{const value=(await api.createReport(draft)).report;created.current=value;return value;},bind:async(value,ref)=>{created.current=value;return (await api.saveReportContent(value.id!,value.sections!,value.updatedAt,ref)).report;}});
   }
   if(taskRecord.current){forgetReportGeneration(localStorage,taskRecord.current);window.dispatchEvent(new Event(reportGenerationEvent));}
   setReport(saved.current);setStep(5);setProgress('报告草稿已保存。请核对正文后办理人工审核，通过后可导出 Word 或 PDF。');
  }catch(cause){setError(cause instanceof Error&&/报告已被修改|模板已有变化/.test(cause.message)?cause.message:created.current?'报告已保存，模板关联尚未确认，请原样重试；已有报告不会重复创建。':cause instanceof Error?cause.message:'保存未确认，请保留本次草稿并重试。');}
  finally{setBusy(false);}
 }
 const locked=busy||uploadOpen||Boolean(pending.current);
 return <><WorkflowDialog title={`创建${type}`} busy={busy&&!(generating&&backgroundReady)||uploadOpen} className="report-creation-dialog" onClose={close}><div className="report-wizard">
  <ol className="report-wizard-steps">{steps.map((s,i)=><li key={s} data-active={step===i} data-complete={step>i}><span>{step>i?<Check size={15}/>:i+1}</span>{s}</li>)}</ol>
  <div className="report-wizard-context"><FileText size={20}/><strong>{type}</strong><span>{fund?.name??'待选择基金'}{project?' / '+project.name:''}</span></div>
  <div className="report-wizard-body">
  {step===0?<fieldset disabled={locked}><h3>先确定报告归属</h3><p>选择基金，再按需要关联具体项目；名称将用于报告列表与导出文件。</p><label>所属基金<select aria-label="所属基金" value={fundId} onChange={e=>{setFundId(e.target.value);setProjectId('');setMaterialIds([]);setTemplateKey('');}}><option value="">请选择基金</option>{funds.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>关联项目（可选）<select aria-label="关联项目（可选）" value={projectId} onChange={e=>{setProjectId(e.target.value);setMaterialIds([]);setTemplateKey('');}}><option value="">基金级报告，不指定项目</option>{projects.filter(p=>p.fundId===fundId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>报告名称<input aria-label="报告名称" value={name} maxLength={240} onChange={e=>setName(e.target.value)} placeholder={`${fund?.name??'基金 / 项目名称'} · ${type}`}/></label><label>报告期 / 会议日期（可选）<input value={period} maxLength={100} onChange={e=>setPeriod(e.target.value)} placeholder="例如：2026 年第三季度"/></label></fieldset>:null}
  {step===1?<fieldset disabled={locked}><h3>选择写作模板</h3><p>查看章节与资料要求后，选择本次使用的已发布版本。</p><label>业务模板<select aria-label="业务模板" value={templateKey} onChange={e=>setTemplateKey(e.target.value)}><option value="">请选择已发布模板</option>{templates.map(t=><option key={`${t.id}:${t.version}`} value={`${t.id}:${t.version}`}>{t.title} · V{t.version}</option>)}</select></label>{model.reading?<p role="status">正在读取模板…</p>:model.error?<p role="alert">{model.error}<button data-ui="secondary" onClick={()=>void model.refresh().catch(()=>{})}>重新读取</button></p>:!templates.length?<p>暂无适用的已发布模板。<a data-ui="navigation" href="/settings?section=业务模板管理" target="_blank" rel="noreferrer">管理业务模板</a><button data-ui="secondary" onClick={()=>void model.refresh().catch(()=>{})}>重新读取模板</button></p>:null}{template?<section className="report-wizard-template"><h4>{template.title} · V{template.version}</h4><ul>{(template.fields??[]).filter((f:any)=>f.enabled!==false).map((f:any)=><li key={f.id}>{f.label}{f.required?' · 必填':''}</li>)}</ul><h4>模板资料要求</h4>{(template.materials??[]).map((m:any)=><p key={m.id}>{m.title}{m.required?' · 必需':''}{m.condition?' · '+m.condition:''}{m.instructions?' · '+m.instructions:''}</p>)}</section>:null}</fieldset>:null}
  {step===2?<fieldset disabled={locked}><h3>选取报告资料来源</h3><p>仅展示所选基金及关联项目的可见资料。AI 将核对实际正文；缺件和未识别内容会单独提示。</p>
   <div className="report-source-actions">{canUpload?<button data-ui="primary" type="button" onClick={()=>{uploaded.current=[];setUploadOpen(true);}}>{project?'补充项目资料':'补充基金资料'}</button>:<p>当前账号无上传权限，请由管理员或资料经办人补充后刷新。</p>}<button data-ui="secondary" type="button" disabled={loading} onClick={()=>void loadMaterials().catch(()=>{})}>{loading?'读取中…':'刷新资料'}</button></div>
   <input aria-label="搜索报告资料" placeholder="搜索资料名称或类型" value={query} onChange={e=>setQuery(e.target.value)}/>
   {loading?<p role="status">正在读取资料…</p>:loadError?<p role="alert">{loadError}</p>:<div className="report-wizard-materials">{visible.map(m=><label key={m.id}><input type="checkbox" checked={materialIds.includes(m.id)} disabled={!materialIds.includes(m.id)&&materialIds.length>=10} onChange={e=>setMaterialIds(ids=>e.target.checked?[...ids,m.id]:ids.filter(id=>id!==m.id))}/><span><strong>{m.name}</strong><small>{m.type} · {dataOriginLabel(m.dataOrigin)} · {dataPurposeLabel(m.dataPurpose)} · {m.currentVersion?'V'+m.currentVersion:'版本待核对'}</small></span><a data-ui="navigation" href={`/materials?materialId=${encodeURIComponent(m.id)}`} target="_blank" rel="noreferrer">查看资料</a></label>)}{!visible.length?<p>{query.trim()?'没有符合搜索条件的资料，已勾选资料仍保留。':'当前对象尚无可选资料，请先补充资料。'}{query.trim()?<button data-ui="secondary" type="button" onClick={()=>setQuery('')}>清除搜索</button>:null}</p>:null}</div>}
   <p>已选 {materialIds.length} 份，每次最多 10 份。{query.trim()&&materialIds.some(id=>!visible.some(m=>m.id===id))?'部分已选资料不在当前搜索结果中。':''}</p>
  </fieldset>:null}
  {step===3?<fieldset disabled={locked}><h3>确认数据负责人</h3><p>由实际账号负责核对本次报告的数据和来源；选择负责人不会代替人工审核。</p><label>数据负责人<select aria-label="数据负责人" value={ownerId} onChange={e=>setOwnerId(e.target.value)}><option value="">请选择数据负责人</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>{usersLoading?<p role="status">正在读取负责人目录…</p>:userError?<p role="alert">{userError}<button data-ui="secondary" onClick={()=>void loadUsers().catch(()=>{})}>重新读取负责人</button></p>:null}<section className="report-wizard-template"><h4>本次报告准备情况</h4><p>报告：{name}</p><p>模板：{template?.title} · V{template?.version}</p><p>资料：{selectedMaterials.length} 份</p><p>报告期：{period||'未指定，待核对'}</p></section></fieldset>:null}
  {step===4?<section><h3>AI 草稿与依据核对</h3>{missingText?<p role="status" className="report-missing-source">部分所选资料未取得可引用正文，相关内容须补充或人工核对；生成完成不代表资料完整。</p>:null}{sections.length?sections.map((s,i)=><article className="report-wizard-draft" key={i}><h4>{s.title}</h4><AssistantMarkdown content={s.text}/></article>):<div className="report-wizard-wait"><SparkleStatus busy={busy}/><p>{busy?'正在生成，草稿尚未完成…':'准备已完成，点击“AI 生成草稿”开始。'}</p></div>}</section>:null}
  {step===5&&report?<section><h3>草稿已保存，进入人工审核</h3><ReportContentEditor readFirst report={report} canEdit={false} onSaved={async r=>{setReport(r);saved.current=r;}}/></section>:null}
  </div>
  <div className="report-wizard-feedback" role={error?'alert':'status'}>{error||progress||'按步骤核对本次报告，保存前可返回调整。'}</div>
  <footer><div>{step>0&&step<5?<button data-ui="secondary" type="button" disabled={locked} onClick={()=>{setError('');setStep(s=>s-1);setSections([]);}}>上一步</button>:null}<button data-ui="secondary" type="button" disabled={busy&&!(generating&&backgroundReady)} onClick={()=>void close()}>{generating?'后台继续':'取消'}</button></div><div>{step<4?<button data-ui="primary" type="button" disabled={busy} onClick={next}>下一步<ChevronRight size={16}/></button>:step===4?<><button data-ui="secondary" type="button" disabled={locked} onClick={()=>void generate()}>{busy?'处理中…':sections.length?'重新生成草稿':'AI 生成草稿'}</button>{sections.length?<button data-ui="primary" type="button" disabled={busy} onClick={()=>void save()}>{busy?'保存中…':created.current?'继续确认保存':'确认草稿并保存'}</button>:null}</>:<button data-ui="primary" type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await onSaved(saved.current!);}catch{setError('报告已保存，列表刷新未完成，请重试进入审核。');}finally{setBusy(false);}}}>进入人工审核与导出<ChevronRight size={16}/></button>}</div></footer>
 </div></WorkflowDialog>{uploadOpen&&target&&fund?<MaterialUploadDialog projects={project?[project]:projects.filter(p=>p.fundId===fundId)} initialProjectId={project?.id} fund={project?undefined:fund} categories={['基金资料','财务资料','法务资料','会议资料','投后资料','其他资料']} onClose={()=>setUploadOpen(false)} onUploaded={rows=>{uploaded.current=rows;}} onSaved={finishUpload}/>:null}</>;
}
function SparkleStatus({busy}:{busy:boolean}){return busy?<LoaderCircle className="report-wizard-spinner" size={32}/>:<FileText size={32}/>;}
