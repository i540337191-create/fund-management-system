import {RefreshButton} from '../iterationA/RefreshButton';
import {confirmAction} from './SystemConfirmation';
import {BusinessIntakePanel,bindBusinessIntake} from './BusinessIntakePanel';
import {NoticeHelp} from './NoticeHelp';
import {CustomFieldForm,CustomFieldDetails,useCustomFields} from './CustomFieldInputs';
import {customErrorMessage,type CustomSchema} from '../lib/customFields';
import {dataOriginLabel} from '../lib/dataOrigin';
import {useEffect,useRef,useState} from 'react';
import type {Project} from '../data/projects';
import {createApiClient} from '../lib/apiClient';
import {companyBindingPayload,emptyCompanyBinding,type Company,type CompanyBinding,type ProjectMasterInput} from '../lib/companyProjectTypes';
import {WorkflowDialog} from './MaterialFileDialogs';

const api=createApiClient();
export const masterField='mt-1 block min-h-10 w-full rounded-md border border-[var(--line)] bg-[var(--inset)] p-2 text-sm';
export const masterButton='min-h-10 rounded-md border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--hover)] disabled:opacity-50';
export function masterFailure(e:unknown,schema?:CustomSchema){
 const {status,code}=e as {status?:number;code?:string};
 if(code?.includes('custom')||code?.startsWith('schema_'))return customErrorMessage(e,schema);
 if(status===401)return '登录已失效，请重新登录后核对结果。';
 if(status===403)return '当前账号没有主档维护权限。';
 if(status===404)return '关联对象已不可用，请重新读取后核对。';
 if(code==='company_name_conflict'||code==='company_name_exists')return '企业名称已有记录，请核对真实主体并明确选择已有企业，不能凭名称自动合并。';
 if(status===409)return '主档或本次请求已变化，请核对最新记录后再保存。';
 if(status===400)return '未保存，请核对必填字段、长度及企业关联。';
 return '暂未确认保存结果。请保留填写内容，原样重试本次保存。';
}

