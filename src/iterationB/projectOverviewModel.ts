import type {ApprovalState} from '../lib/apiClient.ts';
import type {DiligenceCase} from '../lib/diligenceTypes.ts';

export function overviewRequirements(diligence:DiligenceCase|null){
 return (diligence?.items??[]).map(item=>{
  const submission=[...item.submissions].sort((a,b)=>b.version-a.version)[0];
  const missing=item.requirements.filter(requirement=>!submission?.evidence.some(evidence=>evidence.requirementId===requirement.id));
  const unreadable=item.requirements.filter(requirement=>submission?.evidence.some(evidence=>evidence.requirementId===requirement.id&&Boolean(evidence.material.readIssue)));
  return {id:item.id,taskId:item.taskId,title:item.title,required:item.requirements.length,missing:missing.length,unreadable:unreadable.length,status:item.status,version:submission?.version};
 });
}
export function overviewApprovalBlocks(approvals:ApprovalState){
 const current=new Map<string,ApprovalState['rounds'][number]>();
 for(const round of approvals.rounds){const previous=current.get(round.meetingType);if(!previous||round.attempt>previous.attempt||round.attempt===previous.attempt&&round.createdAt>previous.createdAt)current.set(round.meetingType,round);}
 return [...current.values()].filter(round=>round.status==='returned'||round.status==='rejected');
}
