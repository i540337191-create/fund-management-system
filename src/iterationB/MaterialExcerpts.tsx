import {useEffect,useState} from 'react';
import {createApiClient,type ApiMaterial} from '../lib/apiClient';
const api=createApiClient();
type Material=Pick<ApiMaterial,'id'|'name'|'currentVersionId'>;
type Excerpt={text?:string;error?:string};
export function MaterialExcerpts({materials}:{materials:Material[]}){
 const selected=materials.slice(0,3),identity=JSON.stringify(selected.map(m=>[m.id,m.currentVersionId]));
 const [retry,setRetry]=useState(0),[result,setResult]=useState<{identity:string;rows:Excerpt[]}|null>(null);
 useEffect(()=>{let active=true;setResult(null);void Promise.all(selected.map(async material=>{
  if(!material.currentVersionId)return {error:'尚未登记当前原件版本，请核对原件。'};
  try{const page=await api.getMaterialExtractionText(material.id,1);if(page.versionId!==material.currentVersionId)return {error:'正文版本与当前资料不一致，请刷新资料后核对。'};return {text:page.text.trim().slice(0,600)};}
  catch{return {error:'本份资料正文暂未读取，不能据此归纳内容。'};}
 })).then(rows=>{if(active)setResult({identity,rows});});return()=>{active=false;};},[identity,retry]);
 const rows=result?.identity===identity?result.rows:null;
 return <div className="overview-a-excerpts"><p className="overview-a-note">前3份关联资料的第1页识别正文摘录（每份至多600字），关键内容须核对原件。</p>{selected.map((material,index)=><article key={material.id}><strong>{material.name}</strong><p className="whitespace-pre-wrap">{!rows?'正在读取对应版本的正文…':rows[index]?.error??(rows[index]?.text||'本页未识别到可读文字。')}</p>{material.currentVersionId?<a data-ui="info" href={`/api/materials/${encodeURIComponent(material.id)}/versions/${encodeURIComponent(material.currentVersionId)}/file`} target="_blank" rel="noreferrer">核对本版原件</a>:null}</article>)}{rows?.some(row=>row.error)?<button type="button" data-ui="secondary" onClick={()=>setRetry(value=>value+1)}>重新读取资料正文</button>:null}</div>;
}
