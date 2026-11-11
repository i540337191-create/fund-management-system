import {ProjectOperatingSnapshot} from './ProjectOperatingSnapshot';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import {filterSeedDemoRecords} from '../lib/dataOriginFilter';
import {subscribeSessionInvalidation} from '../lib/sessionBoundary';
import {useEffect,useState} from 'react';
import {createApiClient} from '../lib/apiClient';
import {archiveSources,archiveSummary,type ArchiveData} from '../lib/projectArchiveSummary';
import {projectModuleFor} from '../lib/projectModules';
import {useSourceScope} from '../lib/useSourceScope';
import {RefreshButton} from '../iterationA/RefreshButton';
const api=createApiClient();
const readers={detail:(id:string)=>api.getProject(id),diligence:async(id:string)=>(await api.getDiligence(id)).diligence,approvals:(id:string)=>api.getApprovals(id),deals:async(id:string)=>(await api.getDeals(id)).deals,post:(id:string)=>api.getPostInvestment(id),reports:async(id:string)=>(await api.getReports()).reports.filter(r=>r.projectId===id)};
export function ProjectArchiveSummary({projectId,view,revision,refreshToken,onOpen}:{projectId:string;view:string;revision?:number;refreshToken:number;onOpen:(view:string)=>void}){
 const module=projectModuleFor(view).name,hideDemo=useHideSeedDemo();
 const contentOwnsSummary=['项目概览','投资与协议','任务待办','资金事项'].includes(module);
 const [expired,setExpired]=useState(false);
 useEffect(()=>subscribeSessionInvalidation(()=>{setExpired(true);setResult(null);}),[]);
 const [retry,setRetry]=useState(0),[result,setResult]=useState<{key:string;data:ArchiveData;issues:string[]}|null>(null);
 const key=JSON.stringify([projectId,module,revision,refreshToken,retry,hideDemo]),current=useSourceScope(key);
 useEffect(()=>{setResult(null);if(contentOwnsSummary||expired)return;let active=true;const timer=setTimeout(()=>{if(active&&current()){active=false;setResult({key,data:{},issues:['记录读取超时']});}},20000);const sources=archiveSources[module];void Promise.allSettled(sources.map(source=>{
 if(source==='deals')return readers.deals(projectId).then(rows=>filterSeedDemoRecords(rows,hideDemo));
 if(source==='post')return api.getPostInvestment(projectId,!hideDemo);
 if(source==='reports')return readers.reports(projectId).then(rows=>rows.filter(r=>!hideDemo||!['seed_demo','engineering_test'].includes(r.dataOrigin??'')&&!['simulation','engineering_test'].includes(r.dataPurpose??'')));
 if(source==='detail')return readers.detail(projectId).then(detail=>hideDemo?{...detail,tasks:filterSeedDemoRecords(detail.tasks,hideDemo),materials:detail.materials.filter(r=>!['seed_demo','engineering_test'].includes(r.dataOrigin??'')&&!['simulation','engineering_test'].includes(r.dataPurpose??''))}:detail);
 return readers[source](projectId);
})).then(results=>{if(!active||!current())return;clearTimeout(timer);const data=Object.fromEntries(results.flatMap((r,i)=>r.status==='fulfilled'?[[sources[i],r.value]]:[])) as ArchiveData;const issues=results.flatMap((r,i)=>r.status==='rejected'?[`${({detail:'项目记录',diligence:'尽调档案',approvals:'审批记录',deals:'交易档案',post:'投后档案',reports:'报告记录'})[sources[i]]}${(r.reason as {status?:number})?.status===403?'无权查阅':'读取失败'}`]:[]);setResult({key,data,issues});});return()=>{active=false;clearTimeout(timer);};},[key,expired]);
 if(contentOwnsSummary)return null;
 const data=result?.key===key?result:null,summary=archiveSummary(module,data?.data??{});
 const open=(target:string)=>{if(target!==view){onOpen(target);return;}const node=document.querySelector<HTMLElement>('.project-module-content');node?.scrollIntoView({block:'start',behavior:'smooth'});node?.querySelector<HTMLElement>('button[data-ui=primary],button,select')?.focus({preventScroll:true});};
 return <section className={`archive-module-summary ${['任务待办','资金事项','投资与协议'].includes(module)?'archive-module-summary-brief':''}`} aria-label={`${module}当前结论`} aria-busy={!data&&!expired}>
  {module==='投后管理'&&view==='投后经营'?<ProjectOperatingSnapshot projectId={projectId} revision={revision} refreshToken={refreshToken}/>:null}
  <div className="archive-module-conclusion"><div><h2>{({'项目概览':'项目概览','尽调与决策':'尽调结论与审批','投资与协议':'投资与协议','投后管理':'经营、走访与期间资料','风险与履约':'风险事项与协议履约','项目文档':'项目资料与报告','任务待办':'待办事项','资金事项':'费用与收款'})[module]}</h2><p role={data?.issues.length?'alert':'status'}>{expired?'登录身份已变化，请重新打开项目。':!data?'正在核对本环节的办理记录…':data.issues.length?`${data.issues.join('；')}。当前结论待核对，可重新读取。`:summary.conclusion}</p></div><RefreshButton aria-label={`重新读取${module}状态`} disabled={!data||expired} onClick={()=>setRetry(n=>n+1)}/></div>
  {!['任务待办','资金事项','投资与协议'].includes(module)?<nav className="archive-process-nodes" data-sequential={module==='尽调与决策'} aria-label={`${module}办理进度`}>{summary.steps.map((step,index)=>module==='投资与协议'?<div className="archive-process-fact" key={step.label}><span>{step.label}</span><strong>{expired?'待核对':data?step.value:'读取中'}</strong></div>:<button key={step.label} type="button" data-target-view={step.view} aria-current={step.view===view?'step':undefined} onClick={()=>open(step.view)}><small>{String(index+1).padStart(2,'0')}</small><span>{step.label}</span><strong>{expired?'待核对':data?step.value:'读取中'}</strong></button>)}</nav>:null}
 </section>;
}
