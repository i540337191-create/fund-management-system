import {useEffect,useState} from 'react';
import {RefreshButton} from '../iterationA/RefreshButton';
import {createApiClient} from '../lib/apiClient';
import {useSourceScope} from '../lib/useSourceScope';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import {subscribeSessionInvalidation} from '../lib/sessionBoundary';
import {registeredPayments,registeredReceipts} from './capitalAmounts';
import './capital.css';

const api=createApiClient();
type Amount={amount:string|null;reason:string};
type Result={scope:string;outgoing:Amount|null;incoming:Amount|null;outgoingError:boolean;incomingError:boolean};
export function CapitalOverview({fundId,projectId,fundCount,pendingCount,revision=0,onOpenItems}:{fundId?:string;projectId?:string;fundCount:number;pendingCount:number;revision?:number;onOpenItems:()=>void}){
 const hide=useHideSeedDemo(),scope=JSON.stringify([fundId,projectId,hide,revision]),current=useSourceScope(scope);
 const [result,setResult]=useState<Result|null>(null),[retry,setRetry]=useState(0),[expired,setExpired]=useState(false);
 useEffect(()=>subscribeSessionInvalidation(()=>{setExpired(true);setResult(null);}),[]);
 useEffect(()=>{
  if(expired)return;
  let active=true;
  const filters={fundId,projectId,...hide?{includeDemo:'false' as const}:{}};
  setResult({scope,outgoing:null,incoming:null,outgoingError:false,incomingError:false});
  const apply=(values:Partial<Result>)=>{if(active&&current())setResult(previous=>previous?.scope===scope?{...previous,...values}:previous);};
  void api.getInvestmentCashflowLedger(filters).then(ledger=>apply({outgoing:registeredPayments(ledger.rows,true)})).catch(()=>apply({outgoingError:true}));
  void api.getExitSettlementLedger(filters).then(ledger=>apply({incoming:registeredReceipts(ledger.payments,true)})).catch(()=>apply({incomingError:true}));
  return()=>{active=false;};
 },[scope,retry,expired]);
 const data=result?.scope===scope?result:null;
 const cards=[
  {label:projectId?'当前范围':'覆盖基金',value:expired?'—':projectId?'项目关联':String(fundCount),hint:projectId?'实际收付依所选项目筛选':'当前可见范围'},
  {label:'退出登记实收 · CNY',value:expired?'—':data?.incoming?.amount??'—',hint:expired?'登录身份已变化，请重新打开本页':data?.incomingError?'回款读取失败':data?.incoming?.reason??'正在读取回款登记…'},
  {label:'登记实付 · CNY',value:expired?'—':data?.outgoing?.amount??'—',hint:expired?'登录身份已变化，请重新打开本页':data?.outgoingError?'付款读取失败':data?.outgoing?.reason??'正在读取付款登记…'},
  {label:'待处理资金事项',value:expired?'—':String(pendingCount),hint:'资金事项中尚未收齐的记录'},
 ];
 return <section aria-label="资金与费用关键总览" className="capital-key-overview">
  <div className="capital-key-metrics">{cards.map((card,index)=><div className="capital-key-metric" key={card.label}><p>{card.label}</p><strong>{card.value}</strong><small>{card.hint}</small>{index===3?<button type="button" data-ui="secondary" onClick={onOpenItems}>核对资金事项</button>:null}</div>)}</div>
  <div className="capital-key-feedback" role={data?.incomingError||data?.outgoingError?'alert':'status'}>
   <span>登记金额按有效人民币凭证汇总，排除纠错冲销；不代表银行实时余额、完整基金收付或管理费应收。</span>
   {!expired?<RefreshButton data-ui="info" disabled={!data||!data.incoming&&!data.incomingError||!data.outgoing&&!data.outgoingError} aria-label={data?.incomingError||data?.outgoingError?'重试读取资金汇总':'刷新资金汇总'} title="刷新资金汇总" onClick={()=>setRetry(value=>value+1)}/>:null}
  </div>
 </section>;
}
