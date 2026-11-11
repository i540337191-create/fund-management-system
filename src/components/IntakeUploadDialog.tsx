import {FileUploadButton} from './FileUploadButton';
import {confirmAction} from './SystemConfirmation';
import {useRef,useState} from 'react';
import type {AiIntakeItem,Fund} from '../data/funds';
import type {Project} from '../data/projects';
import type {ApiClient,ApiMaterial} from '../lib/apiClient';
import {WorkflowDialog} from './MaterialFileDialogs';
import {NoticeHelp} from './NoticeHelp';

const input='assistant-modal-input';
const accepted='.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.wav,.mp3,.m4a,.ogg,.webm,.flac';
function failure(error:unknown){
 const code=(error as {code?:string})?.code;
 const messages:Record<string,string>={ai_intake_extraction_pending:'原件正在识别或转写，请稍后点击重试。',ai_intake_extraction_failed:'原件正文识别失败，请在资料库检查原件后重试。',ai_intake_source_empty:'未读取到可理解的正文，请检查原件。',ai_intake_source_too_long:'原件内容较长，请拆分后上传。',ai_intake_ai_unavailable:'AI 服务暂不可用，原件已保留，请稍后重试。',ai_intake_draft_invalid:'AI 返回内容未通过校验，未创建收件，请重试。',ai_intake_fund_required:'原件尚未明确关联基金，请在资料库核对基金与项目归属。',ai_intake_source_unavailable:'原件版本不可读取，请在资料库核对原件。',ai_intake_source_changed:'原件版本已变化，请重新选择资料后识别。',material_signature_mismatch:'文件内容与扩展名不一致，请核对原件。',unsupported_material_type:'不支持此文件格式。',material_not_found:'原件不可读取，请核对访问权限或重新选择。'};
 if((error as {status?:number})?.status===403)return '当前账号没有上传或识别资料的权限。';
 return messages[code??'']??'本次处理未完成，请检查连接与原件后重试。';
}
export function IntakeUploadDialog({api,projects,funds,materials,initialType,onCreated,onClose}:{api:ApiClient;projects:Project[];funds:Fund[];materials:ApiMaterial[];initialType:AiIntakeItem['inputType'];onCreated:(result:Awaited<ReturnType<ApiClient['createAiIntakeFromMaterial']>>)=>void;onClose:()=>void}){
 const [mode,setMode]=useState<'upload'|'existing'>('upload'),[type,setType]=useState(initialType),[scope,setScope]=useState<'project'|'fund'>(projects.length?'project':'fund'),[objectId,setObjectId]=useState(''),[file,setFile]=useState<File|null>(null),[selectedId,setSelectedId]=useState('');
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[duplicateId,setDuplicateId]=useState('');
 const uploaded=useRef<ApiMaterial|null>(null),requestId=useRef(crypto.randomUUID());
 const readable=materials.filter(m=>m.currentVersionId&&m.originalFilePath);
 const close=async ()=>{if(!busy&&(!(file||selectedId)||await confirmAction(uploaded.current?'原件已保存在资料库。关闭后可从资料库继续识别，是否关闭？':'尚未完成资料处理，是否关闭？')))onClose();};
 return <WorkflowDialog title="上传并识别资料" busy={busy} onClose={close}><form className="space-y-4" onSubmit={async event=>{
  event.preventDefault();if(busy)return;
  if(mode==='upload'&&!uploaded.current&&(!file||!objectId||!file.size||file.size>25*1024*1024)){setError('请选择归属和原始文件，单文件最大25 MiB。');return;}
  if(mode==='existing'&&!selectedId){setError('请选择已保存的原件。');return;}
  setBusy(true);setError('');setDuplicateId('');
  try{
   let materialId=selectedId;
   if(mode==='upload'){
    if(!uploaded.current){setProgress('正在保存原始文件…');const result=await api.uploadMaterial({file:file!,...(scope==='project'?{projectId:objectId}:{fundId:objectId}),type:type==='会议纪要'?'会议资料':type==='投资协议'?'法务资料':'财务资料',requestId:requestId.current});uploaded.current=result.material;}
    materialId=uploaded.current.id;
   }
   setProgress('正在读取原件并由 AI 整理，请稍候…');
   const result=await api.createAiIntakeFromMaterial(materialId,type);
   onCreated(result);onClose();
  }catch(cause){setDuplicateId((cause as {existingMaterialId?:string})?.existingMaterialId??'');setError(failure(cause));}finally{setBusy(false);setProgress('');}
 }}>
  <p className="text-sm leading-6 text-[var(--secondary)]">保存真实原件并识别正文，生成待确认收件。核对归属后确认归档；建议任务需另行选择负责人和截止日后创建。识别失败时原件保留，可继续重试。</p>
  <fieldset disabled={busy} className="space-y-4">
   <label className="block text-sm">资料类型<select className={input} value={type} disabled={Boolean(uploaded.current)} onChange={e=>setType(e.target.value as AiIntakeItem['inputType'])}>{['会议纪要','投资协议','财务报表'].map(t=><option key={t}>{t}</option>)}</select></label>
   <div className="flex flex-wrap gap-3" role="group" aria-label="资料来源"><button data-ui="secondary" type="button" disabled={Boolean(uploaded.current)} aria-pressed={mode==='upload'} onClick={()=>{setMode('upload');setError('');}}>上传原件</button><button data-ui="secondary" type="button" disabled={Boolean(uploaded.current)} aria-pressed={mode==='existing'} onClick={()=>{setMode('existing');setError('');}}>选择资料库原件</button></div>
   {mode==='upload'?<>
    <label className="block text-sm">归属类型<select className={input} disabled={Boolean(uploaded.current)} value={scope} onChange={e=>{setScope(e.target.value as 'project'|'fund');setObjectId('');}}><option value="project">项目</option><option value="fund">基金</option></select></label>
    <label className="block text-sm">{scope==='project'?'关联项目':'关联基金'}<select required={!uploaded.current} className={input} disabled={Boolean(uploaded.current)} value={objectId} onChange={e=>setObjectId(e.target.value)}><option value="">请选择</option>{(scope==='project'?projects:funds).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <div className="block text-sm">原始文件<FileUploadButton selectedNames={file?[file.name]:[]} className={input} aria-label="收件原始文件" accept={accepted} disabled={Boolean(uploaded.current)} onChange={e=>{setFile(e.target.files?.[0]??null);requestId.current=crypto.randomUUID();setError('');}}/></div>
    <p className="text-xs leading-6 text-[var(--secondary)]">支持 PDF、Office、文本、图片及录音；最大25 MiB，录音最长60分钟。{uploaded.current?`已保存：${uploaded.current.name}。重试不会重复上传。`:''}</p>
   </>:<label className="block text-sm">已保存原件<select required className={input} value={selectedId} onChange={e=>{setSelectedId(e.target.value);setError('');}}><option value="">请选择资料</option>{readable.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>{!readable.length?<span className="mt-2 block text-xs">暂无可识别原件，请切换到“上传原件”。</span>:null}</label>}
  </fieldset>
  <div role="status" className="min-h-12 space-y-2 text-sm">{uploaded.current?<p className="text-green-700 dark:text-green-400">✓ 原件已上传并保存在资料库。识别与字段完整性单独核对。</p>:null}<p>{progress||'保存原件后自动识别；识别失败仍保留原件。'}</p></div>
  {error?<p role="alert" className="text-sm text-[var(--danger)]">{error}<NoticeHelp message={error}/></p>:null}
  {duplicateId?<button data-ui="secondary" type="button" disabled={busy} onClick={()=>{setMode('existing');setSelectedId(duplicateId);setError('原件已存在，将使用资料库原件继续识别。');}}>使用已存在的原件</button>:null}
  <div className="flex flex-wrap justify-end gap-3"><button data-ui="secondary" type="button" disabled={busy} onClick={close}>取消</button><button data-ui="primary" type="submit" disabled={busy}>{busy?'处理中…':uploaded.current?'重试识别':'识别并生成收件'}</button></div>
 </form></WorkflowDialog>;
}
