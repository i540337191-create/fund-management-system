import {hasConfirmedSource,isEngineeringRecord,type SourceProvenance} from '../lib/dataOrigin.ts';
import type {InvestmentLedgerRow} from '../lib/investmentLedgerTypes';
import type {FundLifecycleView} from '../lib/fundLifecycleTypes';
import {cents} from './capitalPortfolioModel.ts';
export type FinancialQuality={kind:'sample'|'suspected'|'unverified'|'registered';label:string;reason:string};
export function financialQuality(record:SourceProvenance,description=''):FinancialQuality{
 if(record.dataOrigin==='seed_demo')return {kind:'sample',label:'模拟业务数据',reason:'原记录 dataOrigin=seed_demo'};
 const demoBasis=record.sourceBasis?.filter(b=>b.dataOrigin==='seed_demo');if(demoBasis?.length)return {kind:'sample',label:'依据含模拟数据',reason:'关联依据标记为seed_demo：'+demoBasis.map(b=>b.id).join('、')};
 if(isEngineeringRecord(record))return {kind:'sample',label:'工程测试数据',reason:'原记录或依据标记为 engineering_fixture'};
 if(/不可作真实依据|不是真实|非真实|无真实|非合同|无.{0,8}合同效力|工程测试|模拟业务|演示数据|测试数据|合成.{0,6}(?:核验|验证|验收|测试|规则|固定费用)|隔离合成|QA.{0,40}合成/i.test(description))return {kind:'sample',label:'自述测试/合成',reason:'原名称或说明明确声明合成、测试或不是真实合同'};
 if(/(?:^|[^a-z0-9])qa(?=[^a-z0-9]|$)|验收|测试|隔离/i.test(description))return {kind:'suspected',label:'疑似测试，待核验',reason:'名称或说明含QA、验收、测试或隔离，尚未据此改写来源标记'};
 if(!hasConfirmedSource(record))return {kind:'unverified',label:'来源待核验',reason:'缺少可确认的来源或依据'};
 return {kind:'registered',label:'系统原始登记',reason:'来自系统来源标记；不单凭录入标记证明业务真实性'};
}
export function relatedQuality(record:SourceProvenance,description='',related:{record:SourceProvenance;description:string}[]=[]):FinancialQuality{
 const choices=[financialQuality(record,description),...related.map(ref=>{const quality=financialQuality(ref.record,ref.description);return {...quality,reason:'关联记录：'+ref.description+'；'+quality.reason};})];
 for(const kind of ['sample','suspected','unverified','registered'] as const){const found=choices.find(q=>q.kind===kind);if(found)return found;}
 return choices[0];
}
export function parseRegisteredMoney(value:string|undefined):bigint|null{
 const text=(value??'').replace(/\s/g,'');const match=text.match(/^((?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?)(亿元|万元|亿|万|元)?$/);if(!match)return null;
 const number=match[1].replace(/,/g,''),[whole,fraction='']=number.split('.'),factor=match[2]?.includes('亿')?10000000000n:match[2]?.includes('万')?1000000n:100n;
 const numerator=BigInt(whole+fraction)*factor,denominator=10n**BigInt(fraction.length);return numerator%denominator===0n?numerator/denominator:null;
}
type Charge=FundLifecycleView['charges'][number];type Rule=FundLifecycleView['rules'][number];
export function feeCalculation(charge:Charge,rule:Rule|undefined){
 if(!rule)return {valid:false,reason:'缺少对应已批准费用规则'};
 const proof=rule.approval;if(!proof?.materialId||!proof.versionId||!/^[a-f0-9]{64}$/i.test(proof.sha256??'')||!proof.sizeBytes||proof.readIssue)return {valid:false,reason:'合同批准依据缺失或无权读取'};
 if(!rule.approvedBy||![charge.from,charge.to,rule.validFrom,rule.validTo].every(isRecordedDate)||charge.from<rule.validFrom||charge.to>rule.validTo)return {valid:false,reason:'批准人或规则生效期间待核验'};
 const principal=cents(charge.principal),rate=typeof rule.rate==='string'?rule.rate.match(/^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/):null,days=(Date.parse(charge.to)-Date.parse(charge.from))/86400000+1;
 if(principal===null||principal<=0n||!rate||!['360','365','366'].includes(rule.dayBasis)||!['half_up','down'].includes(rule.rounding)||!Number.isInteger(days)||days<1||days>3660||charge.days!==days)return {valid:false,reason:'计费本金、费率、天数、年基数或取整口径不完整'};
 const rateUnits=BigInt(rate[1])*1000000n+BigInt((rate[2]??'').padEnd(6,'0'));if(rateUnits>100000000n)return {valid:false,reason:'年费率超出系统范围'};
 if(rule.accrualYears!==undefined&&(!Number.isInteger(rule.accrualYears)||rule.accrualYears<1||rule.accrualYears>10))return {valid:false,reason:'固定计提年数无效'};
 const denominator=100000000n*BigInt(rule.accrualYears===undefined?rule.dayBasis:1),numerator=principal*rateUnits*BigInt(rule.accrualYears??days),calculated=(numerator+(rule.rounding==='half_up'?denominator/2n:0n))/denominator;
 if(cents(charge.amount)!==calculated)return {valid:false,reason:'规则计算金额与登记应收不一致，须核对原分期'};
 return {valid:true,reason:'规则、期间和已登记应收计算一致'};
}
export function isRecordedDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function legacyOutstanding(record:{status:string;dueDate:string},today:string){
 const pending=record.status!=='已收';const valid=isRecordedDate(record.dueDate);
 return {pending,overdue:pending&&valid&&record.dueDate<today,unknownDate:pending&&!valid};
}

export function allocationQuality(row:InvestmentLedgerRow,fund:SourceProvenance&{name?:string}={}){return relatedQuality(row.sourceOrigins?.batch??{},row.dealTitle,[{record:row.sourceOrigins?.project??{},description:row.projectName},{record:row.sourceOrigins?.terms??{},description:'交易批准要素'},{record:fund,description:fund.name??row.fundName??'关联基金'}]);}

export function snapshotEvidence(snapshot:FundLifecycleView['capital'],fund:SourceProvenance&{name?:string},today:string){
 const base=financialQuality(fund,fund.name??''),declared=financialQuality({},(snapshot?.note??'')+' '+(snapshot?.proof?.name??''));
 const quality=base.kind==='sample'?base:declared.kind==='sample'||declared.kind==='suspected'?declared:base;
 if(!snapshot)return {amount:null,quality,reason:'尚无资金快照登记'};
 if(quality.kind!=='registered')return {amount:null,quality,reason:quality.reason};
 const proof=snapshot.proof;if(!proof?.materialId||!proof.versionId||!/^[a-f0-9]{64}$/i.test(proof.sha256??'')||!proof.sizeBytes||proof.readIssue)return {amount:null,quality:{kind:'unverified' as const,label:'快照依据待核验',reason:'快照原件缺失或不可读取'},reason:'快照原件缺失或不可读取'};
 const balance=cents(snapshot.balance),committed=cents(snapshot.committed),reserve=cents(snapshot.reserve);
 if(balance===null||committed===null||reserve===null||!isRecordedDate(snapshot.date)||snapshot.date>today||!/^[-]?(0|[1-9]\d*)\.\d{2}$/.test(snapshot.available)||BigInt(snapshot.available.replace('.',''))!==balance-committed-reserve)return {amount:null,quality:{kind:'unverified' as const,label:'快照金额待核验',reason:'日期、金额或余额减承诺减预留的口径不一致'},reason:'日期、金额或余额减承诺减预留的口径不一致'};
 return {amount:balance-committed-reserve,quality,reason:'按已登记快照和原件核对，不代表银行实时余额'};
}
