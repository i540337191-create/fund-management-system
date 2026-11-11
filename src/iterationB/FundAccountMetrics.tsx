import type {Fund} from '../data/funds';
import {formatLpMoney} from '../lib/lpLedgerView';
import {useHideSeedDemo} from '../lib/sourceVisibility';
export function FundAccountMetrics({fund,receivable,pendingCount,localDemo=false}:{fund:Fund;receivable:string;pendingCount:number;localDemo?:boolean}){
 const hideDemo=useHideSeedDemo();
 const registered=localDemo?fund.paidIn:fund.registeredTotalsIncludeDemo===!hideDemo?formatLpMoney(fund.registeredTotals?.paidIn):'待核对';
 return <div className="fund-account-metrics"><dl>{[
  ['基金规模（主档）',fund.scale||'待登记'],
  ['已登记LP认缴（元）',localDemo?'待核对':fund.registeredTotalsIncludeDemo===!hideDemo?formatLpMoney(fund.registeredTotals?.commitment):'待核对'],
  [localDemo?'主档实缴（演示）':'已登记LP实缴（元）',registered],
  ['资金事项应收登记额',receivable],
  ['账户余额（主档待核对）',fund.balance||'待确认'],
  ['待处理资金事项',String(pendingCount)],
 ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>主档实缴：{fund.paidIn||'未录入'}；LP缴款登记与银行余额分别核对。</p></div>;
}
