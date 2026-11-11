import type {CustomData,CustomWrite} from "./customFields.ts";
export type CompanyInput=CustomWrite & {name:string;shortName:string;industry:string};
export type Company=CompanyInput & CustomData & {id:string;revision:number;dataOrigin?:string};
export type CompanyBinding={mode:'unbound'|'existing'|'new';companyId:string;newCompany:CompanyInput};
export type ProjectMasterInput=CustomWrite & {requestId:string;expectedRevision:number;name:string;shortName:string;industry:string;description:string;companyId?:string;newCompany?:CompanyInput};
export function emptyCompanyBinding():CompanyBinding{return {mode:'unbound',companyId:'',newCompany:{name:'',shortName:'',industry:''}};}
export function companyBindingPayload(binding:CompanyBinding):{companyId?:string;newCompany?:CompanyInput}{
 if(binding.mode==='unbound')return {};
 if(binding.mode==='existing'){if(!binding.companyId)throw Error('请明确选择已有企业。');return {companyId:binding.companyId};}
 const {name,shortName,industry}=binding.newCompany;
 if(!name.trim()||!shortName.trim())throw Error('请填写新企业名称与简称。');
 return {newCompany:{name:name.trim(),shortName:shortName.trim(),industry:industry.trim(),...(binding.newCompany.schemaRevision!==undefined?{schemaRevision:binding.newCompany.schemaRevision}:{}),...(binding.newCompany.customFields!==undefined?{customFields:binding.newCompany.customFields}:{})}};
}
export function canEditProjectMaster(role?:string){return role==='admin'||role==='investment_manager';}
