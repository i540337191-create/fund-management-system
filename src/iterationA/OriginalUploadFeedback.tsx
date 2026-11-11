import React from 'react';
import {Check,CircleAlert,LoaderCircle} from 'lucide-react';
export type OriginalUploadState='idle'|'uploading'|'saved'|'unknown'|'failed';
const messages:Record<OriginalUploadState,string>={idle:'尚未上传原件。',uploading:'正在保存原件，请等待结果…',saved:'原件已上传并保存；识别与字段完整性单独核对。',unknown:'原件上传结果尚未确认，请保留原请求核对或重试。',failed:'原件未能上传，请核对文件后重试。'};
export function OriginalUploadFeedback({state,message}:{state:OriginalUploadState;message?:string}){
 const Icon=state==='saved'?Check:state==='uploading'?LoaderCircle:state==='failed'||state==='unknown'?CircleAlert:null;
 return <div aria-label="原件上传结果" role={state==='failed'?'alert':'status'} style={{height:72,overflow:'auto',display:'flex',alignItems:'flex-start',gap:8,fontSize:13,lineHeight:1.8,color:state==='saved'?'var(--success)':state==='failed'?'var(--danger)':'var(--secondary)'}}>{Icon?<Icon size={16} style={{flexShrink:0,marginTop:4}}/>:null}<span>{message||messages[state]}</span></div>;
}
