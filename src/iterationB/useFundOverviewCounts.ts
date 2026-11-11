import {useEffect,useState} from 'react';
import type {Fund} from '../data/funds';
import type {Project} from '../data/projects';
import {createApiClient} from '../lib/apiClient';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import {filterSeedDemoRecords} from '../lib/dataOriginFilter';
import {useSourceScope} from '../lib/useSourceScope';
const api=createApiClient();
export function useFundOverviewCounts(fund:Fund,projects:Project[]){
 const hideDemo=useHideSeedDemo(),ids=projects.map(p=>p.id),key=JSON.stringify([fund.id,ids,hideDemo]),current=useSourceScope(key);
 const [retry,setRetry]=useState(0),[risk,setRisk]=useState<{key:string;count?:number;error?:boolean}|null>(null);
 useEffect(()=>{let active=true;setRisk(null);if(!ids.length){setRisk({key,count:0});return;}
  void api.getRiskRecords().then(({risks})=>{if(active&&current())setRisk({key,count:filterSeedDemoRecords(risks,hideDemo).filter(r=>ids.includes(r.projectId)&&!r.deletedAt&&r.status!=='已处理').length});}).catch(()=>{if(active&&current())setRisk({key,error:true});});return()=>{active=false;};
 },[key,retry]);
 return {investors:fund.registeredTotalsIncludeDemo===!hideDemo?fund.registeredTotals?.investorCount:undefined,risks:risk?.key===key?risk.count:undefined,riskError:risk?.key===key&&risk.error,refreshRisks:()=>setRetry(n=>n+1)};
}
