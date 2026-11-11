import {useEffect,useState} from 'react';
import {createApiClient} from '../lib/apiClient';
import type {FundOperations} from '../lib/fundOperationsTypes';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import {useSourceScope} from '../lib/useSourceScope';
import {FundFeeOverview} from '../components/FundFeeOverview';
import {RefreshButton} from '../iterationA/RefreshButton';
const api=createApiClient();
export function FundFeeRegister({fundId}:{fundId:string}){
 const hide=useHideSeedDemo(),[retry,setRetry]=useState(0),[state,setState]=useState<{key:string;data?:FundOperations;error?:string}|null>(null),key=JSON.stringify([fundId,hide,retry]),current=useSourceScope(key);
 useEffect(()=>{let active=true;setState(null);void api.getFundOperations(!hide).then(data=>{if(active&&current())setState({key,data});}).catch(()=>{if(active&&current())setState({key,error:'费用流水读取失败，请重试。'});});return()=>{active=false;};},[key]);
 const result=state?.key===key?state:null;
 return <section aria-label="基金费用明细"><header className="dossier-business-actions"><h3>费用明细</h3><RefreshButton aria-label="刷新费用明细" disabled={!result} onClick={()=>setRetry(n=>n+1)}/></header>{!result?<p role="status">正在读取费用明细…</p>:result.error?<p role="alert">{result.error}</p>:result.data?.funds.some(f=>f.fundId===fundId)?<FundFeeOverview data={result.data} fundId={fundId} query=""/>:<p role="status">当前基金费用记录不可见，请核对权限与基金归属。</p>}</section>;
}
