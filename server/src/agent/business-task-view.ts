import type {Report,CapitalRecord,ProjectTask,Meeting,RiskRecord} from '../ledger/store.ts';
import type {WorkTask} from './model.ts';
import {businessDueAt,DEFAULT_REMIND_AHEAD_MINUTES} from './time.ts';
export function projectTaskDestination(t:ProjectTask):string {
 const q=new URLSearchParams({tab:'任务待办',taskId:t.id});
 if(t.kind==='review'&&t.relation==='returns'){
  q.set('tab','投资信息');try{const r=JSON.parse(t.note);if(['return_basis','return_sample','cashflow_review'].includes(r.sourceType)&&typeof r.sourceId==='string'&&Number.isSafeInteger(r.sourceVersion)&&r.sourceVersion>0&&/^[a-f0-9]{64}$/.test(r.contentHash)){q.set('returnRecordId',r.sourceId);q.set('returnVersion',String(r.sourceVersion));q.set('returnHash',r.contentHash);if(typeof r.dealId==='string')q.set('dealId',r.dealId);if(typeof r.fundId==='string')q.set('returnFundId',r.fundId);}}catch{}return `/projects/${encodeURIComponent(t.projectId)}?${q}#returns`;
 }
 if(t.kind==='review'){q.set('tab','三会审批');if(t.approvalRoundId)q.set('roundId',t.approvalRoundId);}
 if(t.kind==='diligence')q.set('tab','尽调分析');
 if(t.kind==='post_clause')q.set('tab',t.type==='退出方案审核'?'投资信息':t.type.startsWith('投后报告')?'报告记录':t.type==='投后审核'?'投后经营':'履约预警');
 return `/projects/${encodeURIComponent(t.projectId)}?${q}`;
}
// Source rows have already passed the store's object access policy.
export function projectTaskView(tasks:ProjectTask[],existing:WorkTask[]):WorkTask[]{
 const projected=tasks.map(t=>{
  const id='business:'+t.id,prior=existing.find(row=>row.id===id),dueAt=businessDueAt(t.dueDate);
  return {...prior,id,createdAt:t.createdAt??prior?.createdAt,sourceUnavailable:false,ownerId:t.ownerId??'',scope:'organization' as const,title:t.name,note:t.note||t.type,projectId:t.projectId,dueAt,dueBasis:t.dueDate?(dueAt?'日期型截止按北京时间当日结束':'原截止日期无效，请到来源任务核对'):undefined,remindAheadMinutes:prior?.remindAheadMinutes??DEFAULT_REMIND_AHEAD_MINUTES,status:t.status==='已完成'?'complete' as const:t.status==='已取消'?'cancelled' as const:'open' as const,priority:t.priority==='高'?'high' as const:t.priority==='低'?'low' as const:'normal' as const,source:'项目业务',sourceStatus:t.status,dataOrigin:t.dataOrigin,dataPurpose:t.dataPurpose,sourceBasis:t.sourceBasis,href:projectTaskDestination(t)};
 });
 return [...new Map([...existing,...projected].map(row=>[row.id,row])).values()];
}

export function otherBusinessTaskView(reports:Report[],capital:CapitalRecord[],meetings:Meeting[]=[],risks:RiskRecord[]=[]):WorkTask[]{
 const common={ownerId:'',scope:'organization' as const,remindAheadMinutes:DEFAULT_REMIND_AHEAD_MINUTES,status:'open' as const};
 return [...meetings.filter(m=>m.status==='待确认'&&!m.deletedAt&&m.scheduleStatus!=='cancelled').map(m=>({...common,id:'meeting:'+m.id,createdAt:m.createdAt,title:'确认会议纪要：'+m.title,note:m.summary,source:'会议纪要',sourceStatus:m.status,dataOrigin:m.dataOrigin,dataPurpose:m.dataPurpose,sourceBasis:m.sourceBasis,projectId:m.projectId??undefined,priority:'normal' as const,href:'/meetings?meetingId='+encodeURIComponent(m.id)})),...risks.filter(r=>!('deletedAt' in r&&r.deletedAt)&&['待跟进','待处理','处理中','未处理'].includes(r.status)).map(r=>({...common,id:'risk:'+r.id,title:r.title,note:r.summary,source:'风险跟进',sourceStatus:r.status,dataOrigin:r.dataOrigin,dataPurpose:r.dataPurpose,sourceBasis:r.sourceBasis,projectId:r.projectId??undefined,priority:r.level==='高'?'high' as const:'normal' as const,href:r.projectId?'/projects/'+encodeURIComponent(r.projectId)+'?'+new URLSearchParams({tab:'风险监控',riskId:r.id}):'/monitoring?riskId='+encodeURIComponent(r.id)})),...reports.filter(r=>['待审核','生成中'].includes(r.status)).map(r=>({...common,id:'report:'+r.id,createdAt:r.createdAt,title:r.name+r.status,note:r.target,source:'报告中心',sourceStatus:r.status,dataOrigin:r.dataOrigin,dataPurpose:r.dataPurpose,sourceBasis:r.sourceBasis,projectId:r.projectId??undefined,fundId:r.projectId?undefined:r.fundId??undefined,priority:'high' as const,href:'/reports?reportId='+encodeURIComponent(r.id)})),...capital.filter(c=>['逾期','未收'].includes(c.status)).map(c=>({...common,id:'capital:'+c.id,createdAt:c.createdAt,title:'资金事项待收：'+c.company,note:c.fund+' · '+c.status,source:'资金事项',sourceStatus:c.status,dataOrigin:c.dataOrigin,dataPurpose:c.dataPurpose,sourceBasis:c.sourceBasis,projectId:c.projectId??undefined,fundId:c.projectId?undefined:c.fundId,dueAt:businessDueAt(c.dueDate),dueBasis:'日期型截止按北京时间当日结束',priority:'high' as const,href:'/capital?'+new URLSearchParams(c.projectId?{projectId:c.projectId}:c.fundId?{fundId:c.fundId}:{})+'#capital-record-'+encodeURIComponent(c.id)}))];
}
