import {ArchiveIssueTicker} from './ArchiveIssueTicker';
import {fetchInSession} from '../lib/sessionBoundary';
import {useEffect,useState} from 'react';
import {createApiClient} from '../lib/apiClient';
import {useSourceScope} from '../lib/useSourceScope';
import {subscribeSessionInvalidation} from '../lib/sessionBoundary';
import {navigate} from '../components/Layout';
import {overviewRequirements,overviewApprovalBlocks} from './projectOverviewModel';
const api=createApiClient();
type Reminder={id:string;label:string;tab:string;taskId?:string;roundId?:string;materialId?:string};
export function ProjectReviewStrip({projectId,revision,refreshToken=0}:{projectId:string;revision?:number;refreshToken?:number}){
 const [ai,setAi]=useState<{key:string;rows:(Reminder&{detail?:string})[];status:string}|null>(null);
 const [retry,setRetry]=useState(0),[expired,setExpired]=useState(false),[result,setResult]=useState<{key:string;rows:Reminder[];failed:boolean}|null>(null);
 const key=JSON.stringify([projectId,revision,retry,refreshToken]),current=useSourceScope(key);
 useEffect(()=>subscribeSessionInvalidation(()=>{setExpired(true);setResult(null);}),[]);
 useEffect(()=>{if(expired)return;let active=true;setResult(null);
  void Promise.allSettled([api.getDiligence(projectId),api.getApprovals(projectId)]).then(([diligence,approvals])=>{
   if(!active||!current())return;const rows:Reminder[]=[];
   if(diligence.status==='fulfilled'){
    if(!diligence.value.diligence?.items.some(item=>item.requirements.length))rows.push({id:'checklist',label:'尚未建立资料检查清单，请先声明本项目的检查要求。',tab:'尽调分析'});
    else for(const item of overviewRequirements(diligence.value.diligence)){if(item.missing||item.unreadable)rows.push({id:item.id,label:`${item.title}：待补原件 ${item.missing} 项，待读取 ${item.unreadable} 项。`,tab:'尽调分析',taskId:item.taskId});}
   }else rows.push({id:'diligence-error',label:'资料清单未能读取，尚不能判断完整性。',tab:'尽调分析'});
   if(approvals.status==='fulfilled')for(const round of overviewApprovalBlocks(approvals.value))rows.push({id:round.id,label:`${round.meetingType}：${round.status==='returned'?'已退回，需处理意见':'已否决，需核对决策'}。`,tab:'三会审批',roundId:round.id});
   else rows.push({id:'approval-error',label:'审批记录未能读取，尚不能判断阻塞。',tab:'三会审批'});
   setResult({key,rows,failed:diligence.status==='rejected'||approvals.status==='rejected'});
  });return()=>{active=false;};
 },[key,expired]);
 useEffect(()=>{if(expired)return;let active=true;const controller=new AbortController();setAi(null);
 void(async()=>{try{
  const materials=(await api.getMaterials()).materials.filter(m=>m.projectId===projectId||m.relationships?.projects.some(p=>p.id===projectId));
  const rows:(Reminder&{detail?:string})[]=[];let checked=0;
  for(let i=0;i<materials.length;i+=5){const response=await fetchInSession(fetch,'/api/ai/material-completeness',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({materialIds:materials.slice(i,i+5).map(m=>m.id)})});if(!response.ok)throw Error('AI核查未完成');const data=await response.json();if(!active||!current())return;checked+=data.checked.length;
   for(const f of data.findings)rows.push({id:'ai:'+f.materialId+':'+rows.length,label:f.name+'：'+f.message,detail:`依据：第${f.page}页「${f.quote}」`,tab:'资料文件',materialId:f.materialId} as Reminder&{detail:string});
   for(const f of data.unread)rows.push({id:'unread:'+f.materialId,label:f.name+'：'+f.reason,tab:'资料文件',materialId:f.materialId} as Reminder);
   setAi({key,rows:[...rows],status:'正在核查项目原件；AI建议待人工复核。'});
  }
  if(active&&current())setAi({key,rows,status:materials.length?`已核查 ${checked} 份原件正文；AI建议待人工复核。`:'当前项目没有可供AI核查的关联原件。'});
 }catch{if(active&&current())setAi(old=>({key,rows:old?.key===key?old.rows:[],status:'项目原件AI核查未完成，请重试；业务清单提醒仍保留。'}));}})();return()=>{active=false;controller.abort();};
 },[key,expired]);
 const data=result?.key===key?result:null;
 const open=(row:Reminder)=>navigate(`/projects/${encodeURIComponent(projectId)}?tab=${encodeURIComponent(row.tab)}${row.taskId?'&taskId='+encodeURIComponent(row.taskId):''}${row.roundId?'&roundId='+encodeURIComponent(row.roundId):''}${row.materialId?'&materialId='+encodeURIComponent(row.materialId):''}`);
 const aiState=ai?.key===key?ai:null;
 return <ArchiveIssueTicker label="项目重点提醒" busy={!data} onRefresh={()=>setRetry(n=>n+1)} status={expired?'登录身份已变化，请重新打开本项目。':!data?'正在读取资料清单与审批状态…':aiState?.status??'正在核查项目原件；业务提醒先行显示。'} items={expired?[]:[...(data?.rows??[]).map(row=>({id:row.id,label:row.label,source:'业务核查',open:()=>open(row)})),...(aiState?.rows??[]).map(row=>({id:row.id,label:row.label,detail:row.detail,source:row.id.startsWith('ai:')?'AI建议':'原件待核查',open:()=>open(row)}))]}/>;
}
