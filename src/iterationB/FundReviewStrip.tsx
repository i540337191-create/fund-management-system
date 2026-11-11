import {useEffect,useState} from 'react';
import {createApiClient,type FundCompletenessResult} from '../lib/apiClient';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import {useSourceScope} from '../lib/useSourceScope';
import {ArchiveIssueTicker} from './ArchiveIssueTicker';
const api=createApiClient();
export function FundReviewStrip({fundId,revision,onOpen}:{fundId:string;revision?:number|string;onOpen:(tab:string)=>void}){
 const hide=useHideSeedDemo(),[retry,setRetry]=useState(0),[result,setResult]=useState<{key:string;data?:FundCompletenessResult;error?:string}|null>(null);
 const key=JSON.stringify([fundId,revision,hide,retry]),current=useSourceScope(key);
 useEffect(()=>{let active=true;setResult(null);void api.checkFundCompleteness([fundId],!hide).then(data=>{if(active&&current())setResult({key,data});}).catch(()=>{if(active&&current())setResult({key,error:'基金AI核查未完成，请重新核查；当前不能判断档案完整性。'});});return()=>{active=false;};},[key]);
 const state=result?.key===key?result:null,fields=state?.data?.rows.find(row=>row.fund.id===fundId)?.fields??[];
 return <ArchiveIssueTicker label="基金重点提醒" busy={!state} onRefresh={()=>setRetry(n=>n+1)} status={!state?'正在核查当前基金档案…':state.error??'基于基金台账快照核查；AI建议待人工复核，未核验全部原件。'} items={fields.map((field,i)=>({id:`${fundId}:${i}`,label:field.label,detail:field.detail,source:field.kind==='review'?'AI建议':'台账待完善',open:()=>onOpen(field.tab)}))}/>;
}
