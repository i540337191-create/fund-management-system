import {materialCitationLocation} from '../lib/materialCitationLocation.ts';
import {useEffect,useRef,useState} from 'react';
import {FileSearch,ChevronLeft,ChevronRight,Pause,Play} from 'lucide-react';
import {fetchInSession} from '../lib/sessionBoundary';
import type {ApiMaterialRecord} from '../lib/materialFilters';
import './material-review-ticker.css';
type Item={materialId:string;name:string;message:string;page?:number;quote?:string;kind:'suggestion'|'unread'|'failed'};
type Result={checkedAt:string;findings:Omit<Item,'kind'>[];checked:{materialId:string;versionId:string}[];unread:{materialId:string;name:string;reason:string}[]};
type State={key:string;status:'loading'|'ready'|'error';items:Item[];checked:number;done:number;error?:string};
export function MaterialReviewTicker({materials,unreviewed=[],onOpen}:{materials:ApiMaterialRecord[];unreviewed?:{materialId:string;name:string}[];onOpen:(id:string)=>void}){
 const forceCheck=useRef(false);
 const signature=JSON.stringify([materials.map(m=>[m.id,m.currentVersionId,m.name,m.projectId,m.fundId,m.type,m.dataOrigin,m.dataPurpose,m.relationships]),unreviewed]);
 const [state,setState]=useState<State|null>(null),[retry,setRetry]=useState(0),[index,setIndex]=useState(0),[paused,setPaused]=useState(false),[interacting,setInteracting]=useState(false),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 useEffect(()=>{
  const [rows,legacy]=JSON.parse(signature) as [string[][],{materialId:string;name:string}[]],ids=rows.map(m=>m[0]);let active=true;const controller=new AbortController();
  const refresh=forceCheck.current;forceCheck.current=false;let hadFailure=false,pendingExtraction=false,pollTimer=0;
  const next:State={key:signature,status:ids.length?'loading':'ready',items:legacy.map(m=>({...m,message:'尚无当前版本的AI核查结果，请核对原件。',kind:'unread'})),checked:0,done:0};setState({...next});setIndex(0);
  void(async()=>{
   try{
    for(let start=0;start<ids.length;start+=5){
     const response=await fetchInSession(fetch,'/api/ai/material-completeness',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({materialIds:ids.slice(start,start+5),refresh})});
     const result=await response.json().catch(()=>{throw Error('核查响应中断，请重试；已完成部分保留。');});if(!active)return;
     if(!response.ok&&result.error==='material_check_invalid_result'){hadFailure=true;next.done+=ids.slice(start,start+5).length;next.items.push(...ids.slice(start,start+5).map(id=>({materialId:id,name:rows.find(m=>m[0]===id)?.[2]??'资料',message:'AI返回的依据未能核对，请重新核查。',kind:'failed' as const})));setState({...next,items:[...next.items]});continue;}
     if(!response.ok)throw Error(result.error==='model_not_configured'?'AI尚未配置，暂未完成资料核查。':result.error==='material_check_source_changed'?'资料版本或权限已变化，请重新核查。':result.error==='material_check_invalid_result'?'AI返回的依据未能核对，请重试；已核查部分保留。':response.status===404?'资料核查服务暂不可用，请稍后重试。':'本轮AI核查未完成，请重试；已有问题提示保留。');
     const data=result as Result;pendingExtraction||=data.unread.some(m=>m.reason==='正文识别中');
     next.items.push(...data.findings.map(f=>({...f,kind:'suggestion' as const})),...data.unread.map(f=>({materialId:f.materialId,name:f.name,message:f.reason,kind:'unread' as const})));
     next.checked+=data.checked.length;next.done+=ids.slice(start,start+5).length;
     setState({...next,items:[...next.items]});
    }
    if(active){setState({...next,status:hadFailure?'error':'ready',error:hadFailure?'部分资料的AI依据未能核对，请重试；其他核查结果保留。':undefined});if(pendingExtraction&&!hadFailure)pollTimer=window.setTimeout(()=>setRetry(n=>n+1),15000);}
   }catch(error){if(active)setState({...next,items:[...next.items],status:'error',error:error instanceof Error&&/[\u4e00-\u9fff]/.test(error.message)?error.message:'资料核查连接中断，请重试；已完成部分保留。'});}
  })();return()=>{active=false;clearTimeout(pollTimer);controller.abort();};
 },[signature,retry]);
 const current=state?.key===signature?state:null,items=current?.items??[],item=items[index%Math.max(1,items.length)];
 useEffect(()=>{if(paused||interacting||reduced||items.length<2)return;const timer=setInterval(()=>setIndex(i=>(i+1)%items.length),8000);return()=>clearInterval(timer);},[paused,interacting,reduced,items.length]);
 const status=!current||current.status==='loading'?`正在核查资料 ${current?.done??0}/${materials.length}`:current.status==='error'?current.error:!materials.length?(unreviewed.length?'原始物料尚待原件核对':'当前筛选没有资料'):current.checked===0?'尚无可供AI核查的正文':`已核查 ${current.checked} 份正文 · 建议待人工复核`;
 return <section className="material-review-ticker" aria-label="资料核查提示" onMouseEnter={()=>setInteracting(true)} onMouseLeave={()=>setInteracting(false)} onFocusCapture={()=>setInteracting(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setInteracting(false);}}>
  <div className="material-ticker-label"><FileSearch size={16}/><strong>{current?.status==='error'?'核查未完成':!current||current.status==='loading'?'正在核查':'资料核查'}</strong></div>
  <div className="material-ticker-content">{item?<><span className="material-ticker-kind">{item.kind==='suggestion'?'AI建议':item.kind==='failed'?'待重核':'待核对'}</span><button type="button" className="material-ticker-message" onClick={()=>onOpen(item.materialId)} title={`${item.name}：${item.message}${item.quote?`\n依据：${materialCitationLocation({title:item.name,page:item.page??1,excerpt:item.quote})}「${item.quote}」`:''}`}><strong>{item.name}</strong><span> · {item.message}</span></button></>:<p role="status">{current?.status==='ready'&&current.checked>0?'本轮未发现有依据的资料问题，仍需人工核对完整性。':status}</p>}</div>
  <div className="material-ticker-controls">{item?<><button type="button" data-ui="secondary" onClick={()=>onOpen(item.materialId)}>查看资料</button><span className="material-ticker-count">{index%items.length+1}/{items.length}</span><button type="button" aria-label="上一条资料提示" disabled={items.length<2} onClick={()=>setIndex(i=>(i+items.length-1)%items.length)}><ChevronLeft size={15}/></button><button type="button" aria-label={paused||reduced?'播放资料提示':'暂停资料提示'} onClick={()=>{if(reduced){setReduced(false);setPaused(false);}else setPaused(p=>!p);}}>{paused||reduced?<Play size={14}/>:<Pause size={14}/>}</button><button type="button" aria-label="下一条资料提示" disabled={items.length<2} onClick={()=>setIndex(i=>(i+1)%items.length)}><ChevronRight size={15}/></button></>:null}<button type="button" data-ui="info" disabled={!current||current.status==='loading'||!materials.length} onClick={()=>{forceCheck.current=current?.status==='ready';setRetry(n=>n+1);}} title={status}>{current?.status==='error'?'重试核查':'重新核查'}</button></div>
 </section>;
}
