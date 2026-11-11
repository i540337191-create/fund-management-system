export type MaterialReference={name:string;downloadHref?:string;readIssue?:string};
export function materialReferencePresentation(material:MaterialReference){
 if(material.readIssue==='lp_privacy_forbidden')return {href:null,label:'LP资料受限 · 当前角色不可查看',title:'此处保留资料引用，原件和正文按角色授权查看。'};
 if(material.readIssue==='material_privacy_unknown')return {href:null,label:'资料关联待核实 · 暂不可查看',title:'请由有权限的人员核对这份资料的关联。'};
 if(material.readIssue||!material.downloadHref)return {href:null,label:`原件暂不可读 · ${material.name}`,title:'请核对资料关联与原件状态。'};
 return {href:material.downloadHref,label:material.name,title:undefined};
}
export function hasMaterialReadRestrictions(value:unknown):boolean{
 if(typeof value==='string')return value.includes('[LP信息已脱敏]')||value.includes('[资料关联待核实]');
 if(!value||typeof value!=='object')return false;
 return Boolean('readIssue' in value&&value.readIssue)||Object.values(value).some(hasMaterialReadRestrictions);
}
