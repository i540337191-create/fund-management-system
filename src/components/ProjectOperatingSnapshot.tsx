import {useEffect,useState} from 'react';
import {createApiClient} from '../lib/apiClient';
import {latestPostRecords} from '../lib/postInvestmentView';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import {useSourceScope} from '../lib/useSourceScope';
import {navigate} from './Layout';
const api=createApiClient();
type Data=Awaited<ReturnType<typeof api.getPostInvestment>>;
export function ProjectOperatingSnapshot({projectId,revision,refreshToken=0}:{projectId:string;revision?:number;refreshToken?:number}){
 const hideDemo=useHideSeedDemo(),[retry,setRetry]=useState(0),[result,setResult]=useState<{key:string;data?:Data;error?:string}|null>(null);
 const key=JSON.stringify([projectId,revision,refreshToken,hideDemo,retry]),current=useSourceScope(key);
 useEffect(()=>{let active=true;setResult(null);api.getPostInvestment(projectId,!hideDemo).then(data=>{if(active&&current())setResult({key,data});}).catch(e=>{if(active&&current())setResult({key,error:e.status===403?'当前账号无权查阅经营数据。':'经营数据未能读取，请重试。'});});return()=>{active=false;};},[key]);
 const value=result?.key===key&&current()?result:null;
 const rows=value?.data?latestPostRecords(value.data.postInvestment.financials).sort((a,b)=>b.asOfDate.localeCompare(a.asOfDate)||b.time.localeCompare(a.time)).slice(0,5):null;
 return <section className="archive-section archive-operating-snapshot"><header><h3>经营数据</h3><button data-ui="secondary" onClick={()=>navigate(`/projects/${encodeURIComponent(projectId)}?tab=${encodeURIComponent('投后经营')}`)}>查看 / 录入经营数据</button></header><p className="archive-business-note">各投资批次分列，金额单位：人民币元。</p><table className="overview-a-table"><thead><tr><th>期间 / 投资批次</th><th>营业收入</th><th>净利润</th><th>净资产</th><th>估值</th><th>员工人数</th><th>审核状态</th><th>来源</th></tr></thead><tbody>{rows?.map(f=><tr key={f.id}><td>{f.period.value}<small>{value?.data?.closedDeals.find(d=>d.id===f.dealId)?.title||'投资批次待核对'}</small></td>{(['revenue','netProfit','netAssets','valuation','employees'] as const).map(field=><td key={field}>{f[field]===null?'未提供':f[field]}{f[field]===null&&f.missingReasons[field]?<small>{f.missingReasons[field]}</small>:null}</td>)}<td>{{draft:'草稿',pending:'待审核',approved:'已通过',returned:'已退回',rejected:'已否决'}[f.status]}</td><td><button data-ui="navigation" onClick={()=>navigate(`/projects/${encodeURIComponent(projectId)}?tab=${encodeURIComponent('投后经营')}&dealId=${encodeURIComponent(f.dealId)}`)}>查看本批次</button><small>{f.source}</small></td></tr>)}{!rows?.length?<tr><td colSpan={8}>{!value?'正在读取经营数据…':value.error?<>{value.error}<button data-ui="secondary" onClick={()=>setRetry(n=>n+1)}>重试</button></>:'尚未录入期间经营数据。'}</td></tr>:null}</tbody></table></section>;
}
