import {hiddenSource} from '../ledger/source-policy.ts';
import type {SessionUser} from '../auth/session.ts';
import {canReadLp} from '../ledger/lp-privacy.ts';
import {canReadMaterial} from './material-files.ts';
import {lifecycleView,feeAmount,type LifecycleState,type LifecycleProof} from '../ledger/fund-lifecycle.ts';
import {WorkflowError} from '../ledger/workflow.ts';
export async function readFundLifecycleView(s:LifecycleState,a:SessionUser,readBytes:(id:string,sha:string,size:number)=>Promise<Buffer>,today?:string,snapshot?:ReturnType<typeof lifecycleView>){
 const view=snapshot??lifecycleView(s,today);
 if(!canReadLp(a))return {...view,clauses:[],cases:view.cases.filter(c=>!c.deletedAt).map(c=>({...c,title:'基金运营事项',period:'',requirements:[],feedback:[],changes:[],distributions:[],submissions:[],report:'',review:undefined,reconciliation:undefined})),rules:[],accounts:[],charges:[],receipts:[],allocations:[],invalidAllocations:[],capital:null,tasks:view.tasks.map(t=>({...t,name:'基金运营待办'})),history:[]};
 const cache=new Map<string,Promise<string|undefined>>();
 function issue(p:LifecycleProof){const key=JSON.stringify([p.materialId,p.versionId,p.sha256,p.sizeBytes]);let pending=cache.get(key);if(!pending){pending=(async()=>{const m=s.materials.find(m=>m.id===p.materialId);if(!m)return 'material_version_unavailable';if(!canReadMaterial(a,m))return 'forbidden';if(!(m.fundId===s.fund.id||m.relationships?.funds.some(f=>f.id===s.fund.id)))return 'material_not_linked';const v=s.versions.find(v=>v.id===p.versionId&&v.materialId===p.materialId);if(!v)return 'material_version_unavailable';if(hiddenSource(m)||hiddenSource(v))return 'operational_evidence_required';if(p.sha256!==undefined&&v.sha256!==p.sha256||p.sizeBytes!==undefined&&v.sizeBytes!==p.sizeBytes)return 'material_integrity_mismatch';try{await readBytes(v.blobId,v.sha256,v.sizeBytes);return undefined;}catch(e){if(e instanceof WorkflowError)return e.code;throw e;}})();cache.set(key,pending);}return pending;}
 async function project(v:any):Promise<any>{if(Array.isArray(v))return Promise.all(v.map(project));if(!v||typeof v!=='object')return v;if(typeof v.materialId==='string'&&typeof v.versionId==='string'){const readIssue=await issue(v);return readIssue==='forbidden'?{materialId:v.materialId,versionId:v.versionId,name:'无权查看凭证',readIssue}:({...v,...(readIssue?{readIssue}:{})});}return Object.fromEntries(await Promise.all(Object.entries(v).map(async([k,x])=>[k,await project(x)])));}
 const projected=await project(view) as typeof view;
 const charges=await Promise.all(projected.charges.map(async c=>{const reasons:string[]=[];const rule=projected.rules.find(r=>r.id===c.ruleId);if(!rule)reasons.push('缺少对应已批准费用规则');else{if((rule.approval as any).readIssue)reasons.push('费用规则依据不可核验');try{if(!rule.approvedBy||c.from<rule.validFrom||c.to>rule.validTo||(feeAmount(c.principal,rule.rate,c.from,c.to,rule.dayBasis,rule.rounding,rule.accrualYears).amount!==c.amount||feeAmount(c.principal,rule.rate,c.from,c.to,rule.dayBasis,rule.rounding,rule.accrualYears).days!==c.days))reasons.push('计费口径或应收金额不一致');}catch{reasons.push('计费口径不完整');}}
 for(const allocation of projected.allocations.filter(x=>x.chargeId===c.id)){const receipt=projected.receipts.find(r=>r.id===allocation.receiptId);if(!receipt||(receipt.proof as any).readIssue)reasons.push('核销回单原件不可核验');}
 return {...c,verification:{status:reasons.length?'unverified' as const:'evidence_ready' as const,reasons:[...new Set(reasons)]}};}));
 return {...projected,currentUserId:a.id,charges};
}
