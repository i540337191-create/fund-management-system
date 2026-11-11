import {useEffect,useState} from 'react';
import {FileText,ExternalLink,RefreshCw} from 'lucide-react';
import {fetchInSession} from '../lib/sessionBoundary';
type Attachment={id:string;name:string};
export function FundOriginalPreview({draftId,attachments,onUpload,uploadDisabled}:{draftId?:string;attachments:Attachment[];onUpload:()=>void;uploadDisabled:boolean}){
 const [selected,setSelected]=useState(''),[retry,setRetry]=useState(0),[preview,setPreview]=useState<{key:string;kind:'pdf'|'image'|'text'|'unsupported'|'failed';url?:string;text?:string}|null>(null);
 const file=attachments.find(a=>a.id===selected)??attachments[attachments.length-1],key=JSON.stringify([draftId,file?.id]);
 const href=draftId&&file?`/api/business-intake/drafts/${encodeURIComponent(draftId)}/files/${encodeURIComponent(file.id)}`:undefined;
 useEffect(()=>{let active=true,objectUrl:string|undefined;setPreview(null);if(!href)return;
  void (async()=>{try{const response=await fetchInSession(fetch,href);if(!response.ok)throw Error('read_failed');const blob=await response.blob();if(!active)return;const type=blob.type.split(';')[0],kind=type==='application/pdf'?'pdf':['image/png','image/jpeg'].includes(type)?'image':['text/plain','text/csv','text/markdown'].includes(type)?'text':'unsupported';
   if(kind==='text'){const text=await blob.text();if(active)setPreview({key,kind,text});}
   else if(kind==='pdf'||kind==='image'){objectUrl=URL.createObjectURL(blob);if(active)setPreview({key,kind,url:objectUrl});}
   else if(active)setPreview({key,kind});
  }catch{if(active)setPreview({key,kind:'failed'});}})();return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[href,retry]);
 const current=preview?.key===key?preview:null;
 if(!file)return <button type="button" data-ui="secondary" className="fund-c-preview fund-c-preview-upload" onClick={onUpload} disabled={uploadDisabled} aria-label="上传基金设立原件" title="点击上传文件"><span className="fund-c-preview-heading"><FileText size={18}/><span>原件预览</span></span><span className="fund-c-preview-content fund-c-preview-empty"><FileText size={44}/><strong>上传基金设立原件</strong><span>协议、合同或设立文件会显示在这里，预览不代表资料已通过核验。</span></span></button>;
 return <div className="fund-c-preview" aria-label="基金原件预览"><header><FileText size={18}/><span>原件预览</span></header><select aria-label="选择核对的基金原件" value={file.id} onChange={e=>setSelected(e.target.value)}>{attachments.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><div className="fund-c-preview-content">{!current?<p role="status">正在读取本份原件…</p>:current.kind==='pdf'?<iframe title={`原件预览：${file.name}`} src={current.url}/>:current.kind==='image'?<img alt={`原件：${file.name}`} src={current.url}/>:current.kind==='text'?<pre>{current.text||'原件没有可显示的文字。'}</pre>:<div role={current.kind==='failed'?'alert':'status'}><FileText size={36}/><p>{current.kind==='failed'?'原件暂未读取，上传记录仍保留。':'此格式请下载核对原件；未生成页面预览。'}</p>{current.kind==='failed'?<button data-ui="info" type="button" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/>重新读取原件</button>:null}</div>}</div><a data-ui="info" href={href} target="_blank" rel="noreferrer">下载核对本份原件<ExternalLink size={13}/></a></div>;
}
