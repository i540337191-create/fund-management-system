import {object,string,fail} from './workflow.ts';
export const lpProfileFields = {
  "natural": {
    "gender": "性别",
    "age": "年龄",
    "identityType": "证件类型",
    "identityNumber": "证件号码",
    "nationality": "国籍",
    "occupation": "职业",
    "reservedBankName": "预留账户开户银行（基础证明）",
    "reservedBankAccount": "预留银行账号（基础证明）",
    "reservedAccountHolder": "预留账户户名（基础证明）",
    "bankProofClassification": "银行资料来源分类（账户复印件/打款回单/其他）",
    "position": "职务",
    "postalCode": "邮编",
    "address": "住址",
    "investmentExperience": "投资经历及依据",
    "controlRelationship": "实际控制关系及说明",
    "beneficialOwner": "交易实际受益人及说明",
    "integrityRecord": "不良诚信记录及说明",
    "assetDeclaration": "资产规模声明（原表勾选及依据）"
  },
  "institution": {
    "reservedBankName": "登记账户开户银行（选填：自行提供银行证明）",
    "reservedBankAccount": "登记银行账号（选填：自行提供银行证明）",
    "reservedAccountHolder": "登记账户户名（选填：自行提供银行证明）",
    "bankProofClassification": "银行资料来源分类（账户复印件/打款回单/其他，选填）",
    "organizationType": "机构类型",
    "identityType": "机构证件类型",
    "identityNumber": "机构证件编号",
    "identityExpiry": "证件有效期",
    "qualification": "机构资质证明",
    "qualificationNumber": "资质证书编号",
    "businessScope": "经营范围",
    "registeredAddress": "注册地址",
    "officeAddress": "办公地址",
    "registeredCapital": "注册资本",
    "controller": "控股股东或实际控制人",
    "professionalDeclaration": "原表专业投资者声明及依据",
    "representativeName": "法定代表或负责人姓名",
    "representativeGender": "法定代表或负责人性别",
    "representativeAge": "法定代表或负责人年龄",
    "representativeIdentityType": "法定代表或负责人证件类型",
    "representativeIdentityNumber": "法定代表或负责人证件号码",
    "representativePosition": "法定代表或负责人职务",
    "representativeEmail": "法定代表或负责人电子邮箱",
    "representativeIdentityExpiry": "法定代表或负责人证件有效期",
    "representativePhone": "法定代表或负责人联系方式",
    "representativePostalCode": "法定代表或负责人办公邮编",
    "representativeAddress": "法定代表或负责人办公地址",
    "agentName": "授权经办人姓名",
    "agentGender": "授权经办人性别",
    "agentAge": "授权经办人年龄",
    "agentIdentityType": "授权经办人证件类型",
    "agentIdentityNumber": "授权经办人证件号码",
    "agentPosition": "授权经办人职务",
    "agentEmail": "授权经办人电子邮箱",
    "agentIdentityExpiry": "授权经办人证件有效期",
    "agentPhone": "授权经办人联系方式",
    "agentPostalCode": "授权经办人办公邮编",
    "agentAddress": "授权经办人办公地址",
    "agentRelationship": "经办人与机构/产品关系",
    "controlRelationship": "实际控制关系及说明",
    "beneficialOwner": "交易实际受益人及说明",
    "integrityRecord": "不良诚信记录及说明",
    "assetDeclaration": "资产规模声明（原表勾选及依据）"
  },
  "product": {
    "reservedBankName": "登记账户开户银行（选填：自行提供银行证明）",
    "reservedBankAccount": "登记银行账号（选填：自行提供银行证明）",
    "reservedAccountHolder": "登记账户户名（选填：自行提供银行证明）",
    "bankProofClassification": "银行资料来源分类（自行提供资料，选填；不预设附件要求）",
    "productType": "产品类型",
    "filingAuthority": "备案机构",
    "establishedDate": "成立时间",
    "filingDate": "备案时间",
    "filingNumber": "产品备案编号",
    "duration": "存续期",
    "category": "产品类别",
    "scale": "产品规模",
    "custodian": "产品托管人",
    "managerName": "管理人名称",
    "managerOrganizationType": "管理人机构类型",
    "managerIdentityType": "管理人机构证件类型",
    "managerIdentityNumber": "管理人机构证件编号",
    "managerIdentityExpiry": "管理人证件有效期",
    "managerQualification": "管理人机构资质证明",
    "managerQualificationNumber": "管理人资质证书编号",
    "managerBusinessScope": "管理人经营范围",
    "managerRegisteredAddress": "管理人注册地址",
    "managerOfficeAddress": "管理人办公地址",
    "managerRegisteredCapital": "管理人注册资本",
    "managerController": "管理人控股股东或实际控制人",
    "managerProfessionalDeclaration": "管理人原表专业投资者声明及依据",
    "agentName": "授权经办人姓名",
    "agentGender": "授权经办人性别",
    "agentAge": "授权经办人年龄",
    "agentIdentityType": "授权经办人证件类型",
    "agentIdentityNumber": "授权经办人证件号码",
    "agentPosition": "授权经办人职务",
    "agentEmail": "授权经办人电子邮箱",
    "agentIdentityExpiry": "授权经办人证件有效期",
    "agentPhone": "授权经办人联系方式",
    "agentPostalCode": "授权经办人办公邮编",
    "agentAddress": "授权经办人办公地址",
    "agentRelationship": "经办人与机构/产品关系",
    "controlRelationship": "实际控制关系及说明",
    "beneficialOwner": "交易实际受益人及说明",
    "integrityRecord": "不良诚信记录及说明",
    "assetDeclaration": "资产规模声明（原表勾选及依据）",
    "professionalDeclaration": "原表产品类别声明及依据"
  }
} as const;
export type LpProfileKind=keyof typeof lpProfileFields;
export type LpProfile={ [K in LpProfileKind]:{kind:K;fields:Partial<Record<keyof typeof lpProfileFields[K],string>>;extraFields?:Record<string,string|boolean|null>;templateRefs?:{id:string;version:number}[]} }[LpProfileKind];
export function parseLpProfile(value:unknown):LpProfile{const p=object(value,['kind','fields','extraFields','templateRefs']);if(typeof p.kind!=='string'||!Object.hasOwn(lpProfileFields,p.kind))fail('invalid_lp_profile');const labels=lpProfileFields[p.kind as LpProfileKind];const fields=object(p.fields,Object.keys(labels));for(const k of Object.keys(fields)){fields[k]=string(fields[k],false,2000);if(/[\x00-\x1f\x7f]/.test(String(fields[k])))fail('invalid_lp_profile');}const result={kind:p.kind,fields} as LpProfile;if(p.extraFields!==undefined){if(!p.extraFields||typeof p.extraFields!=='object'||Array.isArray(p.extraFields)||Object.keys(p.extraFields).length>1000)fail('invalid_lp_profile');result.extraFields={};for(const [key,v] of Object.entries(p.extraFields)){if(key.length>220||/[\x00-\x1f\x7f]/.test(key)||!['string','boolean'].includes(typeof v)&&v!==null)fail('invalid_lp_profile');result.extraFields[key]=typeof v==='string'?string(v,false,10000):v as boolean|null;}}if(p.templateRefs!==undefined){if(!Array.isArray(p.templateRefs)||p.templateRefs.length>100)fail('invalid_lp_profile');result.templateRefs=p.templateRefs.map(v=>{const ref=object(v,['id','version']);if(!Number.isSafeInteger(ref.version)||Number(ref.version)<1)fail('invalid_lp_profile');return {id:string(ref.id,true,100),version:Number(ref.version)};});if(new Set(result.templateRefs.map(r=>r.id)).size!==result.templateRefs.length)fail('invalid_lp_profile');}return result;}

