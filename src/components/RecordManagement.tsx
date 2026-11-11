import {createContext,useContext,useState,useRef,type ReactNode} from 'react';
import {createApiClient} from '../lib/apiClient';
import {WorkflowDialog} from './MaterialFileDialogs';
type Kind='company'|'project'|'fund'|'material'|'report'|'capital'|'intake'|'investor';
const api=createApiClient();
const Context=createContext<{role:string;onChanged:()=>Promise<void>}>({role:'viewer',onChanged:async()=>{}});
export function RecordManagementProvider({role,onChanged,children}:{role:string;onChanged:()=>Promise<void>;children:ReactNode}){return <Context.Provider value={{role,onChanged}}>{children}</Context.Provider>;}
export const useRecordManagement=()=>useContext(Context);
function allowed(kind:Kind,role:string){return role==='admin'||({company:['investment_manager'],project:['investment_manager'],fund:['investment_manager'],material:['post_investment'],report:['investment_manager'],capital:['finance'],intake:['post_investment'],investor:['investment_manager']}[kind].includes(role));}
const labels={company:'企业',project:'项目',fund:'基金',material:'资料',report:'报告',capital:'资金事项',intake:'AI收件',investor:'投资者草稿'};
const failure=(e:unknown)=>(e as {code?:string}).code==='investor_has_business_records'?'此 LP 已有签署、认缴、到账或有效缴款计划，不能按误建草稿删除；请在对应业务中更正并保留历史。':(e as {status?:number}).status===409?'记录或删除状态已经变化，请关闭窗口、刷新列表后重新核对。':(e as {status?:number}).status===403?'当前账号没有此项操作权限。':'操作结果暂未确认，请保留窗口重试；同一次请求不会重复操作。';
export function DeleteRecordButton({kind,id,title,onChanged}:{kind:Kind;id?:string;title:string;onChanged?:()=>Promise<void>}){
 const ctx=useContext(Context),[open,setOpen]=useState(false),[version,setVersion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const operation=useRef(''),committed=useRef(false);
 const irreversible=kind==='project'||kind==='company';
 if(!id||!allowed(kind,ctx.role))return null;
 const close=()=>{if(!busy)setOpen(false);};
 return <><button type="button" data-ui="danger" aria-label={`删除${labels[kind]}：${title}`} onClick={()=>{operation.current=crypto.randomUUID();committed.current=false;setVersion('');setError('');setOpen(true);setBusy(true);void api.getDeletedRecords(kind).then(r=>setVersion(r.versions[id]??'')).catch(e=>setError(failure(e))).finally(()=>setBusy(false));}}>删除</button>{open?<WorkflowDialog title={`删除${labels[kind]}`} busy={busy} onClose={close}><div className="space-y-4"><p>确认{irreversible?'删除':'将'}“{title}”{irreversible?'？':'从当前列表移除？'}</p>{irreversible?<p className="text-sm leading-6"><strong className="font-bold text-red-700">删除后不可通过系统恢复。</strong><strong className="font-bold text-red-700">原件、关联业务、操作历史</strong>继续留存，不级联清除或物理擦除；已经发生的付款、归档和任务不会撤销。</p>:<p className="text-sm text-[var(--secondary)]">原件、关联业务和操作历史会保留；此操作不会撤销已经发生的付款、归档或生成的任务。</p>}{error?<p role="alert">{error}</p>:null}<div className="flex flex-wrap gap-3"><button type="button" data-ui="danger" disabled={busy||!version} onClick={()=>{setBusy(true);setError('');void(async()=>{try{if(!committed.current){await api.changeRecordVisibility(kind,id,true,{requestId:operation.current,expectedVersion:version});committed.current=true;}await(onChanged??ctx.onChanged)();setOpen(false);}catch(e){setError(committed.current?'删除已保存，但列表刷新未完成。重试只会重新读取，不会重复删除。':failure(e));}finally{setBusy(false);}})();}}>{busy?'处理中…':committed.current?'重新读取结果':'确认删除'}</button><button data-ui="secondary" type="button" disabled={busy} onClick={close}>取消</button></div></div></WorkflowDialog>:null}</>;
}
// Recently-deleted entry points were removed at the user’s request; stored history is untouched.
export function DeletedRecordsButton(_props:{kind:Kind;onChanged?:()=>Promise<void>;fundId?:string}){return null;}