export function CompanyBindingFields({value,onChange,disabled,refreshKey=0}:{refreshKey?:number;value:CompanyBinding;onChange:(next:CompanyBinding)=>void;disabled?:boolean}){
 const custom=useCustomFields('company',undefined,String(refreshKey));
 useEffect(()=>{if(value.mode==='new')onChange({...value,newCompany:{...value.newCompany,schemaRevision:custom.loading||custom.error||custom.issues.length?undefined:custom.schema?.schemaRevision,customFields:custom.values}});},[custom.schema,custom.values,custom.loading,custom.error,value.mode]);
 const [unavailable,setUnavailable]=useState(false);
 const [companies,setCompanies]=useState<Company[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const active=useRef(true);
 const load=async()=>{setLoading(true);setError('');try{const r=await api.getCompanies();if(active.current)setCompanies(r.companies);}catch(e){if(active.current){if((e as {status?:number}).status===404)setUnavailable(true);else setError(masterFailure(e));}}finally{if(active.current)setLoading(false);}};
 useEffect(()=>{active.current=true;void load();return()=>{active.current=false;};},[]);
 if(unavailable)return null;
 return <fieldset disabled={disabled} className="space-y-3 rounded-lg border border-[var(--line)] p-4"><legend className="px-1 text-sm font-medium">关联企业主体</legend>
  <p className="text-sm leading-6 text-[var(--secondary)]">企业与投资项目分别建档。只有明确选择的企业才会建立关联；名称相同不会自动认定为同一主体。</p>
  <label className="block text-sm">企业关联方式<select className={masterField} value={value.mode} onChange={e=>onChange({...value,mode:e.target.value as CompanyBinding['mode']})}><option value="unbound">暂不绑定企业（保留未核实）</option><option value="existing">选择已有企业</option><option value="new">新建企业并关联</option></select></label>
  {value.mode==='existing'?<><label className="block text-sm">已有企业<select required disabled={loading||Boolean(error)} className={masterField} value={value.companyId} onChange={e=>onChange({...value,companyId:e.target.value})}><option value="">{loading?'正在读取企业…':'请选择实际企业主体'}</option>{companies.map(c=><option value={c.id} key={c.id}>{c.name} · {c.dataOrigin?dataOriginLabel(c.dataOrigin):'来源未核实'}</option>)}</select></label>{!loading&&!error&&!companies.length?<p className="text-sm">暂无企业档案，可选择新建并关联。</p>:null}</>:null}
  {value.mode==='new'?<div className="grid gap-3 sm:grid-cols-2">{([['企业主体名称','name',200],['企业主体简称','shortName',100],['企业主体行业（选填）','industry',200]] as const).map(([label,key,limit])=><label key={key} className={`text-sm ${key==='industry'?'sm:col-span-2':''}`}>{label}<input required={key!=='industry'} maxLength={Number(limit)} className={masterField} value={value.newCompany[key]} onChange={e=>onChange({...value,newCompany:{...value.newCompany,[key]:e.target.value}})}/></label>)}</div>:null}
  {value.mode==='new'?<CustomFieldForm state={custom} disabled={disabled} onChange={()=>{}}/>:null}
  {error?<p role="alert" className="text-sm">企业名单读取失败：{error}</p>:null}
  <RefreshButton data-ui="info" type="button" disabled={disabled||loading} className={masterButton} onClick={()=>void load()}>刷新企业名单</RefreshButton>
 </fieldset>;
}

export function ProjectMasterEditor({project,onClose,onSaved}:{project:Project;onClose:()=>void;onSaved:(project:Project)=>Promise<void>}){
 const intake=useRef<string|undefined>(undefined),intakePrepare=useRef<(()=>Promise<string>)|undefined>(undefined);
 const custom=useCustomFields('project',project,project.id,project.stage);
 const [companySchemaRefresh,setCompanySchemaRefresh]=useState(0);
 const [name,setName]=useState(project.name),[shortName,setShortName]=useState(project.shortName),[industry,setIndustry]=useState(project.industry),[description,setDescription]=useState(project.description),[binding,setBinding]=useState(emptyCompanyBinding),[source,setSource]=useState(project),[latest,setLatest]=useState<Project|null>(null),[conflict,setConflict]=useState(false),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[blocked,setBlocked]=useState(false),[error,setError]=useState(''),[committed,setCommitted]=useState<Project|null>(null);
 const dirty=useRef(false);
 const close=async ()=>{if(!busy&&dirty.current&&!committed){try{await intakePrepare.current?.();}catch(error){setError(error instanceof Error?error.message:'草稿未确认保存，请保留输入后重试。');return;}}if(!busy&&(!dirty.current||Boolean(committed)||await confirmAction('资料有未保存修改或保存结果待核对，关闭后需重新核对。是否关闭？')))onClose();};
 const active=useRef(true),working=useRef(false),pending=useRef<ProjectMasterInput|null>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const changed=()=>{pending.current=null;setError('');};
 const readLatest=async()=>{try{const r=await api.getProject(project.id);if(active.current)setLatest(r.project);}catch(e){if(active.current)setError('最新项目资料尚未读取，当前填写已保留，请重试读取。');}};
 const save=async()=>{
  if(working.current||blocked||conflict)return;working.current=true;setBusy(true);setError('');let attempted=false,saved=committed;
  try{
   if(saved){await bindBusinessIntake(intake.current,saved.id);await onSaved(saved);return;}
   if(!pending.current){await intakePrepare.current?.();if(!source.companyId&&binding.mode==='new'&&binding.newCompany.schemaRevision===undefined)throw Error('企业字段设置尚未读取，请先重试。');if(!name.trim()||!shortName.trim()||!industry.trim())throw Error('请填写项目名称、简称及行业。');if(!Number.isInteger(source.masterRevision))throw Error('缺少项目主档版本，请刷新后再编辑。');pending.current={requestId:crypto.randomUUID(),expectedRevision:source.masterRevision!,name:name.trim(),shortName:shortName.trim(),industry:industry.trim(),description:description.trim(),...custom.payload(),...(!source.companyId?companyBindingPayload(binding):{})};}
   attempted=true;const r=await api.updateProjectMaster(project.id,pending.current);if(!active.current)return;saved=r.project;setCommitted(saved);setUnknown(false);pending.current=null;await bindBusinessIntake(intake.current,saved.id);await onSaved(saved);
  }catch(e){if(active.current){setError(!attempted&&e instanceof Error?e.message:saved?'项目资料已保存，列表刷新尚未完成，请重试刷新。':masterFailure(e,custom.schema??undefined));const {status,code}=e as {status?:number;code?:string};if(status===401||status===403||code==='client_session_changed')setBlocked(true);else if(status===409&&code==='custom_schema_revision_conflict'){pending.current=null;setUnknown(false);await custom.reload();setCompanySchemaRefresh(n=>n+1);}else if(status===409){pending.current=null;setUnknown(false);setConflict(true);await readLatest();}else if(status===400||status===404){pending.current=null;setUnknown(false);}else if(attempted&&!saved)setUnknown(true);}}
  finally{working.current=false;if(active.current)setBusy(false);}
 };
 return <WorkflowDialog title="编辑项目资料" busy={busy} onClose={close}><form onChangeCapture={()=>{dirty.current=true;}} className="space-y-4" onSubmit={e=>{e.preventDefault();void save();}}><p className="text-sm text-[var(--secondary)]">此处只修改项目资料；审批阶段、负责人权限、所属基金及资金记录按各自流程办理。</p><BusinessIntakePanel formState={{binding}} onRestoreFormState={state=>{if(state.binding)setBinding(state.binding as CompanyBinding);dirty.current=true;changed();}} prepareRef={intakePrepare} customSchema={custom.schema} customValues={custom.values} onRestoreCustom={v=>{custom.setValues(v);dirty.current=true;changed();}} objectType="project" objectId={project.id} stage={project.stage} fields={{name,shortName,industry,description}} disabled={busy||unknown||Boolean(committed)||blocked} onDraft={id=>{intake.current=id;}} onApply={v=>{if(v.name!==undefined)setName(v.name);if(v.shortName!==undefined)setShortName(v.shortName);if(v.industry!==undefined)setIndustry(v.industry);if(v.description!==undefined)setDescription(v.description);dirty.current=true;changed();}}/><fieldset disabled={busy||unknown||Boolean(committed)||blocked} className="grid gap-4 sm:grid-cols-2">
  <label className="text-sm sm:col-span-2">项目名称<input required autoFocus maxLength={200} className={masterField} value={name} onChange={e=>{setName(e.target.value);changed();}}/></label>
  <label className="text-sm">项目简称<input required maxLength={100} className={masterField} value={shortName} onChange={e=>{setShortName(e.target.value);changed();}}/></label>
  <label className="text-sm">项目行业<input required maxLength={200} className={masterField} value={industry} onChange={e=>{setIndustry(e.target.value);changed();}}/></label>
  <label className="text-sm sm:col-span-2">项目说明<textarea rows={4} maxLength={20000} className={masterField} value={description} onChange={e=>{setDescription(e.target.value);changed();}}/></label>
  <div className="sm:col-span-2">{source.companyId?<p className="break-all text-sm">已绑定企业在本表单中保留，企业名称须在企业资料中维护。</p>:<CompanyBindingFields refreshKey={companySchemaRefresh} value={binding} disabled={busy||unknown||Boolean(committed)} onChange={v=>{setBinding(v);changed();}}/>}</div>
 <div className="sm:col-span-2"><CustomFieldForm state={custom} existing disabled={busy||unknown||Boolean(committed)||blocked} onChange={changed}/></div>
 </fieldset>
 {error?<p role="alert" className="text-sm">{error}<NoticeHelp message={error} projectId={project.id}/></p>:null}{unknown?<p className="text-sm">结果未确认，填写暂时锁定。重试使用同一请求，不重复创建企业或修改项目。</p>:null}
 {conflict?<section className="space-y-3 rounded-lg border border-[var(--line)] p-4"><p className="text-sm">本次输入保留，请核对最新项目主档。</p>{latest?<><dl className="grid gap-2 break-words text-sm sm:grid-cols-2">{[['项目',latest.name],['简称',latest.shortName],['行业',latest.industry],['企业关联',latest.companyId?'已关联':'未绑定'],['说明',latest.description]].map(([k,v])=><div key={k}><dt className="text-[var(--secondary)]">{k}</dt><dd className="[overflow-wrap:anywhere]">{v||'未填写'}</dd></div>)}</dl><CustomFieldDetails data={latest}/><button data-ui="secondary" type="button" className={masterButton} onClick={()=>{for(const [value,prior,next,set] of [[name,source.name,latest.name,setName],[shortName,source.shortName,latest.shortName,setShortName],[industry,source.industry,latest.industry,setIndustry],[description,source.description,latest.description,setDescription]] as const){if(value===prior)set(next);}custom.rebase(latest);setSource(latest);if(latest.companyId)setBinding(emptyCompanyBinding());setLatest(null);setConflict(false);changed();}}>已核对最新项目，保留填写并采用此版本</button></>:<button data-ui="info" type="button" className={masterButton} onClick={()=>void readLatest()}>重新读取最新项目</button>}</section>:null}
 <div className="flex flex-wrap gap-3"><button data-ui="primary" type="submit" disabled={busy||conflict||blocked||(!unknown&&!committed&&(custom.loading||!custom.schema||!!custom.error))} className={`${masterButton} bg-gold text-[#181a20]`}>{busy?'保存与刷新中…':committed?'完成页面刷新':unknown?'原样重试本次保存':'保存项目资料'}</button><button data-ui="secondary" type="button" disabled={busy} className={masterButton} onClick={close}>取消</button></div></form></WorkflowDialog>;
}
