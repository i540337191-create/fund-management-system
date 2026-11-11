import {useFundOverviewCounts} from './useFundOverviewCounts';
import type {Project} from '../data/projects';
import type {ReactNode} from 'react';
import type {Fund} from '../data/funds';
import './overviewA.css';
export function FundOverviewA({fund,projects=[],metrics,ledger,fields,onOpen}:{fund:Fund;projects?:Project[];metrics:ReactNode;ledger:ReactNode;fields:ReactNode;onOpen:(tab:string)=>void}){
 const counts=useFundOverviewCounts(fund,projects);
 return <section className="iteration-b-overview" aria-label="基金概览">
  {metrics}
  <div className="fund-a-body"><div className="overview-a-panel"><header><h3>多基金投资账本</h3><button className="overview-a-text-link" type="button" onClick={()=>onOpen('投资项目')}>查看基金出资明细</button></header>{ledger}</div>
   <aside className="overview-a-panel"><h3>相关统计</h3><dl className="overview-a-related">{[['主归属项目',fund.projectCount],['已登记投资者',counts.investors??'—'],['主归属项目未处理风险',counts.risks??'—']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{counts.riskError?<button type="button" data-ui="secondary" onClick={counts.refreshRisks}>重读基金项目风险</button>:null}<p className="overview-a-note">主归属项目与联合出资项目口径分别保留，实际出资关系见投资账本。</p></aside></div>
  <div className="fund-a-bottom overview-a-panel"><div><h3>下一步操作</h3><p className="overview-a-note">{fund.nextAction||'按当前资料与业务记录核对下一步事项。'}</p></div><div className="overview-a-actions">{[['募集档案','补齐募集档案'],['投资项目','核对投资项目'],['账户资金','核对账户资金'],['费用流水','核对费用流水'],['资料档案','查看基金资料'],['投后报告','查看投后报告']].map(([tab,label])=><button type="button" data-ui="secondary" key={tab} onClick={()=>onOpen(tab)}>{label}</button>)}</div></div>
  {fields}
 </section>;
}
