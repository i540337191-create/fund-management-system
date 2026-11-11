import {fetchInSession,clientSessionEpoch,assertSessionEpoch} from './sessionBoundary';
export async function downloadDocument(path:string,fileName:string,body?:unknown){
 const epoch=clientSessionEpoch(),response=await fetchInSession(fetch,path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 if(!response.ok){let code='document_download_failed';try{code=(await response.json()).error??code;}catch{}throw Object.assign(new Error('文件暂未生成，请检查正文、引用资料或稍后重试。'),{status:response.status,code});}
 const blob=await response.blob();assertSessionEpoch(epoch);
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
