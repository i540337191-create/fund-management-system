import {FundReviewStrip} from './FundReviewStrip';
import type {ReactNode} from 'react';
import {ArrowLeft,ArrowRight,ChevronRight,Pencil,Layers,FileText,BriefcaseBusiness,Wallet,ReceiptText,Folder,ShieldCheck,Landmark,History,TriangleAlert,Settings2} from 'lucide-react';
import type {Fund} from '../data/funds';
import type {Project} from '../data/projects';
import {useAgentWorkspace} from '../lib/agentWorkspaceClient';
import {isOpenWorkspaceTask,matchesTaskFund} from '../lib/taskFundScope';
import {isManagedProject} from '../lib/projectAssetHistory';
import {useFundOverviewCounts} from './useFundOverviewCounts';
import {fundDossierTabs,fundNextActionTab} from './fundDossierNavigation';
import headerArtwork from '../assets/fund-dossier/header-archive.webp';
import raisingArtwork from '../assets/fund-dossier/raising-folder.webp';
import investmentArtwork from '../assets/fund-dossier/investment-folder.webp';
import './fundDossier.css';
const tabPurpose:Record<string,string>={'募集档案':'投资者、认缴与实际到账','投资项目':'基金出资与项目办理','账户资金':'资金概况、银行账户与收付款','费用流水':'费用应收、到账核销与历史事项','投后报告':'报告编制、审核与导出','资料档案':'基金原件、版本与归属','条款监控':'基金条款与项目履约','基金事务':'备案、披露与清算办理','操作日志':'基金业务操作与历史记录'};
const icons=[Layers,FileText,BriefcaseBusiness,Wallet,ReceiptText,FileText,Folder,ShieldCheck,Landmark,History];
export function FundDossier({fund,projects,paidIn,source,tab,onOpen,onEdit,onBack,onTasks,onTemplates,fields,children}:{fund:Fund;projects:Project[];paidIn:string;source:ReactNode;tab:string;onOpen:(tab:string)=>void;onEdit?:()=>void;onBack:()=>void;onTasks:()=>void;onTemplates?:()=>void;fields:ReactNode;children:ReactNode}){
 const workspace=useAgentWorkspace(),counts=useFundOverviewCounts(fund,projects),ready=Boolean(workspace.state)&&!workspace.error;
 const pending=ready?workspace.state!.tasks.filter(task=>isOpenWorkspaceTask(task)&&matchesTaskFund(task,fund.id,projects)).length:undefined;
 const unknownPaidIn=/待登记|待核对|待确认|未核实|^—$/.test(paidIn),next=fund.nextAction?.trim();
 return <div className="fund-dossier">
  <p className="fund-dossier-page-title">基金档案</p>
  <FundReviewStrip key={fund.id} fundId={fund.id} revision={JSON.stringify([fund.revision,fund.updatedAt,fund.registeredTotals])} onOpen={onOpen}/>
  <header className="fund-dossier-header">
   <div className="fund-dossier-cover"><img className="dossier-header-art" src={headerArtwork} alt="" aria-hidden="true"/>
    <div className="dossier-titlebar"><div>{onEdit?<button data-ui="primary" type="button" onClick={onEdit}><Pencil size={16}/>编辑资料</button>:null}<button data-ui="secondary" type="button" onClick={onBack}><ArrowLeft size={16}/>返回基金账本</button></div></div>
    <h1>{fund.name}</h1><div className="dossier-metadata"><span className="dossier-stage">{fund.stage}</span>{source}<span className="dossier-manager">负责人：{fund.manager||'待指定'}</span></div>
   </div>
   <div className="dossier-finance-wrap"><dl className="dossier-finance">{[['主档规模',fund.scale||'待登记'],['已登记实缴（元）',paidIn],['主档已投',fund.invested||'待确认'],['主档余额',fund.balance||'待确认']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>主档登记金额，待核对</p></div>
  </header>
  <nav className="dossier-navigation" aria-label="基金档案业务导航">{fundDossierTabs.map((label,i)=>{const Icon=icons[i];return <button key={label} type="button" data-ui={tab===label?'primary':'secondary'} aria-current={tab===label?'page':undefined} onClick={()=>onOpen(label)}><Icon size={18}/><span>{label}</span></button>;})}</nav>
  {tab==='概览'?<section className="dossier-overview" aria-label="基金概览">
   <div className="dossier-at-a-glance" aria-label="基金关联概况">{[{label:'关联项目',value:projects.length,open:()=>onOpen('投资项目')},{label:'投资者',value:counts.investors,open:()=>onOpen('募集档案')},{label:'未完成待办',value:pending,open:onTasks},{label:'项目未处理风险',value:counts.risks,open:()=>onOpen('投资项目')}].map(item=><button type="button" data-ui="navigation" key={item.label} onClick={item.open}><span>{item.label}</span><strong>{item.value??'—'}</strong><span>查看 →</span></button>)}</div>
   <section className="dossier-introduction"><header><h2>基金简介</h2>{onEdit?<button type="button" data-ui="secondary" onClick={onEdit}>编辑基金资料</button>:null}</header><p>{fund.name}，当前处于{fund.stage}，负责人为{fund.manager||'待指定'}。基金规模登记为{fund.scale||'待登记'}。</p><dl>{[['基金简称',fund.shortName||'未登记'],['当前阶段',fund.stage],['负责人',fund.manager||'待指定'],['资料更新',fund.updatedAt||'未登记']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
   <div className="dossier-work">
    <header><h2>当前需处理</h2><span className="dossier-pending" role={workspace.error?'alert':'status'}>{workspace.error?'待办读取失败':pending===undefined?'正在读取待办…':<><strong>{pending}</strong> 项未完成待办</>}</span><button data-ui="primary" type="button" disabled={!ready} onClick={onTasks}>查看待办<ArrowRight size={17}/></button></header>
    {workspace.error?<button type="button" data-ui="secondary" onClick={()=>void workspace.refresh().catch(()=>{})}>重试读取待办</button>:null}
    <div className="dossier-action-list">
     {next?<div className="dossier-action-row"><FileText size={20}/><p>{next}</p><button data-ui="secondary" type="button" onClick={()=>onOpen(fundNextActionTab(next))}>{/报告/.test(next)?'跟进报告':'前往办理'}<ChevronRight size={15}/></button></div>:<div className="dossier-action-row"><FileText size={20}/><p>暂无下一步事项</p>{onEdit?<button data-ui="secondary" type="button" onClick={onEdit}>填写事项<ChevronRight size={15}/></button>:null}</div>}
     {unknownPaidIn?<div className="dossier-action-row"><TriangleAlert size={20}/><p>实缴信息待登记</p><button data-ui="secondary" type="button" onClick={()=>onOpen('募集档案')}>补充实缴<ChevronRight size={15}/></button></div>:null}
    </div>
    <footer><span>当前阶段：<strong>{fund.stage}</strong></span><button type="button" data-ui="secondary" onClick={()=>onOpen('基金事务')}>查看基金事务<ChevronRight size={15}/></button></footer>
   </div>
   <aside className="dossier-shortcuts"><h2>业务直达</h2>
    {[{label:'募集档案',image:raisingArtwork,count:counts.investors,unit:'位投资者',action:'进入募集档案'},{label:'投资项目',image:investmentArtwork,count:projects.filter(isManagedProject).length,unit:'个主归属项目',action:'进入投资项目'}].map(item=><button className="dossier-entry" data-ui="secondary" type="button" key={item.label} onClick={()=>onOpen(item.label)}><img src={item.image} alt="" aria-hidden="true"/><span><strong>{item.label}</strong><small><b>{item.count??'—'}</b> {item.unit}</small></span><span className="dossier-entry-action">{item.action}<ArrowRight size={15}/></span></button>)}
    {onTemplates?<button data-ui="secondary" type="button" className="dossier-template-link" onClick={onTemplates}><Settings2 size={17}/>系统设置 · 模板配置<ArrowRight size={15}/></button>:null}
   </aside>
   <div className="dossier-support"><span>主归属项目未处理风险：{counts.risks??'—'}</span>{counts.riskError?<button type="button" data-ui="secondary" onClick={counts.refreshRisks}>重读项目风险</button>:null}<button data-ui="secondary" type="button" onClick={()=>onOpen('投资项目')}>查看出资明细<ChevronRight size={15}/></button><button data-ui="secondary" type="button" onClick={()=>onOpen('资料档案')}>查看基金资料<ChevronRight size={15}/></button></div>
   <div className="dossier-custom-fields">{fields}</div>
  </section>:<section className="dossier-tab-content" aria-label={tab}><header className="dossier-business-heading"><h2>{tab}</h2><p>{tabPurpose[tab]}</p></header>{children}</section>}
 </div>;
}
