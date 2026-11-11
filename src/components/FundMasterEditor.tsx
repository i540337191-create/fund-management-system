import '../iterationB/fund-create-c.css';
import {FundOriginalPreview} from '../iterationB/FundOriginalPreview';
import {FileText,ClipboardCheck,PenLine,Save,RotateCcw,Layers3} from 'lucide-react';
import {confirmAction} from './SystemConfirmation';
import {BusinessIntakePanel,bindBusinessIntake,type BusinessIntakeViewState} from './BusinessIntakePanel';
import {NoticeHelp} from './NoticeHelp';
import {CustomFieldForm,CustomFieldDetails,useCustomFields} from "./CustomFieldInputs";
import {getCustomValue,isMissingCustom,customErrorMessage} from "../lib/customFields";
import {useEffect,useId,useRef,useState} from 'react';
import type {Fund,FundStage} from '../data/funds';
import {createApiClient} from '../lib/apiClient';
import {fundStages,type FundManager,type FundMasterInput,type FundMasterResult} from '../lib/fundMasterTypes';
import {WorkflowDialog} from './MaterialFileDialogs';

const api=createApiClient();
const fieldLabels:Record<string,string>={name:'基金名称',shortName:'基金简称',managerId:'基金负责人',stage:'基金阶段',scale:'规模描述',nextAction:'下一步事项',review:'人工核对确认'};
const field='mt-1 block min-h-10 w-full rounded-md border border-[var(--line)] bg-[var(--inset)] p-2 text-sm';
const button='min-h-10 rounded-md border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--hover)] disabled:opacity-50';
function failure(e:unknown){
 const {status,code}=e as {status?:number;code?:string};
 if(code?.includes("custom")||code?.startsWith("schema_"))return customErrorMessage(e);
 if(status===401)return '登录已失效，请重新登录后核对本次保存结果。';
 if(status===403)return '当前账号没有基金维护权限。';
 if(code==='invalid_fund_manager')return '负责人已不可选，请重新读取人员名单并选择。';
 if(code==='fund_access_assignment_conflict')return '本次未保存：该负责人设置会使你失去基金访问权限。新建时请选择本人；转交现有基金，请先由管理员将你加入基金成员。';
 if(status===409)return '基金或请求状态已变化，请核对最新主档后再保存。';
 if(status===400)return '未保存，请核对必填字段、长度及负责人。';
 return '暂未确认保存结果。填写内容已保留，请原样重试本次保存。';
}
function FundFacts({fund}:{fund:Fund}){return <dl className="grid gap-2 break-words text-sm sm:grid-cols-2">{[['基金',fund.name],['简称',fund.shortName],['负责人',fund.manager],['阶段',fund.stage],['规模描述',fund.scale],['下一步',fund.nextAction],['当前版本',`V${fund.revision??'未返回'}`],['基金标识',fund.id]].map(([k,v])=><div key={k}><dt className="text-[var(--secondary)]">{k}</dt><dd className="[overflow-wrap:anywhere]">{v||'未录入'}</dd></div>)}</dl>;}

