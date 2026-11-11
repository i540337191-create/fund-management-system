import {randomUUID} from 'node:crypto';
import {object,string,fail} from './workflow.ts';
import type {LpProfileKind} from './lp-profile.ts';
export function templateMaterial(value:unknown) {
 const m=object(value,['id','title','required','condition','instructions','applicableTo']);
 if(m.required!==undefined&&typeof m.required!=='boolean')fail('invalid_template_material');
 if(m.applicableTo!==undefined&&(!Array.isArray(m.applicableTo)||m.applicableTo.length>3||new Set(m.applicableTo).size!==m.applicableTo.length||m.applicableTo.some(k=>!['natural','institution','product'].includes(String(k)))))fail('invalid_template_material_scope');
 return {id:string(m.id??randomUUID(),true,100),title:string(m.title,true,200),required:m.required===true,condition:string(m.condition??'',false,1000),instructions:string(m.instructions??'',false,2000),...(m.applicableTo!==undefined?{applicableTo:m.applicableTo as LpProfileKind[]}:{})};
}