export function investorProfileKind(investor:{type:string;profile?:LpProfile}):LpProfileKind|undefined{return investor.profile?.kind??({'自然人':'natural','自然人投资者':'natural','机构':'institution','机构投资者':'institution','产品':'product','产品投资者':'product'} as Record<string,LpProfileKind>)[investor.type];}
export type LpExtraValue=string|boolean|null;
export type LpTemplateRef={id:string;version:number};
export type LpTemplateShape={enabled?:boolean;id:string;version:number;status:string;objectType:string;scope:string;ownerId:string;fields:{id:string;label:string;type:string;required:boolean;enabled:boolean;options?:string[]}[]};
const absent=(v:unknown)=>v===undefined||v===null||v==='';
export function validateLpTemplateProfile(body:Record<string,unknown>,templates:LpTemplateShape[],previous?:{profile?:LpProfile}){
 const active=templates.filter(t=>t.objectType==='lp'&&t.status==='published'&&t.enabled!==false);
 const p=body.profile as LpProfile|undefined,fields=active.flatMap(t=>t.fields.filter(f=>f.enabled).map(f=>({...f,key:t.id+':'+f.id})));
 if(p&&p.extraFields===undefined&&p.templateRefs!==undefined)fail('invalid_lp_profile');
 if(!p||p.extraFields===undefined){if(!previous&&fields.some(f=>f.required))fail('lp_custom_fields_required');return;}
 const expected=active.map(t=>({id:t.id,version:t.version})).sort((a,b)=>a.id.localeCompare(b.id)),actual=[...(p.templateRefs??[])].sort((a,b)=>a.id.localeCompare(b.id));
 if(JSON.stringify(expected)!==JSON.stringify(actual))fail('lp_template_version_conflict',409);
 for(const [key,value] of Object.entries(p.extraFields)){
  const f=fields.find(f=>f.key===key);
  if(!f){if(previous?.profile?.extraFields&&Object.hasOwn(previous.profile.extraFields,key)&&previous.profile.extraFields[key]===value)continue;fail('unknown_lp_custom_field');}
  if(value===null||value==='')continue;
  if(f.type==='boolean'){if(typeof value!=='boolean')fail('invalid_lp_custom_value');}
  else if(typeof value!=='string')fail('invalid_lp_custom_value');
  else if(f.type==='number'&&(value.length>100||!/^[-+]?\d+(?:\.\d+)?$/.test(value)))fail('invalid_lp_custom_value');
  else if(f.type==='date'&&(!/^\d{4}-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))fail('invalid_lp_custom_value');
  else if(f.type==='choice'&&!f.options?.includes(value))fail('invalid_lp_custom_value');
 }
 for(const f of fields)if(f.required&&absent(p.extraFields[f.key])&&(!previous||!absent(previous.profile?.extraFields?.[f.key])))fail('lp_custom_fields_required');
}
