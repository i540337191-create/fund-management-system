import type {SessionUser} from '../auth/session.ts';
import type {ObjectPolicy} from '../auth/object-access.ts';
import type {Material} from '../ledger/store.ts';
import {canReadMaterial} from '../http/material-files.ts';
import {canReadLp} from '../ledger/lp-privacy.ts';
type Sourced={sourceMapping?:{materialId:string;lpSensitive?:boolean}};
export function templateSourceReadable(template:Sourced,materials:Material[],actor:SessionUser){
 if(!Object.hasOwn(template,'sourceMapping'))return true;
 if(!template.sourceMapping)return false;
 const source=materials.find(m=>m.id===template.sourceMapping!.materialId);
 return Boolean(source&&canReadMaterial(actor,source));
}
export function templateSourceAllowed(template:Sourced,policy?:ObjectPolicy){
 if(!Object.hasOwn(template,'sourceMapping'))return true;
 if(!template.sourceMapping)return false;
 return Boolean(policy&&policy.allowsKnown(template.sourceMapping.materialId)&&(!template.sourceMapping.lpSensitive||canReadLp(policy.actor)));
}
