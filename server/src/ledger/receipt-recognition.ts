import {date} from './workflow.ts';
import {units,fixed} from './exit-settlement.ts';
export type ReceiptSuggestion={field:string;value:string;page:number;excerpt:string};
// Only labeled fields are suggested; multiple different matches remain unresolved for human review.
export function recognizeReceipt(pages:{page:number;text:string}[]){
 const candidates:ReceiptSuggestion[]=[];
 const patterns:Record<string,RegExp>={amount:/(?:交易金额|收款金额|付款金额|小写金额|金额[（(]小写[）)]|金额)\s*[:：]?\s*(?:人民币|CNY|RMB|[￥¥])?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d.])/g,date:/(?:交易日期|记账日期|入账日期|付款日期|收款日期|日期)\s*[:：]?\s*(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)/g,reference:/(?:交易流水号|银行流水号|流水号|回单编号|回单号)\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,100})/g,purpose:/(?:摘要|用途|附言)\s*[:：]\s*([^\r\n]{1,200})/g,counterparty:/(?:交易对手|对方户名)\s*[:：]\s*([^\r\n]{1,200})/g,payer:/(?:付款人名称|付款方名称|付款人户名)\s*[:：]\s*([^\r\n]{1,200})/g,payee:/(?:收款人名称|收款方名称|收款人户名)\s*[:：]\s*([^\r\n]{1,200})/g,direction:/(?:收支类型|收支方向|收支标志)\s*[:：]?\s*(收入|支出)/g};
 for(const page of pages)for(const [field,regex] of Object.entries(patterns)){regex.lastIndex=0;for(const m of page.text.matchAll(regex)){let value=m[1].trim();try{if(field==='amount')value=fixed(units(value.replaceAll(',','')));if(field==='date'){const parts=value.match(/\d+/g)!;value=date(`${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`);}if(field==='direction')value=value==='收入'?'in':'out';candidates.push({field,value,page:page.page,excerpt:m[0].slice(0,240)});}catch{ /* Invalid source text remains absent instead of guessing. */ }}}
 const suggestions:Record<string,ReceiptSuggestion>={},ambiguous:string[]=[];for(const field of Object.keys(patterns)){const matches=candidates.filter(c=>c.field===field);if(new Set(matches.map(c=>c.value)).size===1)suggestions[field]=matches[0];else if(matches.length)ambiguous.push(field);}
 return {suggestions,ambiguous,requiresHumanReview:true};
}
