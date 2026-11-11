import {useEffect,useState} from 'react';
import {createApiClient} from './apiClient';
const api=createApiClient();
export function useProjectEvidence(projectId:string,enabled:boolean,revision?:number){
 const [data,setData]=useState<Awaited<ReturnType<typeof api.getProject>>|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(enabled),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!enabled)return;let active=true;setLoading(true);setError('');setData(null);api.getProject(projectId).then(result=>{if(active)setData(result);}).catch(()=>{if(active)setError('项目关联记录读取失败，请重试核对。');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[projectId,enabled,revision,retry]);
 return {data:data?.project.id===projectId?data:null,error,loading,retry:()=>setRetry(v=>v+1)};
}
