import {useState} from 'react';
import {WorkflowDialog} from './MaterialFileDialogs';

export function MaterialOriginalImageButton({name,path}:{name:string;path:string}){
 const [open,setOpen]=useState(false),[state,setState]=useState<'loading'|'ready'|'error'>('loading');
 const src='/'+path.replace(/^\/+/, '');
 return <><button data-ui="info" type="button" className="inline-flex h-8 items-center rounded-md border border-gold px-2.5 text-xs font-semibold text-gold" aria-label={`查看原图：${name}`} onClick={()=>{setState('loading');setOpen(true);}}>查看原图</button>{open?<WorkflowDialog title="查看原图" busy={false} onClose={()=>setOpen(false)}><p className="mb-3 break-words text-sm">{name}</p><p role={state==='error'?'alert':'status'} className={`min-h-12 text-sm ${state==='error'?'text-red-600 dark:text-red-400':'text-[var(--secondary)]'}`}>{state==='loading'?'正在加载原图…':state==='error'?'当前未能读取图像，请核对登录、权限及原件状态；不能据此判定文件不存在。':'原图已载入，下方下载入口对应同一版本。'}</p><img src={src} alt={name} className={`h-auto w-full rounded-md ${state==='error'?'hidden':''}`} onLoad={()=>setState('ready')} onError={()=>setState('error')}/><a data-ui="info" className="mt-3 inline-block text-sm text-gold" href={src} target="_blank" rel="noreferrer">下载原图</a></WorkflowDialog>:null}</>;
}
