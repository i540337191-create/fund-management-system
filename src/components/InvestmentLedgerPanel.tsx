import {projectInvestmentHeadline} from '../lib/projectInvestmentHeadline';
import {RefreshButton} from '../iterationA/RefreshButton';
import {NoticeHelp} from './NoticeHelp';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import {isEngineeringRecord,dataOriginLabel} from '../lib/dataOrigin';
import {useEffect,useState,type ReactNode} from 'react';
import {createApiClient} from '../lib/apiClient';
import {ledgerAmount,ledgerCashLabels,ledgerIssueLabels,type InvestmentLedger,type InvestmentLedgerScope} from '../lib/investmentLedgerTypes';
import {registeredContribution,money} from '../iterationB/capitalPortfolioModel';
import {scopeInvestmentLedger} from '../iterationB/investmentLedgerScope';
const api=createApiClient();
const button='min-h-10 rounded-md border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--hover)] disabled:opacity-50';
const amounts=[['plannedContribution','当前计划出资'],['closedContribution','已确认交割出资'],['investmentPrincipal','有效实付本金'],['investmentFees','有效实付费用'],['investmentTaxes','有效实付税款'],['exitConsideration','退出执行对价'],['exitReceipts','有效实际回款'],['returnedPrincipal','登记返还本金'],['registeredIncome','登记回款收益']] as const;
const status=(value:string)=>({posted:'有效登记',reversed:'已冲销',withdrawn:'已撤回',completed:'已完成',partial:'部分退出',exited:'已退出',holding:'持有中',active:'进行中',closed:'已交割'}[value]??value);
const kind=(value:string)=>({investment_payment:'本金',project_fee:'费用',project_tax:'税款'}[value]??value);
const projectHref=(projectId:string,dealId:string)=>`/projects/${encodeURIComponent(projectId)}?tab=${encodeURIComponent('投资信息')}&dealId=${encodeURIComponent(dealId)}`;