export function FundMasterEditor({fund,onClose,onSaved}:{fund?:Fund;onClose:()=>void;onSaved:(result:FundMasterResult)=>Promise<void>}){
 const managerFieldId=useId();
 const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({}),[focusTarget,setFocusTarget]=useState('');
 const errorProps=(key:string)=>({'aria-label':key==='review'?undefined:fieldLabels[key],'aria-invalid':Boolean(fieldErrors[key])||undefined,'aria-describedby':fieldErrors[key]?`${managerFieldId}-${key}-error`:undefined});
 const errorNote=(key:string)=>fieldErrors[key]?<span id={`${managerFieldId}-${key}-error`} className="fund-field-error">{fieldErrors[key]}</span>:null;
 const focusProblem=(key:string)=>setFocusTarget(key);
 const [intakeState,setIntakeState]=useState<BusinessIntakeViewState>({attachments:[],candidateCount:0,missing:[],uploadState:'idle',busy:false,extractionState:'尚未上传原件',recognition:'idle'});
 const [reviewed,setReviewed]=useState(false);const formRef=useRef<HTMLFormElement>(null);
 const intake=useRef<string|undefined>(undefined),intakePrepare=useRef<(()=>Promise<string>)|undefined>(undefined);
 const [name,setName]=useState(fund?.name??''),[shortName,setShortName]=useState(fund?.shortName??''),[managerId,setManagerId]=useState(fund?.managerId??''),[stage,setStage]=useState<FundStage|''>(fund?.stage??''),[scale,setScale]=useState(fund?.scale??''),[nextAction,setNextAction]=useState(fund?.nextAction??'');
 const custom=useCustomFields('fund',fund,fund?.id??'new',stage);
 const [source,setSource]=useState(fund);
 const [revision,setRevision]=useState(fund?.revision),[users,setUsers]=useState<FundManager[]>([]),[loading,setLoading]=useState(true),[directoryError,setDirectoryError]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false),[latest,setLatest]=useState<Fund|null>(null),[unknown,setUnknown]=useState(false),[blocked,setBlocked]=useState(false),[committed,setCommitted]=useState<FundMasterResult|null>(null);
 useEffect(()=>{if(busy||!focusTarget)return;const frame=requestAnimationFrame(()=>{const node=formRef.current?.querySelector(`[data-fund-field="${CSS.escape(focusTarget)}"]`)?.querySelector('input,select,textarea');if(node instanceof HTMLElement&&node.isConnected){node.scrollIntoView({block:'center'});node.focus({preventScroll:true});}setFocusTarget('');});return()=>cancelAnimationFrame(frame);},[busy,focusTarget]);
 const dirty=useRef(false);
 const flowBusy=intakeState.busy&&(intakeState.uploadState==='uploading'||intakeState.recognition==='running');
 const close=async ()=>{if(busy||flowBusy)return;if(!busy&&dirty.current&&!committed){try{await intakePrepare.current?.();}catch(error){setError(error instanceof Error?error.message:'草稿未确认保存，请保留输入后重试。');return;}}if(!busy&&(!dirty.current||Boolean(committed)||await confirmAction('资料有未保存修改或保存结果待核对，关闭后需重新核对。是否关闭？')))onClose();};
 const active=useRef(true),working=useRef(false),pending=useRef<FundMasterInput|null>(null);
 const loadManagers=async()=>{setLoading(true);setDirectoryError('');try{const result=await api.getFundManagers();if(active.current)setUsers(result.users);}catch(e){if(active.current)setDirectoryError((e as {status?:number}).status===403?'当前账号不能读取人员名单。':(e as {status?:number}).status===401?'登录已失效，请重新登录。':'暂时未能读取人员名单，请重试。');}finally{if(active.current)setLoading(false);}};
 useEffect(()=>{active.current=true;void loadManagers();return()=>{active.current=false;};},[]);
 const readLatest=async()=>{if(!fund)return;try{const result=await api.getFund(fund.id);if(active.current)setLatest(result.fund);}catch(e){if(active.current)setError('最新基金资料尚未读取，当前填写已保留，请重试读取。');}};
 useEffect(()=>{setReviewed(false);},[intakeState.draftId,intakeState.attachments.map(a=>a.id).join('|'),intakeState.recognition]);
 const changed=()=>{pending.current=null;setError('');if(!fund)setReviewed(false);};
 const save=async()=>{
  if(working.current||conflict||blocked)return;
  working.current=true;setBusy(true);setError('');setFieldErrors({});
  let attempted=false;let saved=committed;
  try{
   if(committed){await bindBusinessIntake(intake.current,committed.fund.id);await onSaved(committed);return;}
   if(!pending.current){
    const missing=[['name',name.trim(),'基金名称'],['shortName',shortName.trim(),'基金简称'],['managerId',managerId&&users.some(u=>u.id===managerId),'可用负责人'],['stage',stage,'基金阶段'],...(custom.formSchema?.fields??[]).filter(f=>f.enabled&&f.required&&(!fund||!isMissingCustom(getCustomValue(custom.original,f.id)))&&isMissingCustom(getCustomValue(custom.values,f.id))).map(f=>['customFields.'+f.id,false,f.label])].filter(([,value])=>!value);
    if(missing.length||!stage){setFieldErrors(Object.fromEntries(missing.map(([key,,label])=>[key,`${key==='stage'||key==='managerId'?'请选择':'请填写'}${label}。`])));focusProblem(String(missing[0][0]));throw Error('请补齐'+missing.map(([,value,label])=>label).join('、')+'后保存基金。');}
    if(!fund&&intakeState.attachments.length&&!['complete','failed'].includes(intakeState.recognition))throw Error('请先对已上传原件开始AI检查，再核对填写；当前内容已保留。');
    if(!fund&&!reviewed){setFieldErrors({review:'请先勾选人工核对确认，再保存基金。'});focusProblem('review');throw Error('请先完成下方人工核对确认，再保存基金。');}
    await intakePrepare.current?.();
    if(fund&&!Number.isInteger(revision))throw Error('未取得基金版本，请关闭并刷新主档后再编辑。');
    pending.current={requestId:crypto.randomUUID(),name:name.trim(),shortName:shortName.trim(),managerId,stage,scale:scale.trim(),nextAction:nextAction.trim(),...custom.payload()};
   }
   attempted=true;
   const result=fund?await api.updateFund(fund.id,{...pending.current,expectedRevision:revision!}):await api.createFund(pending.current);
   if(!active.current)return;
   saved=result;setCommitted(result);setUnknown(false);pending.current=null;await bindBusinessIntake(intake.current,result.fund.id);await onSaved(result);
  }catch(e){if(active.current){
   if(!attempted&&e instanceof Error)setError(e.message);else setError(saved?'基金已保存，原件归档或页面刷新尚未完成，请重试完成后续步骤。':(e as {code?:string}).code?.includes('custom')?customErrorMessage(e,custom.schema??undefined):failure(e));
   const returnedFields=(e as {fields?:string[]}).fields??[];
   const invalidFields=returnedFields.map(key=>{const basic=fieldLabels[key]?key:Object.keys(fieldLabels).find(id=>fieldLabels[id]===key);if(basic)return basic;const extra=custom.schema?.fields.find(f=>f.id===key.replace(/^customFields\./,'')||f.label===key);return extra?'customFields.'+extra.id:null;}).filter((key):key is string=>Boolean(key));
   if(invalidFields.length){setFieldErrors(Object.fromEntries(invalidFields.map(key=>[key,`请核对${fieldLabels[key]??custom.schema?.fields.find(f=>f.id===key.slice(13))?.label??'此项内容'}，当前内容不符合保存要求。`])));focusProblem(invalidFields[0]);}
   const status=(e as {status?:number}).status;
   if(status===401||status===403||(e as {code?:string}).code==='client_session_changed')setBlocked(true);
   else if((e as {code?:string}).code==='fund_access_assignment_conflict'){setUnknown(false);pending.current=null;}
   else if(status===409&&(e as {code?:string}).code==="custom_schema_revision_conflict"){setUnknown(false);pending.current=null;await custom.reload();}
   else if(status===409){setUnknown(false);pending.current=null;if(fund){setConflict(true);await readLatest();}else await custom.reload();}
   else if(status===400){setUnknown(false);pending.current=null;await loadManagers();}
   else if(attempted&&!saved)setUnknown(true);
  }}finally{working.current=false;if(active.current)setBusy(false);}
 };
 const intakePanel=<BusinessIntakePanel layout={fund?undefined:'fund-c'} onStateChange={setIntakeState} preview={fund?undefined:(openFile,disabled)=><FundOriginalPreview draftId={intakeState.draftId} attachments={intakeState.attachments} onUpload={openFile} uploadDisabled={disabled}/>} formState={{managerId,stage}} onRestoreFormState={state=>{setFieldErrors(errors=>Object.fromEntries(Object.entries(errors).filter(([key])=>!Object.prototype.hasOwnProperty.call(state,key))));if(typeof state.managerId==='string')setManagerId(state.managerId);if(typeof state.stage==='string')setStage(state.stage as FundStage);dirty.current=true;changed();}} prepareRef={intakePrepare} customSchema={custom.schema} customValues={custom.values} onRestoreCustom={v=>{setFieldErrors(errors=>Object.fromEntries(Object.entries(errors).filter(([key])=>!key.startsWith('customFields.')||!Object.prototype.hasOwnProperty.call(v,key.slice(13)))));custom.setValues(v);dirty.current=true;changed();}} objectType="fund" objectId={fund?.id} stage={stage} fields={{name,shortName,scale,nextAction}} disabled={busy||unknown||Boolean(committed)||blocked} onDraft={id=>{intake.current=id;}} onApply={v=>{setFieldErrors(errors=>Object.fromEntries(Object.entries(errors).filter(([key])=>!Object.prototype.hasOwnProperty.call(v,key))));if(v.name!==undefined)setName(v.name);if(v.shortName!==undefined)setShortName(v.shortName);if(v.scale!==undefined)setScale(v.scale);if(v.nextAction!==undefined)setNextAction(v.nextAction);dirty.current=true;changed();}}/>;
 const stageField=<label className="text-sm" data-fund-field="stage">基金阶段<select {...errorProps('stage')} required className={field} value={stage} onChange={e=>{setStage(e.target.value as FundStage);changed();}}><option value="">请选择阶段</option>{fundStages.map(s=><option key={s}>{s}</option>)}</select>{errorNote('stage')}</label>;
 const formFields=<fieldset className="fund-c-fields grid gap-4 sm:grid-cols-2" disabled={busy||unknown||Boolean(committed)||blocked}>
   <label className="text-sm sm:col-span-2" data-fund-field="name">基金名称<input {...errorProps('name')} autoFocus={Boolean(fund)} required maxLength={200} className={field} value={name} onChange={e=>{setName(e.target.value);changed();}}/>{errorNote('name')}</label>
   <label className="text-sm" data-fund-field="shortName">基金简称<input {...errorProps('shortName')} required maxLength={100} className={field} value={shortName} onChange={e=>{setShortName(e.target.value);changed();}}/>{errorNote('shortName')}</label>
   {fund?stageField:null}
   <div className="text-sm sm:col-span-2 fund-manager-field" data-fund-field="managerId"><div className="fund-manager-heading"><label htmlFor={managerFieldId}>基金负责人</label></div><select {...errorProps('managerId')} id={managerFieldId} required className={field} disabled={loading||Boolean(directoryError)} value={managerId} onChange={e=>{setManagerId(e.target.value);changed();}}><option value="">{loading?'正在读取人员…':'请选择已启用的人员'}</option>{managerId&&!users.some(u=>u.id===managerId)?<option value={managerId} disabled>原负责人暂不可选，请重新选择</option>:null}{users.map(u=><option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select>{errorNote('managerId')}{!loading&&!directoryError&&!users.length?<p className="text-xs text-[var(--secondary)]">暂无可用负责人，请补齐账号后重新读取。</p>:null}</div>
   {!fund?stageField:null}
   <label className="text-sm sm:col-span-2" data-fund-field="scale">规模描述（选填）<input {...errorProps('scale')} maxLength={500} className={field} value={scale} onChange={e=>{setScale(e.target.value);changed();}}/>{errorNote('scale')}</label>
   <label className="text-sm sm:col-span-2" data-fund-field="nextAction">下一步事项（选填）<textarea {...errorProps('nextAction')} rows={3} maxLength={2000} className={field} value={nextAction} onChange={e=>{setNextAction(e.target.value);changed();}}/>{errorNote('nextAction')}</label>
  <div className="sm:col-span-2"><CustomFieldForm errors={Object.fromEntries(Object.entries(fieldErrors).filter(([key])=>key.startsWith('customFields.')).map(([key,value])=>[key.slice(13),value]))} state={custom} existing={Boolean(fund)} disabled={busy||unknown||Boolean(committed)||blocked} onChange={changed}/></div>
 </fieldset>;
 const feedback=<>{directoryError?<div className="space-y-2 text-sm"><p role="alert">人员名单读取失败：{directoryError}</p><button data-ui="info" type="button" className={button} disabled={busy} onClick={()=>void loadManagers()}>重新读取人员名单</button></div>:null}
  {error?<p role="alert" className="text-sm">{error}<NoticeHelp message={error}/></p>:null}
  {unknown?<p className="text-sm text-[var(--secondary)]">保存结果尚未确认，暂时锁定填写内容；重试沿用同一请求，不重复建档。关闭后请先核对基金列表。</p>:null}
  {committed?<p role="status" className="text-sm">已保存 {committed.fund.name}。可重试完成原件归档与页面刷新，不会重复建立基金。</p>:null}
  {conflict?<section className="space-y-3 rounded-lg border border-[var(--line)] p-4"><p className="text-sm font-medium">本次填写保留，请与最新主档核对。</p>{latest?<><FundFacts fund={latest}/><CustomFieldDetails data={latest}/><button data-ui="secondary" type="button" className={button} disabled={busy||!Number.isInteger(latest.revision)} onClick={()=>{for(const [value,prior,next,set] of [[name,source?.name,latest.name,setName],[shortName,source?.shortName,latest.shortName,setShortName],[managerId,source?.managerId,latest.managerId??'',setManagerId],[scale,source?.scale,latest.scale,setScale],[nextAction,source?.nextAction,latest.nextAction,setNextAction]] as const){if(value===prior)set(next);}if(stage===source?.stage)setStage(latest.stage);setSource(latest);setRevision(latest.revision);custom.rebase(latest);setConflict(false);setLatest(null);changed();}}>已核对最新主档，保留本次修改并采用此版本</button></>:<button data-ui="secondary" type="button" className={button} disabled={busy} onClick={()=>void readLatest()}>读取最新主档</button>}</section>:null}</>;
 const steps=[{title:'上传原件',text:'上传协议、合同或设立文件，先核对原件。',done:intakeState.attachments.length>0,Icon:FileText},{title:'AI检查',text:'检查实际原件，候选内容逐项保留依据。',done:intakeState.recognition==='complete',Icon:ClipboardCheck},{title:'核对补充',text:'核对候选与待补内容，完善下方基金主档。',done:reviewed,Icon:PenLine},{title:'保存基金',text:'确认资料后创建主档，原件与草稿保留关联。',done:Boolean(committed),Icon:Save}];
 const recovery=()=>{const node=formRef.current?.querySelector<HTMLDetailsElement>('.intake-recovery');if(node){node.open=true;node.scrollIntoView({block:'start'});node.querySelector<HTMLElement>('select,button')?.focus({preventScroll:true});}};
 return <WorkflowDialog title={fund?'编辑基金资料':'新建基金'} className={fund?'':'fund-c-drawer'} busy={busy||flowBusy} onClose={close}><form ref={formRef} noValidate onChangeCapture={event=>{dirty.current=true;const key=(event.target as HTMLElement).closest('[data-fund-field]')?.getAttribute('data-fund-field');if(key)setFieldErrors(errors=>Object.fromEntries(Object.entries(errors).filter(([name])=>name!==key)));}} className={fund?'space-y-5':'fund-c-form'} onSubmit={e=>{e.preventDefault();void save();}}>
 {fund?<>{intakePanel}<p className="text-sm leading-6 text-[var(--secondary)]">维护基金主档。规模为录入描述；实缴、已投及余额由各自账本核验，不能在此修改。改名不会影响已有档案关联。</p>{formFields}{feedback}</>:<div className="fund-c-layout"><aside className="fund-c-guide"><h3>操作说明</h3><p>新建基金流程</p><ol>{steps.map(({title,text,done,Icon},index)=><li key={title} data-complete={done}><span className="fund-c-step-number">{done?<Icon size={16}/>:index+1}</span><div><strong>{title}</strong><p>{text}</p>{index===1&&intakeState.recognition==='failed'?<small>AI检查未完成，请核对原件后明确确认。</small>:null}</div></li>)}</ol></aside><div className="fund-c-main">{intakePanel}<section className="fund-c-record"><header><Layers3 size={21}/><h3>新建基金</h3><button data-ui="secondary" type="button" onClick={recovery} disabled={busy||flowBusy}><RotateCcw size={15}/>草稿恢复</button></header><p className="fund-c-record-note">核对后保存基金主档；出资、余额及资金记录在各自账本办理。</p>{formFields}<label className="fund-c-review" data-fund-field="review" data-invalid={Boolean(fieldErrors.review)}><input {...errorProps('review')} type="checkbox" checked={reviewed} disabled={busy||unknown||Boolean(committed)||blocked||flowBusy} onChange={e=>setReviewed(e.target.checked)}/><span>{intakeState.attachments.length?intakeState.recognition==='failed'?'AI检查未完成，我已人工核对原件、字段与待补事项后继续建档。':'我已核对原件、识别候选与下方基金主档，待补事项已明确。':'我已核对手工填写的基金主档，缺少的原件将按实际要求补齐。'}{errorNote('review')}</span></label><div className="fund-c-form-feedback">{feedback}</div></section></div></div>}
 <footer className={fund?"flex flex-wrap gap-3":"fund-c-footer"}><button data-ui="primary" type="submit" className={`${button} bg-gold text-[#181a20]`} disabled={busy||flowBusy||conflict||blocked||(!committed&&!unknown&&(loading||Boolean(directoryError)||custom.loading||!custom.schema||custom.issues.length>0))}>{busy?'保存与刷新中…':committed?'完成归档与刷新':unknown?'核对并重试本次保存':fund?'保存基金资料':'保存基金'}</button><button data-ui="secondary" type="button" className={button} disabled={busy||flowBusy} onClick={close}>取消</button></footer>
 </form></WorkflowDialog>;
}
