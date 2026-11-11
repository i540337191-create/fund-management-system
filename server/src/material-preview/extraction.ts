import {materialCitationLocation} from './location.ts';
import { constants } from 'node:fs';
import { open, mkdir, lstat, readFile, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import type { LedgerStore, Material, MaterialTextChunk } from '../ledger/store.ts';
import { materialVersionSourceBasis } from '../ledger/source-policy.ts';
import type { MaterialVersion } from '../ledger/material-upload.ts';
const exec = promisify(execFile);
const uuid = /^[0-9a-f-]{36}$/i;
const audioRevision=2;
let audioQueue:Promise<void>=Promise.resolve();
let documentQueue:Promise<void>=Promise.resolve();
const audioTypes=['wav','mp3','m4a','ogg','webm','flac'];
const inflight = new Map<string, Promise<Extraction>>();
export type Extraction = { audioRevision?:number; versionId: string; sha256: string; status: 'ready'|'failed'|'pending'; pages: {page:number;text:string;method:string}[]; error?: string; updatedAt: string };
function cachePath(root: string, version: MaterialVersion) {
  if (!uuid.test(version.id) || !uuid.test(version.blobId) || !/^[a-f0-9]{64}$/i.test(version.sha256)) throw Error('invalid_material_version');
  return resolve(root, 'extracted-text', `${version.id}-${version.sha256}.json`);
}
async function readOriginal(root: string, version: MaterialVersion) {
  const file=await open(resolve(root,version.blobId),constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const stat=await file.stat();if(!stat.isFile()||stat.size!==version.sizeBytes||stat.size>25*1024*1024)throw Error('material_integrity_failure');
    const bytes=await file.readFile();if(createHash('sha256').update(bytes).digest('hex')!==version.sha256)throw Error('material_integrity_failure');return bytes;
  } finally {await file.close();}
}
export async function readMaterialExtraction(root: string, version: MaterialVersion): Promise<Extraction|null> {
  try {
    const path=cachePath(root,version);if((await lstat(dirname(path))).isSymbolicLink()||(await lstat(path)).isSymbolicLink())throw Error('unsafe_extraction');
    const value=JSON.parse(await readFile(path,'utf8')) as Extraction;
    if(value.versionId!==version.id||value.sha256!==version.sha256||!['ready','failed','pending'].includes(value.status)||!Array.isArray(value.pages)||value.pages.some(p=>!Number.isInteger(p.page)||p.page<1||typeof p.text!=='string'||typeof p.method!=='string'))return null;
    if(audioTypes.includes(extname(version.name).slice(1).toLowerCase())&&value.audioRevision!==audioRevision)return null;
    return value;
  } catch {return null;}
}
export async function ensureMaterialExtraction(root: string, version: MaterialVersion, retry=false): Promise<Extraction> {
  const key=cachePath(root,version);const active=inflight.get(key);if(active)return active;
  const job=(async()=>{
    const cached=await readMaterialExtraction(root,version);if(cached?.status==='ready'||(cached?.status==='failed'&&!retry))return cached;
    let result:Extraction={versionId:version.id,sha256:version.sha256,status:'failed',pages:[],updatedAt:new Date().toISOString()};
    let temp:string|undefined;let releaseAudio:(()=>void)|undefined;
    const extension=extname(version.name).slice(1).toLowerCase();
    if(audioTypes.includes(extension))result.audioRevision=audioRevision;
    await saveExtraction(root,version,{...result,status:'pending'});
    if(audioTypes.includes(extension)){const previous=audioQueue;audioQueue=new Promise<void>(resolve=>{releaseAudio=resolve;});await previous;}
    else{const previous=documentQueue;documentQueue=new Promise<void>(resolve=>{releaseAudio=resolve;});await previous;}
    try {
      const bytes=await readOriginal(root,version);
      await mkdir(resolve(root,'extraction-work'),{recursive:true,mode:0o700});if((await lstat(resolve(root,'extraction-work'))).isSymbolicLink())throw Error('unsafe_extraction_storage');
      temp=await mkdtemp(resolve(root,'extraction-work','job-'));
      const source=resolve(temp,'source.'+extension);await writeFile(source,bytes,{mode:0o600});
      if(['txt','md','csv'].includes(extension))result.pages=[{page:1,text:bytes.toString('utf8'),method:'utf8'}];
      else if(((process.platform==='linux'&&['doc','docx','pdf','png','jpg','jpeg'].includes(extension))||['xls','xlsx','ppt','pptx',...audioTypes].includes(extension))) {
        const script=resolve(dirname(fileURLToPath(import.meta.url)),'../../scripts/extract-document-linux.py');
        const {stdout}=await exec(process.env.DOCUMENT_PYTHON??'python3',[script,source,extension],{timeout:audioTypes.includes(extension)?3600000:260000,maxBuffer:8*1024*1024});result.pages=JSON.parse(stdout);
      } else if(['doc','docx'].includes(extension)) {
        const {stdout}=await exec('/usr/bin/textutil',['-convert','txt','-stdout',source],{timeout:60000,maxBuffer:8*1024*1024});
        result.pages=[{page:1,text:stdout,method:'word_text'}];
      } else if(['pdf','png','jpg','jpeg'].includes(extension)) {
        const script=resolve(dirname(fileURLToPath(import.meta.url)),'../../scripts/extract-document.swift');
        const {stdout}=await exec('/usr/bin/swift',[script,source,extension],{timeout:180000,maxBuffer:8*1024*1024});result.pages=JSON.parse(stdout);
      } else throw Error('unsupported_extraction_type');
      if(!result.pages.some(p=>p.text.trim()))throw Error('no_readable_text');
      if(result.pages.some(p=>!Number.isInteger(p.page)||p.page<1||typeof p.text!=='string')||result.pages.reduce((n,p)=>n+p.text.length,0)>4*1024*1024)throw Error('extraction_limit');
      result={...result,status:'ready'};
    } catch(error) {result={...result,status:'failed',pages:[],error:error instanceof Error&&['unsupported_extraction_type','no_readable_text','material_integrity_failure','extraction_limit'].includes(error.message)?error.message:'document_extraction_failed'};}
    finally {releaseAudio?.();if(temp)await rm(temp,{recursive:true,force:true});}
    await saveExtraction(root,version,result);return result;
  })();inflight.set(key,job);try{return await job;}finally{inflight.delete(key);}
}
async function saveExtraction(root:string,version:MaterialVersion,result:Extraction){
  const key=cachePath(root,version),directory=dirname(key);await mkdir(directory,{recursive:true,mode:0o700});if((await lstat(directory)).isSymbolicLink())throw Error('unsafe_extraction_storage');
  const staged=key+'.'+randomUUID()+'.tmp';await writeFile(staged,JSON.stringify(result),{mode:0o600,flag:'wx'});await rename(staged,key);
}
export async function requestMaterialExtraction(root:string,version:MaterialVersion,retry=false):Promise<Extraction>{
  if(!audioTypes.includes(extname(version.name).slice(1).toLowerCase())&&inflight.size===0)return ensureMaterialExtraction(root,version,retry);
  const cached=await readMaterialExtraction(root,version);if(cached?.status==='ready'||(cached?.status==='failed'&&!retry))return cached;
  const job=ensureMaterialExtraction(root,version,retry);void job.catch(()=>{});
  return {versionId:version.id,sha256:version.sha256,status:'pending',pages:[],updatedAt:new Date().toISOString()};
}
export async function resumeMaterialExtractions(store:LedgerStore,root:string){
  for(const material of await store.listMaterials()){
    if(!material.currentVersionId)continue;
    const version=(await store.listMaterialVersions(material.id)).find(v=>v.id===material.currentVersionId);if(!version)continue;
    const cached=await readMaterialExtraction(root,version);
    if(!cached||cached.status==='pending'||cached.error==='unsupported_extraction_type'){const job=ensureMaterialExtraction(root,version,true);if(audioTypes.includes(extname(version.name).slice(1).toLowerCase()))void job.catch(()=>{});else await job.catch(()=>{});}
  }
}
export async function searchUploadedMaterialTextChunks(store: LedgerStore,root: string,input: Parameters<LedgerStore['searchMaterialTextChunks']>[0]): Promise<MaterialTextChunk[]> {
  const terms=input.query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)??[];if(!terms.length)return [];
  const materials=(await store.listMaterials()).filter(m=>m.currentVersionId&&(!input.allowedMaterialIds||input.allowedMaterialIds.includes(m.id))&&(!input.allowedDataOrigins?.length||input.allowedDataOrigins.includes(String(m.dataOrigin)))&&(!input.relationId||matchesRelation(m,input.relationType,input.relationId)));
  const matches:{chunk:MaterialTextChunk;score:number;versionId:string}[]=[];
  for(const material of materials){
    const version=(await store.listMaterialVersions(material.id)).find(v=>v.id===material.currentVersionId);if(!version)continue;
    if(input.includeDemo===false&&(material.dataOrigin==='seed_demo'||material.dataPurpose==='engineering_fixture'||material.currentVersionPurpose==='engineering_fixture'||version.dataPurpose==='engineering_fixture'||material.sourceBasis?.some(b=>b.dataPurpose==='engineering_fixture')))continue;
    const extracted=await readMaterialExtraction(root,version);if(extracted?.status!=='ready')continue;
    const href=`/api/materials/${encodeURIComponent(material.id)}/versions/${version.id}/file`;
    for(const page of extracted.pages)for(let start=0,index=1;start<page.text.length;start+=780,index++){
      const text=page.text.slice(start,start+900).trim();if(!text)continue;
      const haystack=(material.name+' '+text).toLowerCase();const score=terms.reduce((n,t)=>n+(haystack.includes(t)?t.length:0),0);if(!score)continue;
      matches.push({versionId:version.id,score,chunk:{id:`${version.id}-p${page.page}-c${index}`,materialId:material.id,dataOrigin:String(material.dataOrigin??'user_input'),dataPurpose:material.dataPurpose,sourceBasis:materialVersionSourceBasis(material,version),fileName:material.name,category:material.type,projectOrFund:material.project,archivePath:material.path??'',page:page.page,location:materialCitationLocation({title:version.name,page:page.page,excerpt:text}),chunkIndex:index,text,recognizedTextPath:'',recognizedTextHref:href,originalPath:href,originalDocumentHref:href}});
    }
  }
  const latest=new Map((await store.listMaterials()).map(m=>[m.id,m.currentVersionId]));
  return matches.filter(x=>latest.get(x.chunk.materialId)===x.versionId).sort((a,b)=>b.score-a.score).slice(0,Math.max(1,Math.min(input.limit??6,12))).map(x=>x.chunk);
}
function matchesRelation(m:Material,type:string|undefined,id:string){return type==='project'?(m.projectId===id||m.relationships?.projects.some(x=>x.id===id)):type==='fund'?(m.fundId===id||m.relationships?.funds.some(x=>x.id===id)):type==='company'?m.relationships?.companies.some(x=>x.id===id):type==='investor'?m.relationships?.investors.some(x=>x.id===id):true;}

export async function searchCurrentMaterialTextChunks(store:LedgerStore,root:string,input:Parameters<LedgerStore['searchMaterialTextChunks']>[0]):Promise<MaterialTextChunk[]> {
  if(input.allowedMaterialIds?.length===0)return [];
  const [legacy,uploaded]=await Promise.all([store.searchMaterialTextChunks(input),searchUploadedMaterialTextChunks(store,root,input)]);
  const current=new Map((await store.listMaterials()).map(m=>[m.id,m.currentVersionId]));
  const terms=input.query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)??[];
  const score=(c:MaterialTextChunk)=>terms.reduce((n,t)=>n+((c.fileName+' '+c.text).toLowerCase().includes(t)?t.length:0),0);
  return [...legacy.filter(c=>!current.get(c.materialId)),...uploaded.filter(c=>c.id.startsWith(String(current.get(c.materialId))+'-'))].sort((a,b)=>score(b)-score(a)).slice(0,Math.max(1,Math.min(input.limit??6,12)));
}
