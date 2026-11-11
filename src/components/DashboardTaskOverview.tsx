import {useState} from 'react';
import {ArrowRight,Plus} from 'lucide-react';
import {dashboardActions,dashboardActionTone,type DashboardAction} from '../lib/dashboardTaskPresentation';

export type DashboardTaskRow={id:string;item:string;status:string;due:string;action:DashboardAction;relation:string;scope:'项目'|'基金'|'其他';sourceUnavailable?:boolean};
export function DashboardTaskOverview({tasks,ready,error,onInspect,onManage,onCreate,onRetry}:{tasks:DashboardTaskRow[];ready:boolean;error:string;onInspect:(ids:string[])=>void;onManage:()=>void;onCreate?:()=>void;onRetry:()=>void}){
 const [action,setAction]=useState<DashboardAction|'全部'>('全部'),[scope,setScope]=useState('全部'),[query,setQuery]=useState('');
 const rows=tasks.filter(t=>(action==='全部'||t.action===action)&&(scope==='全部'||t.scope===scope)&&(!query||(t.item+' '+t.relation).toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 return <section className="dashboard-task-overview" aria-label="按处理时效查看待办">
  <header><p>未完成 <strong>{ready&&!error?tasks.length:'—'}</strong> 项</p><div>{onCreate?<button data-ui="primary" onClick={onCreate}><Plus size={14}/>新增待办</button>:null}<button data-ui="secondary" onClick={onManage}>管理全部待办 <ArrowRight size={14}/></button></div></header>
  <nav className="dashboard-action-tabs" aria-label="待办处理时效">{(['全部',...dashboardActions] as const).map(label=><button key={label} data-tone={label==='全部'?'all':dashboardActionTone[label]} aria-pressed={action===label} onClick={()=>setAction(label)}>{label}<strong>{ready&&!error?(label==='全部'?tasks.length:tasks.filter(t=>t.action===label).length):'—'}</strong></button>)}</nav>
  <div className="dashboard-list-tools"><input aria-label="搜索待办、项目或基金" placeholder="搜索事项、项目或基金" value={query} onChange={e=>setQuery(e.target.value)}/><div aria-label="待办所属对象">{['全部','基金','项目','其他'].map(label=><button key={label} aria-pressed={scope===label} onClick={()=>setScope(label)}>{label}</button>)}</div></div>
  <p className="dashboard-list-note">按处理时效、截止时间排序；同截止时间按新增倒序。业务状态单独显示。</p>
  <div className="dashboard-compact-rows" tabIndex={0} aria-label="待办列表">{error?<p role="alert">待办读取失败，当前数量未核实。<button data-ui="info" onClick={onRetry}>重新读取</button></p>:!ready?<p role="status">正在读取统一待办…</p>:rows.length?rows.map(t=><article key={t.id} className="dashboard-compact-row"><span className="dashboard-action-badge" data-tone={dashboardActionTone[t.action]}>{t.action}</span><div><h3>{t.item}</h3><p>{t.relation}</p><small>{t.sourceUnavailable?'来源待核验 · ':''}{t.status} · 截止 {t.due}</small></div><button data-ui="secondary" onClick={()=>onInspect([t.id])}>查看 <ArrowRight size={14}/></button></article>):<p role="status">当前分类暂无待办，可切换分类查看其他事项。</p>}</div>
 </section>;
}
