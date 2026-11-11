import {lpProfileFields,type LpProfile} from './lpProfile.ts';
export type LpIntakeMaster={name:string;type:string;contactName:string;contactPhone:string;contactEmail:string;profile?:LpProfile};
export type LpIntakeTemplate={id:string;fields?:{id:string;label:string;enabled:boolean;type:string;options?:string[]}[]};
export const lpIntakeCoreLabels={name:'LP名称',type:'投资者类型',contactName:'联系人',contactPhone:'联系电话',contactEmail:'联系邮箱'};
export function lpIntakeFields(master:LpIntakeMaster){return {...Object.fromEntries(Object.keys(lpIntakeCoreLabels).map(k=>[k,master[k as keyof typeof lpIntakeCoreLabels]])),...Object.fromEntries(Object.entries(master.profile?.fields??{}).map(([k,v])=>['profile.fields.'+k,v??''])),...Object.fromEntries(Object.entries(master.profile?.extraFields??{}).map(([k,v])=>['profile.extraFields.'+k,v==null?'':String(v)]))};}
export function lpIntakeLabels(profile:LpProfile|undefined,templates:LpIntakeTemplate[]){return {...lpIntakeCoreLabels,...Object.fromEntries(Object.entries(profile?lpProfileFields[profile.kind]:{}).map(([k,v])=>['profile.fields.'+k,v])),...Object.fromEntries(templates.flatMap(t=>(t.fields??[]).filter(f=>f.enabled).map(f=>['profile.extraFields.'+t.id+':'+f.id,f.label])))};}
export function applyLpIntake(master:LpIntakeMaster,next:Record<string,string>,templates:LpIntakeTemplate[]):LpIntakeMaster{
 const out=structuredClone(master);if(!out.profile)throw Error('请先选择自然人、机构或产品档案类别。');
 for(const [key,value] of Object.entries(next)){
  if(Object.prototype.hasOwnProperty.call(lpIntakeCoreLabels,key)){if(key==='type'){const kind=({'自然人':'natural','自然人投资者':'natural','机构':'institution','机构投资者':'institution','产品':'product','产品投资者':'product',natural:'natural',institution:'institution',product:'product'} as Record<string,string>)[value];if(kind!==out.profile.kind)throw Error('识别出的投资者类型与当前类别不一致，请先核对类别。');}out[key as keyof typeof lpIntakeCoreLabels]=key==='type'?({natural:'自然人',institution:'机构',product:'产品'} as Record<string,string>)[value]??value:value;continue;}
  if(key.startsWith('profile.fields.')){const id=key.slice(15);if(!Object.prototype.hasOwnProperty.call(lpProfileFields[out.profile.kind],id))throw Error('识别字段不属于当前投资者类别。');out.profile.fields={...out.profile.fields,[id]:value};continue;}
  if(!key.startsWith('profile.extraFields.'))throw Error('识别结果含未授权字段。');
  const id=key.slice(20),field=templates.flatMap(t=>(t.fields??[]).map(f=>({...f,key:t.id+':'+f.id}))).find(f=>f.key===id&&f.enabled);if(!field)throw Error('公司模板已变化，请重新核对识别字段。');
  let scalar:string|boolean|null=value;if(field.type==='boolean'){if(['true','是'].includes(value))scalar=true;else if(['false','否'].includes(value))scalar=false;else throw Error('请核对识别出的是否选项。');}else if(field.type==='choice'&&!field.options?.includes(value))throw Error('识别值不在公司模板选项中。');else if(field.type==='number'&&!/^[-+]?\d+(?:\.\d+)?$/.test(value))throw Error('请核对识别出的数值。');else if(field.type==='date'&&(!/^\d{4}-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw Error('请核对识别出的日期。');out.profile.extraFields={...out.profile.extraFields,[id]:scalar};
 }
 return out;
}
