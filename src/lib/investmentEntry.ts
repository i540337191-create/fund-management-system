import type {DealBatch} from './dealTypes';
export function investmentEntry(deal:DealBatch|undefined){
 if(!deal)return {action:'create',label:'录入投资信息',reason:'先建立投资批次，再录入金额、估值、持股比例和出资计划。'} as const;
 if(deal.status==='closed')return {action:'create',label:'新增投资批次',reason:'当前批次已交割，原金额和签署依据保留；追加投资请建立新批次。'} as const;
 const status=deal.terms[deal.terms.length-1]?.status;
 if(status==='pending')return {action:'blocked',label:'查看待审投资要素',reason:'投资要素正在审核，审核结束前不能修改。'} as const;
 if(status==='rejected')return {action:'blocked',label:'查看否决意见',reason:'当前投资要素已否决，请先核对审核意见。'} as const;
 return {action:'terms',label:status?'修改投资要素':'录入投资要素',reason:status==='approved'?'修改将保存为新版本，须重新审批；历史版本保留。':'录入或修订投资金额、估值、持股比例、交割日及各基金出资。'} as const;
}
