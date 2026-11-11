import {dashboardConcernOrder,type DashboardConcern} from '../lib/dashboardConcerns';
import {useState} from 'react';
import {ShieldCheck,ShieldAlert,Plus} from 'lucide-react';
import type {Project} from '../data/projects';
import type {Fund} from '../data/funds';
import {dataOriginLabel,dataPurposeLabel} from '../lib/dataOrigin';
import {ManualRiskEditor} from './ManualRiskWorkspace';
import {navigate} from './Layout';

export function DashboardRiskOverview({risks,projects,funds,state,onRetry,currentRole}:{risks:DashboardConcern[];projects:Project[];funds:Fund[];state:'loading'|'ready'|'error';onRetry:()=>void;currentRole?:string}){
 const [registering,setRegistering]=useState(false);
 const rows=dashboardConcernOrder(risks);
 const linked=(risk:DashboardConcern)=>projects.find(p=>p.id===risk.projectId);
 const mayRegister=['admin','investment_manager'].includes(currentRole??'');
 const count=state==='ready'?risks.length:'—';
 return <section className="dashboard-risk-overview">
  <header><div className="dashboard-risk-heading"><span className="dashboard-risk-mark" aria-hidden="true"><ShieldCheck size={27}/></span><div><strong>风险关注 <b>{count}</b></strong></div></div><div className="dashboard-risk-actions">{mayRegister?<button data-ui="primary" disabled={!projects.length} onClick={()=>setRegistering(true)}><Plus size={14}/>登记风险</button>:null}<button data-ui="secondary" onClick={()=>navigate('/monitoring')}>风险监控 →</button></div></header>
  <div className="dashboard-risk-levels">{(['高','中','低'] as const).map(level=><span key={level} data-level={level}>{level}优先级 <strong>{state==='ready'?risks.filter(r=>r.level===level).length:'—'}</strong></span>)}</div>
  {state==='error'?<p role="alert">部分关注事项读取失败。<button data-ui="info" onClick={onRetry}>重新读取</button></p>:null}
  <div className="dashboard-compact-rows" tabIndex={0} aria-label="风险事项列表">{rows.length?rows.map(r=>{const project=linked(r);const fund=funds.find(f=>f.id===(r.fundId??project?.fundId));return renderRisk(r,project?.name??r.target,fund?.name??project?.fund??'未关联基金');}):state==='loading'?<p role="status">正在读取关注事项…</p>:state==='error'?null:empty('暂无待处理关注事项')}</div>
  {registering?<ManualRiskEditor projects={projects} onClose={()=>setRegistering(false)} onSaved={async()=>{onRetry();setRegistering(false);}}/>:null}
 </section>;
 function empty(text:string){return <div className="dashboard-risk-blank"><ShieldCheck size={34} aria-hidden="true"/><strong>{text}</strong></div>;}
 function renderRisk(r:DashboardConcern,project:string,fund:string){return <article className="dashboard-compact-row" key={r.id??r.title+r.time}><span className="dashboard-risk-row-icon" data-level={r.level} aria-hidden="true"><ShieldAlert size={21}/></span><div><h3><span className="dashboard-risk-inline-level" data-level={r.level}>{r.level}优先级</span>{r.title}</h3><p>{r.projectId?`基金：${fund} → 项目：${project}`:r.fundId?`基金：${fund}`:`关注对象：${r.target}`}</p><p>{r.summary}</p><small>{[r.category,r.status||'待处理',r.source,r.dueAt&&Number.isFinite(Date.parse(r.dueAt))?'截止：'+new Date(r.dueAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):r.time,dataOriginLabel(r.dataOrigin),r.dataPurpose==='engineering_fixture'?dataPurposeLabel(r.dataPurpose):''].filter(Boolean).join(' · ')}</small></div><button data-ui="secondary" onClick={()=>navigate(r.path)}>查看 →</button></article>;}
}
