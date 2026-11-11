import { confirmedSource } from './source-policy.ts';
import {createHash} from 'node:crypto';
import type {CapitalRecord, RiskRecord} from './store.ts';
import type {PostBase, PostPeriod, PostFinancial, PostVisit, PostArchive, PostClause} from './post-investment.ts';
import {canonicalPeriod, latestVersions, periodContains} from './post-investment.ts';
import {fail, type MaterialSnapshot, type WorkflowState} from './workflow.ts';
import type {SessionUser} from '../auth/session.ts';
export type PostReport = PostBase & {
 title:string; period:PostPeriod; analysis:string; status:'draft'|'pending'|'approved'|'returned'|'rejected'|'archived';
 reviewer:SessionUser; evidence:MaterialSnapshot[]; sourceHash:string;
 snapshot:{project:{id:string;name:string};capturedAt:string;financial:PostFinancial|null;visits:PostVisit[];archives:PostArchive[];clauses:PostClause[];risks:RiskRecord[];capitalRecords:CapitalRecord[];fundIds:string[]};
 missing:{key:string;label:string;reason:string}[]; taskIds:string[];
 decisions:{actor:SessionUser;decision:'approve'|'return'|'reject';opinion:string;acceptMissing:boolean;time:string}[];
 archived?:{actor:SessionUser;time:string};
};
export function reportEvidence(r:PostReport):MaterialSnapshot[]{
 return [...r.evidence,...r.snapshot.financial?.evidence??[],...r.snapshot.visits.flatMap(v=>v.evidence),...r.snapshot.archives.flatMap(a=>a.materials),...r.snapshot.clauses.flatMap(c=>[c.signedMaterial,...c.resolution?.evidence??[]])];
}
export function reportSourcePayload(r:Pick<PostReport,'snapshot'|'evidence'|'missing'>):string {
 function canonical(value:any):any{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(key=>key!=='packetBlobId').sort().map(key=>[key,canonical(value[key])]));
  return value;
 }
 return JSON.stringify(canonical({snapshot:r.snapshot,evidence:r.evidence,missing:r.missing}));
}
export function reportSourceHash(r:Pick<PostReport,'snapshot'|'evidence'|'missing'>):string {
 return createHash('sha256').update(reportSourcePayload(r)).digest('hex');
}
export function capturePostReport(s:WorkflowState, dealId:string, inputPeriod:unknown, capturedAt:string){
 const p=s.postInvestment!,period=canonicalPeriod(inputPeriod),deal=s.deals!.find(d=>d.id===dealId)!;
 const terms=deal.terms.find(t=>t.id===deal.closing!.termsId);if(!terms)fail('closed_terms_missing',409);
 const fundIds=terms.allocations.map(a=>a.fundId);
 const inPeriod=(value:string)=>{try{return periodContains(period,value.slice(0,10));}catch{return false;}};
 const same=(v:PostPeriod)=>v.kind===period.kind&&v.value===period.value;
 const latest=latestVersions(p.financials).find(v=>v.dealId===dealId&&same(v.period));
 const financial=latest?.status==='approved'&&confirmedSource(latest)?latest:null;
 const sources=s.reportSources;if(!sources)fail('report_sources_unavailable',409);
 const real=confirmedSource;
 const risks=sources.risks.filter(v=>v.projectId===s.project.id&&real(v)&&inPeriod(v.time));
 const capitalRecords=sources.capitalRecords.filter(v=>v.projectId===s.project.id&&fundIds.includes(v.fundId)&&real(v)&&inPeriod(v.date));
 const missing:PostReport['missing']=[];
 if(!financial)missing.push({key:'financial',label:'期间经营数据',reason:latest?`最新版本V${latest.version}未达到可核验来源或批准要求（${latest.status}），不采用旧版本替代。`:'尚无本批次本期间已批准经营数据。'});
 if(financial)for(const [key,label] of [['revenue','营业收入'],['netProfit','净利润'],['netAssets','净资产'],['valuation','估值'],['employees','员工数']] as const)if(financial[key]===null)missing.push({key,label,reason:financial.missingReasons[key]??'未提供'});
 if(!risks.length)missing.push({key:'risks',label:'期间风险核对',reason:'本期间未找到真实项目风险记录，不能据此认定无风险。'});
 if(!capitalRecords.length)missing.push({key:'capital',label:'期间资金核对',reason:'本期间未找到本项目及本批次基金的真实资金事项，不能据此认定无资金发生。'});
 missing.push({key:'cashEvidence',label:'现金流水完整性',reason:'现有资金事项未提供完整银行实缴流水及凭证映射，不作为实缴现金或收益核算。'});
 const snapshot:PostReport['snapshot']=structuredClone({project:{id:s.project.id,name:s.project.name},capturedAt,financial,visits:latestVersions(p.visits).filter(v=>v.dealId===dealId&&confirmedSource(v)&&inPeriod(v.date)),archives:p.archives.filter(v=>v.dealId===dealId&&confirmedSource(v)&&same(v.period)),clauses:latestVersions(p.clauses).filter(v=>v.dealId===dealId&&confirmedSource(v)&&(inPeriod(v.triggerDate)||(v.warningTaskId&&(v.status==='active'||inPeriod(s.tasks.find(t=>t.id===v.warningTaskId)?.updatedAt??''))))),risks,capitalRecords,fundIds});
 return {period,snapshot,missing};
}
export function renderPostReport(r:PostReport,projectionNotice?:string):string{
 const e=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const pre=(v:unknown)=>`<pre>${e(typeof v==='string'?v:JSON.stringify(v,null,2))}</pre>`;
 const source=reportSourcePayload(r);
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(r.title)}</title><style>body{font:16px/1.7 system-ui;max-width:960px;margin:40px auto;padding:0 24px;color:#26241e;background:#faf9f6}h1{font-size:28px}h2{font-size:20px;border-bottom:1px solid #ddd6c9;padding-bottom:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}li{margin-bottom:8px}@media print{body{margin:0;background:white}}</style><h1>${e(r.title)}</h1><p>${e(r.snapshot.project.name)} · ${e(r.period.value)} · V${r.version} · ${e(r.status)}</p><p>项目 ${e(r.snapshot.project.id)} / 交割批次 ${e(r.dealId)} / 报告 ${e(r.id)}</p><p>生成 ${e(r.time)} / 归档 ${e(r.archived?.time)} / 审核责任人 ${e(r.reviewer.name)}</p><h2>经营分析与结论</h2>${pre(r.analysis)}<h2>资料缺口及适用限制</h2><ul>${r.missing.map(m=>`<li>${e(m.label)}：${e(m.reason)}</li>`).join('')}</ul><p>风险与资金为项目层面记录，资金仅含本批次基金；不按交易分摊、不作为银行实缴或收益结果。不使用演示记录，不自动生成AI结论。</p><h2>经营数据（人民币元）</h2>${pre(r.snapshot.financial??'尚无本期已批准经营数据')}<h2>期间风险记录</h2>${pre(r.snapshot.risks)}<h2>期间资金事项（保留原金额与口径）</h2>${pre(r.snapshot.capitalRecords)}<h2>走访、期间档案与生成时未关闭预警</h2>${pre({visits:r.snapshot.visits,archives:r.snapshot.archives,clauses:r.snapshot.clauses})}<h2>审核与归档</h2>${pre({decisions:r.decisions,archived:r.archived})}<h2>原件版本与来源哈希</h2>${projectionNotice?`<p role="note"><strong>${e(projectionNotice)}</strong></p>`:''}<p>SHA256 ${e(r.sourceHash)}</p><ul>${reportEvidence(r).map(m=>`<li>${e(m.name)} / ${e(m.materialId)} / ${e(m.versionId)} / ${e(m.sha256)}</li>`).join('')}</ul><details><summary>规范来源JSON（对象键递归排序，数组保序，排除私有存储ID；UTF-8 SHA256）</summary>${pre(source)}</details></html>`;
}
