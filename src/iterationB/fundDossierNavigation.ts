export const fundDossierTabs=['概览','募集档案','投资项目','账户资金','费用流水','投后报告','资料档案','条款监控','基金事务','操作日志'] as const;
export function fundFeeSection(search=window.location.search):string{return new URLSearchParams(search).has('feeId')?'fees':'ledger';}
export function fundDossierTab(query:URLSearchParams):string{
 const requested=query.get('tab');
 if(requested==='文档模板')return '募集档案';
 if(requested==='基金运营')return query.has('feeId')?'费用流水':query.get('lifecycleAction')==='capital'?'账户资金':'基金事务';
 return fundDossierTabs.includes(requested as typeof fundDossierTabs[number])?requested!:'概览';
}
export function fundNextActionTab(text:string):string{
 if(/报告/.test(text))return '投后报告';
 if(/费用|管理费/.test(text))return '费用流水';
 if(/募集|实缴|投资者/.test(text))return '募集档案';
 if(/账户|回单|余额/.test(text))return '账户资金';
 if(/条款/.test(text))return '条款监控';
 if(/备案|披露|清算/.test(text))return '基金事务';
 if(/项目|投资/.test(text))return '投资项目';
 return '资料档案';
}
