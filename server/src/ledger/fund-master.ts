import {negativeFinancialValue} from './business-value-checks.ts';
import {customInput,validateCustom,type CustomData,type Schemas} from './custom-fields.ts';
import { randomUUID } from 'node:crypto';
import type { Fund, AuditEvent, LedgerStore } from './store.ts';
import type { StoredUser } from './workflow.ts';
export type FundInput = CustomData & {requestId:string;name:string;shortName:string;managerId:string;stage:string;scale:string;nextAction:string;expectedRevision?:number};
export type FundResult = {fund:Fund;auditEvent:AuditEvent;created:boolean};
export type FundMasterState = {schemas:Schemas;funds:Fund[];users:StoredUser[];receipts:Record<string,{fingerprint:string;result:FundResult}>;auditEvents:AuditEvent[]};
export class FundWriteError extends Error {
  code:string;status:number;fields:string[];latest?:Fund;
  constructor(code:string,status=400,fields:string[]=[],latest?:Fund){super(code);this.code=code;this.status=status;this.fields=fields;this.latest=latest;}
}
export function normalizeFundInput(value:unknown,update=false):FundInput {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new FundWriteError('invalid_fund_payload');
  const body=value as Record<string,unknown>;
  const limits={requestId:36,name:200,shortName:100,managerId:200,stage:100,scale:500,nextAction:2000};
  const keys=Object.keys(limits) as (keyof typeof limits)[];
  const invalid=keys.filter(k=>typeof body[k]!=='string'||(body[k] as string).length>limits[k]||(body[k] as string).includes('\0')) as string[];
  invalid.push(...Object.keys(body).filter(k=>!Object.hasOwn(limits,k)&&!(update&&k==='expectedRevision')&&!['customFields','schemaRevision'].includes(k)));
  if(update&&(!Number.isSafeInteger(body.expectedRevision)||(body.expectedRevision as number)<1))invalid.push('expectedRevision');
  if(invalid.length)throw new FundWriteError('invalid_fund_payload',400,invalid);
  const input=Object.fromEntries(keys.map(k=>[k,(body[k] as string).trim()])) as unknown as FundInput;
  const empty=['name','shortName','managerId','stage'].filter(k=>!input[k as keyof FundInput]);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId))empty.push('requestId');
  if(!['募集期','投资期','投后管理','退出期'].includes(input.stage))empty.push('stage');
  if(negativeFinancialValue(input.scale))empty.push('scale');
  if(empty.length)throw new FundWriteError('invalid_fund_payload',400,empty);
  input.requestId=input.requestId.toLowerCase();if(update)input.expectedRevision=body.expectedRevision as number;
  return Object.assign(input,customInput(body));
}
function fundDto(fund:Fund):Fund {
  const {id,name,shortName,managerId,revision,stage,manager,scale,paidIn,invested,balance,projectCount,investorCount,openTasks,riskCount,nextAction,updatedAt,dataOrigin,createdAt}=fund;
  return {...customInput(fund as unknown as Record<string,unknown>),...(createdAt?{createdAt}:{}),id,name,shortName,managerId:managerId??null,revision:revision??1,stage,manager,scale,paidIn,invested,balance,projectCount,investorCount,openTasks,riskCount,nextAction,updatedAt,dataOrigin};
}
export function writeFund(store:LedgerStore,value:unknown,actor:{id:string;name:string},id?:string) {
  const input=normalizeFundInput(value,id!==undefined);
  return store.fundTransaction(s=>{
    const fingerprint=JSON.stringify({actorId:actor.id,id:id??null,input});
    const receipt=s.receipts[input.requestId];
    if(receipt){if(receipt.fingerprint!==fingerprint)throw new FundWriteError('fund_request_conflict',409);return structuredClone({...receipt.result,created:false});}
    const current=id?s.funds.find(f=>f.id===id):undefined;
    if(id&&!current)throw new FundWriteError('fund_not_found',404);
    if(current&&(current.revision??1)!==input.expectedRevision)throw new FundWriteError('fund_revision_conflict',409,[],fundDto(current));
    const manager=s.users.find(u=>u.id===input.managerId&&u.enabled!==false);
    if(!manager)throw new FundWriteError('invalid_fund_manager',400,['managerId']);
    const now=new Date().toISOString();
    const fund:Fund={...(current?fundDto(current):{id:`fund-${randomUUID()}`,paidIn:'待确认',invested:'待确认',balance:'待确认',projectCount:0,investorCount:0,openTasks:0,riskCount:0,dataOrigin:'user_input'}),...validateCustom(s.schemas.fund,input,current,input.stage),name:input.name,shortName:input.shortName,managerId:manager.id,manager:manager.name,stage:input.stage,scale:input.scale,nextAction:input.nextAction,revision:(current?.revision??(current?1:0))+1,updatedAt:new Date(now).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"})};
    const auditEvent:AuditEvent={id:`audit-${randomUUID()}`,module:'基金账本',action:current?'修改基金主档':'新增基金',targetType:'基金',targetId:fund.id,targetName:fund.name,actor:actor.name,time:now,detail:JSON.stringify({actorId:actor.id,requestId:input.requestId,before:current?fundDto(current):null,after:fund}),source:'基金主档',dataOrigin:'user_input'};
    if(current)s.funds[s.funds.indexOf(current)]=fund;else s.funds.unshift(fund);
    s.auditEvents.push(auditEvent);
    const result={fund,auditEvent,created:!current};
    s.receipts[input.requestId]={fingerprint,result:structuredClone(result)};
    return structuredClone(result);
  });
}
