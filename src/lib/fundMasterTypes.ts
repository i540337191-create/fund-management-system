import type {CustomWrite} from "./customFields.ts";
import type {Fund,FundStage} from '../data/funds';
import type {AuditEvent} from './auditTrail';
export type FundManager={id:string;name:string;email:string;role:string;enabled:boolean};
export type FundMasterInput=CustomWrite & {requestId:string;name:string;shortName:string;managerId:string;stage:FundStage;scale:string;nextAction:string};
export type FundMasterResult={fund:Fund;auditEvent:AuditEvent;created:boolean};
export const fundStages:FundStage[]=['募集期','投资期','投后管理','退出期'];
export function canManageFunds(role?:string){return role==='admin'||role==='investment_manager';}

export function resolveIntakeFundId(item:{suggestedFund:string;suggestedFundId?:string|null},funds:Fund[]){
 if(item.suggestedFundId)return funds.some(f=>f.id===item.suggestedFundId)?item.suggestedFundId:'';
 const matches=funds.filter(f=>f.id===item.suggestedFund||f.name===item.suggestedFund||f.shortName===item.suggestedFund);
 return matches.length===1?matches[0].id:'';
}

export function selectedIntakeFund<T extends {suggestedFund:string;suggestedFundId?:string|null}>(item:T,funds:Fund[]){
 const id=resolveIntakeFundId(item,funds);
 return id?{...item,suggestedFundId:id}:undefined;
}
