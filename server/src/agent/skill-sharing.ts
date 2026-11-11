import type {Skill} from './model.ts';
import {WorkflowError} from '../ledger/workflow.ts';
export function credentialLikeContent(text:string){return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|\bBearer\s+[A-Za-z0-9_+/.=-]{16,}/i.test(text);}
export function assertReusableSkill(skill:Skill,reviewed:unknown){
 if(skill.materialIds?.length)throw new WorkflowError('skill_share_business_sources',409);
 if(credentialLikeContent(skill.instructions+'\n'+skill.description))throw new WorkflowError('skill_share_sensitive_content',400);
 if(reviewed!==true)throw new WorkflowError('skill_share_review_required',400);
}
