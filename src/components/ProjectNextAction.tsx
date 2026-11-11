import {useEffect,useState} from 'react';
import {createApiClient} from '../lib/apiClient';
import {needsInitialChecklist,projectProgress,readProjectProgress,type ProgressSnapshot} from '../lib/dashboardProgress';
import type {ProjectTask} from '../lib/workbenchLogic';
const api=createApiClient();
export function ProjectNextAction({projectId,masterNote,tasks,currentRole,onOpenTab}:{projectId:string;masterNote?:string;tasks:ProjectTask[];currentRole?:string;onOpenTab:(tab:string,prepare?:boolean)=>void}){
 const [result,setResult]=useState<{id:string;snapshot:ProgressSnapshot}|null>(null),[reload,setReload]=useState(0);
 const allowed=currentRole!=='finance',snapshot=result?.id===projectId?result.snapshot:undefined;
 useEffect(()=>{if(!allowed)return;const controller=new AbortController();setResult(null);void readProjectProgress(api,projectId,12000,controller.signal).then(snapshot=>{if(!controller.signal.aborted)setResult({id:projectId,snapshot});}).catch(error=>{if(!controller.signal.aborted)setResult({id:projectId,snapshot:(error as {status?:number})?.status===403?{restricted:true}:{error:'流程暂未读取成功，请重试。'}});});return()=>controller.abort();},[projectId,allowed,reload]);
 const progress=projectProgress(allowed?snapshot:{restricted:true},tasks),ready=allowed&&snapshot&&!snapshot.error&&!snapshot.restricted;
 const needsChecklist=ready&&needsInitialChecklist(snapshot);
 return <section aria-label="下一步动作" className="project-next-action"><h3 className="font-semibold">当前判断</h3><p role={snapshot?.error?'alert':'status'} className="project-next-action-copy">{needsChecklist?'尚未建立资料检查清单，请先确认检查范围。':progress.nextAction}</p><div className="project-next-action-button">{ready?<button data-ui="primary" onClick={()=>onOpenTab(needsChecklist?'尽调分析':progress.actionTab,Boolean(needsChecklist))}>{needsChecklist?'确认检查范围':'前往办理'}</button>:snapshot?.error?<button data-ui="info" onClick={()=>setReload(n=>n+1)}>重新核验流程</button>:null}</div></section>;
}
