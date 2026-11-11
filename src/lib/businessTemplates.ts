import type {CustomSchema} from './customFields.ts';
export type PublishedTemplate={id:string;objectType?:string;status?:string;enabled?:boolean;fields?:{id:string;enabled?:boolean}[]};
export function activeBusinessTemplates<T extends PublishedTemplate>(templates:T[],kind:string){return templates.filter(t=>t.objectType===kind&&t.status==='published'&&t.enabled!==false);}
export function historicalTemplateValues(templates:PublishedTemplate[],values:Record<string,string|boolean|null>){const activeKeys=new Set(templates.flatMap(t=>(t.fields??[]).filter(f=>f.enabled!==false).map(f=>t.id+':'+f.id)));return Object.entries(values).filter(([key])=>!activeKeys.has(key));}

export function sameTemplateStage(left:string|undefined,right:string|undefined){return left===right||['投后','投后管理'].includes(left??'')&&['投后','投后管理'].includes(right??'');}

// Preview only the selected definition; never merge other templates into this canvas.
export function templatePreviewSchema(template:{version?:number;fields?:{id:string;label:string;type:string;required?:boolean;enabled?:boolean;options?:string[]}[]}):CustomSchema{
 return {schemaRevision:template.version??0,fields:(template.fields??[]).map((field:any,order:number)=>({id:field.id,label:field.label,type:field.type==='choice'?'singleChoice':field.type,order,required:Boolean(field.required),enabled:field.enabled!==false,options:(field.options??[]).map((label:string)=>({id:label,label,enabled:true}))}))};
}