// Same read-only view in each scope; a failed refresh must not leave old totals on screen.
export function InvestmentLedgerPanel({scope,summaryOnly=false,refreshToken=0,embedded=false,fundId,projectId,primaryProjectCount,headline=false,headlineActions}:{headlineActions?:ReactNode;headline?:boolean;scope:InvestmentLedgerScope;summaryOnly?:boolean;refreshToken?:number;embedded?:boolean;fundId?:string;projectId?:string;primaryProjectCount?:number}){
 const hideDemo=useHideSeedDemo();
 const key=JSON.stringify({scope,includeDemo:!hideDemo}),[version,setVersion]=useState(0),[result,setResult]=useState<{key:string;ledger?:InvestmentLedger;error?:string}|null>(null);
 useEffect(()=>{
  let active=true;setResult(null);
  api.getInvestmentLedger(JSON.parse(key).scope,JSON.parse(key).includeDemo).then(ledger=>{if(active)setResult({key,ledger});}).catch(e=>{if(active)setResult({key,error:e.status===403?'当前账号无权读取投资账本。':e.status===401?'登录已失效，请重新登录。':'投资账本未能读取，请重试；本次不显示旧合计。'});});
  return()=>{active=false;};
 },[key,version,refreshToken]);
 const current=result?.key===key?result:null,ledger=current?.ledger?scopeInvestmentLedger(current.ledger,{fundId,projectId},primaryProjectCount):undefined;
 if(headline){
  const amounts=ledger?projectInvestmentHeadline(ledger):null;
  return <section className="archive-investment-headline" aria-label="项目投资金额"><header><h3>投资金额</h3><div className="archive-investment-headline-actions"><span>人民币元</span>{headlineActions}</div></header>{!current?<p role="status">正在读取投资金额…</p>:current.error?<p role="alert">{current.error}<button data-ui="secondary" onClick={()=>setVersion(n=>n+1)}>重试</button></p>:ledger&&amounts?<><dl className="archive-business-facts">{([['投资出资总额',amounts.total],['已实付本金',amounts.paid],['待付差额',amounts.remaining],['已确认交割',amounts.closed]] as const).map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{money(value as bigint|null)}</dd></div>)}</dl><p className={!ledger.rows.length||ledger.issues.length||amounts.remaining===null?'archive-business-note form-guidance':'archive-business-note'}>{!ledger.rows.length?'尚无投资出资记录，请先核对交易档案。':ledger.issues.length||amounts.remaining===null?'出资或付款记录待核对，待付差额暂不计算。':'待付差额按已登记出资总额减已登记实付本金计算；未登记付款仍须核实。'}{ledger.rows.length&&!hideDemo?' 当前含模拟或未核实来源，请核对后使用。':''}</p></>:null}</section>;
 }
 const amountSummary=ledger?<dl className="grid gap-x-6 gap-y-4 border-y border-[var(--line)] py-4 sm:grid-cols-3">{amounts.map(([field,label])=><div key={field}><dt className="text-xs text-[var(--secondary)]">{hideDemo?label:label.replace('有效实际','登记').replace('有效','登记')}</dt><dd className="mt-1 break-all font-semibold tabular-nums">{ledger.rows.length?(field==='plannedContribution'?money(registeredContribution(ledger.rows,'current_plan')):field==='closedContribution'?money(registeredContribution(ledger.rows,'approved_closing')):ledgerAmount(ledger.totals[field])):'—'}</dd></div>)}</dl>:null;
 return <section aria-label="多基金投资账本" className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><div>{!embedded?<h3 className="text-lg font-semibold">多基金投资账本</h3>:null}<p className="mt-1 text-sm text-[var(--secondary)]">计划、交割、实付与回款分别核对 · 金额单位：人民币元</p></div><RefreshButton data-ui="info" className={button} disabled={!current} onClick={()=>setVersion(n=>n+1)}>刷新投资账本</RefreshButton></div>
  {!current?<p role="status">正在读取同一时点的投资账本…</p>:current.error?<p role="alert">{current.error}<NoticeHelp message={current.error}/></p>:ledger?<>
   {ledger.sourceCounts?<p className="text-xs text-[var(--secondary)]">{hideDemo?'已隐藏模拟与测试记录':'当前显示全部来源'} · 模拟 {ledger.sourceCounts.excludedDemo} 条 / 工程测试 {ledger.sourceCounts.excludedEngineering??0} 条已排除 · 来源未核实 {ledger.sourceCounts.unknown} 条{hideDemo?'，未核实金额不计入有效小计。':'，含未核实金额时须核对来源。'}</p>:null}
   <p className="text-sm text-[var(--secondary)]">关联企业 {ledger.counts.companies} 家 · 项目 {ledger.counts.projects} 个 · 交易批次 {ledger.counts.batches} 笔（已交割 {ledger.counts.closedBatches} 笔）· 基金出资关系 {ledger.counts.allocations} 条{ledger.counts.unboundProjects?` · ${ledger.counts.unboundProjects} 个项目尚未绑定企业`:''}</p>
   {fundId&&projectId?<p className="text-xs text-[var(--secondary)]">当前按基金与项目交集核对，汇总与下方明细使用同一范围。</p>:null}
   {scope.type==='fund'?<p className="text-xs text-[var(--secondary)]">主归属项目 {ledger.counts.primaryFundProjects} 个，单独按项目主档统计；与上方实际出资关系口径不同。</p>:null}
   {embedded?<details><summary className="cursor-pointer text-sm">金额分项汇总</summary>{amountSummary}</details>:amountSummary}
   <p className="text-xs leading-5 text-[var(--secondary)]">{hideDemo?'小计仅包含来源可确认的有效人民币登记；':'当前显示全部来源的人民币登记，可能包含模拟或未核实记录，不能作为已核实资金结论；'}未登记不代表实际金额为零。冲销、撤回与币种未核实记录不计入有效小计。计划和交割金额不相加，登记回款收益不代表已批准投资收益或 IRR。</p>
   {ledger.issues.length?<details className="rounded-lg border border-[var(--line)] p-3"><summary className="cursor-pointer text-sm">有 {ledger.issues.length} 项数据待核对，当前合计可能不完整</summary><ul className="mt-2 space-y-2 text-xs">{ledger.issues.map((issue,i)=><li className="break-all" key={i}>{ledgerIssueLabels[issue.code]??'记录待核对'}{issue.projectId?' · '+(ledger.rows.find(r=>r.projectId===issue.projectId)?.projectName??'关联项目'):''}{issue.dealId?' · '+(ledger.rows.find(r=>r.dealId===issue.dealId)?.dealTitle??'投资批次'):''}{issue.fundId?' · '+(ledger.rows.find(r=>r.fundId===issue.fundId)?.fundName??'关联基金'):''}</li>)}</ul></details>:null}
   {!ledger.rows.length?<p className="text-sm text-[var(--secondary)]">暂无可确认的基金出资关系。项目主归属和旧档文本金额不会自动生成交易记录。</p>:!summaryOnly?<div role="region" aria-label="投资账本明细，可横向滚动" tabIndex={0} className="overflow-x-auto rounded-lg border border-[var(--line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[var(--inset)] text-xs text-[var(--secondary)]"><tr>{['企业 / 项目 / 基金','交易依据','计划 / 交割','实付本金','费用 / 税款','退出与回款'].map(h=><th scope="col" key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{ledger.rows.map(row=><tr key={`${row.projectId}/${row.dealId}/${row.fundId}`} className="border-t border-[var(--line)] align-top">
    <td className="max-w-60 space-y-1 px-4 py-4"><p className="font-medium">{row.companyName??'企业尚未绑定'}</p><a className="block text-gold underline" href={projectHref(row.projectId,row.dealId)}>{row.projectName}</a><p>{row.fundName??'基金名称待核对'}</p></td>
    <td className="max-w-56 space-y-1 px-4 py-4"><a className="text-gold underline" href={projectHref(row.projectId,row.dealId)}>{row.dealTitle}</a><p className="text-xs text-[var(--secondary)]">项目：{dataOriginLabel(row.sourceOrigins?.project.dataOrigin)}{isEngineeringRecord(row.sourceOrigins?.project??{})?' / 工程测试':''} · 批次：{dataOriginLabel(row.sourceOrigins?.batch.dataOrigin)}{isEngineeringRecord(row.sourceOrigins?.batch??{})?' / 工程测试':''} · 要素：{dataOriginLabel(row.sourceOrigins?.terms.dataOrigin)}{isEngineeringRecord(row.sourceOrigins?.terms??{})?' / 工程测试':''}</p><p>{row.basis==='approved_closing'?'批准交割依据':'当前出资计划'} · V{row.termsVersion}</p><p className="text-xs text-[var(--secondary)]">{status(row.dealStatus)} · 要素 {({draft:'草稿',pending:'待审',approved:'已批准',returned:'退回',rejected:'否决'}[row.termsStatus]??row.termsStatus)}</p></td>
    <td className="space-y-1 px-4 py-4 tabular-nums"><p>计划 {ledgerAmount(row.plannedContribution)}</p><p>交割 {ledgerAmount(row.closedContribution)}</p></td>
    <td className="space-y-1 px-4 py-4"><p className="font-medium tabular-nums">{ledgerAmount(row.investmentPrincipal)}</p><p className="text-xs text-[var(--secondary)]">{ledgerCashLabels[row.cashStatus]}</p><details className="text-xs"><summary className="cursor-pointer">付款记录 {row.investmentCashflows.length} 条</summary><ul className="mt-2 space-y-2">{row.investmentCashflows.map(c=><li className="break-all" key={c.id}>{c.date} · {kind(c.kind)} · {c.amount} {c.currency??'币种未核实'} · {status(c.status)} · {dataOriginLabel(c.dataOrigin)}{isEngineeringRecord(c)?' / 工程测试':''}<br/></li>)}</ul></details></td>
    <td className="space-y-1 px-4 py-4 tabular-nums"><p>费 {ledgerAmount(row.investmentFees)}</p><p>税 {ledgerAmount(row.investmentTaxes)}</p></td>
    <td className="space-y-1 px-4 py-4 tabular-nums"><p>对价 {ledgerAmount(row.exitConsideration)}</p><p>实收 {ledgerAmount(row.exitReceipts)}</p><p className="text-xs text-[var(--secondary)]">本金 {ledgerAmount(row.returnedPrincipal)}<br/>登记收益 {ledgerAmount(row.registeredIncome)}</p><details className="text-xs"><summary className="cursor-pointer">退出 {row.exitExecutions.length} / 回款 {row.exitPayments.length} 条</summary><ul className="mt-2 space-y-2">{row.exitExecutions.map(x=><li className="break-all" key={x.id}>执行 {x.date} · {x.consideration} 元 · {status(x.status)} · {dataOriginLabel(x.dataOrigin)}{isEngineeringRecord(x)?' / 工程测试':''}<br/></li>)}{row.exitPayments.map(x=><li className="break-all" key={x.id}>收款 {x.date} · {x.amount} {x.currency??'币种未核实'} · {status(x.status)} · {dataOriginLabel(x.dataOrigin)}{isEngineeringRecord(x)?' / 工程测试':''}<br/>本金 {x.principal} / 登记收益 {x.income}<br/></li>)}</ul></details></td>
   </tr>)}</tbody></table></div>:null}
   <p className="break-all text-xs text-[var(--secondary)]">本次读取时点：{ledger.capturedAt}</p>
  </>:null}
 </section>;
}
