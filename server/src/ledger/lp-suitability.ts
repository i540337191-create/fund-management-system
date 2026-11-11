import {investorProfileKind} from './lp-profile.ts';
import {fundraisingTemplates} from './fundraising-templates.ts';
export const suitabilityProductSource={path:'demo/product-investor-profile.docx',href:'/api/fundraising/templates/product-profile/source',sha256:'7b166865647b4da6e30f5d4fd5f13ed4265c96e27e53eec8bbc1e07db8c305bb',section:'Example configurable rules / 示例可配置规则'};
function explicitCny(value:unknown):bigint|undefined{
 if(typeof value!=='string')return;const m=/^(?:人民币|CNY|RMB|￥)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(元|万元|亿元)$/.exec(value.trim());if(!m)return;
 const [whole,decimal='']=m[1].replaceAll(',','').split('.');return (BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0')))*({元:1n,万元:10000n,亿元:100000000n}[m[2]]!);
}
export function lpSuitabilityGuidance(investor:Parameters<typeof investorProfileKind>[0],requirements:{name?:string;required?:boolean;condition?:string;source?:{sha256:string;origin?:string;templateId?:string;version?:number;path?:string;templateSnapshot?:{title:string}}}[]=[]){
 const kind=investorProfileKind(investor),templates=fundraisingTemplates.filter(t=>requirements.some(r=>r.source?.sha256===t.sha256));
 const rules:{name:string;requirement:string;quote:string;source:{path:string;href:string;sha256:string;section:string}}[]=templates.flatMap(t=>{
  const source={path:t.source,href:'/api/fundraising/templates/'+t.id+'/source',sha256:t.sha256,section:'Example configurable rules / 示例可配置规则'};
  return [{name:'风险测评',requirement:'按该清单核对风险问卷评分≥76、R5级；实际评分须有问卷和计分依据。',quote:'风险调查问卷，评分≥76，R5级',source},...(kind==='institution'?[{name:'机构资产与双录',requirement:'净资产需大于1000万元；需与法定代表人双录，不能双录时需出具授权委托书。',quote:'三年一期的审计报告或财务报表（净资产需大于1000万元）',source}]:kind==='natural'?[{name:'自然人资产或收入证明',requirement:'按示例模板核对金融资产不低于300万元、最近三年个人年均收入不低于50万元及普通投资者双录要求。两项关系与适用分类须人工确认，不自动合并为通过条件。',quote:'金融资产不低于300万；最近三年个人年均收入不低于50万元',source}]:[])];
 });
 const customRequirements=requirements.filter(r=>r.source?.origin==='custom_template').map(r=>({name:r.name??'已导入附件',required:r.required===true,condition:r.condition??'',source:{kind:'custom_template' as const,title:r.source!.templateSnapshot?.title??'已发布自定义模板',templateId:r.source!.templateId,version:r.source!.version,path:r.source!.path,sha256:r.source!.sha256},applicability:'本次导入已由经办人核定适用'}));
 const unresolved:string[]=[];
 if(!kind)unresolved.push('请先核对投资者类型。');
 if(!templates.length&&!customRequirements.length)unresolved.push('请先选择适用的托管或无托管资料清单；未选择不默认套用评分和资产标准。');
 let declaredScaleCheck:{value:string;result:string}|undefined;
 if(kind==='product'){
  rules.push({name:'产品成立规模',requirement:'仅私募基金或资产管理计划投资者适用：成立规模不低于（含）人民币1000万元。先核对产品类别及成立时点，不用当前规模替代成立规模。',quote:'私募基金或者资产管理计划投资者，成立规模不得低于（含）人民币1000万元',source:suitabilityProductSource});
  const scale=(investor as any).profile?.fields?.scale,amount=explicitCny(scale);
  declaredScaleCheck={value:typeof scale==='string'?scale:'未填写',result:amount===undefined?'币种或单位不明确，待核对':amount<1000000000n?'登记规模低于示例模板门槛，待核对适用类别和成立规模':'登记规模达到示例模板数值门槛，仍须核对适用类别、成立规模和示例模板'};
  if(!customRequirements.length)unresolved.push('示例模板未单列产品型LP基础附件；可在系统设置的业务模板中自定义配置，再在当前LP募集导入适用要求。');
 }
 if(!customRequirements.length&&(kind==='product'||kind==='institution'))unresolved.push('示例模板未明确授权经办人证件附件的适用条件；可在LP业务模板中配置条件后逐项选用，不能仅凭经办人字段已填写认定附件齐全。');
 if(customRequirements.length)unresolved.push('当前附件按本次导入的已发布自定义模板及人工适用决策核对；不自动证明公司法规、适当性规则或附件范围已全部覆盖。');
 return {customRequirements,kind:kind??null,scope:'所选示例模板的辅助核查，不是自动合规结论',rules,unresolved,...(declaredScaleCheck?{declaredScaleCheck}:{}),decision:'requires_human_review' as const};
}
