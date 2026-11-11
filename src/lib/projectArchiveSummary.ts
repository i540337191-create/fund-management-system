import type {ApiClient} from './apiClient';
export type ArchiveData={
 detail?:Awaited<ReturnType<ApiClient['getProject']>>;
 diligence?:Awaited<ReturnType<ApiClient['getDiligence']>>['diligence'];
 approvals?:Awaited<ReturnType<ApiClient['getApprovals']>>;
 deals?:Awaited<ReturnType<ApiClient['getDeals']>>['deals'];
 post?:Awaited<ReturnType<ApiClient['getPostInvestment']>>;
 reports?:Awaited<ReturnType<ApiClient['getReports']>>['reports'];
};
export const archiveSources:Record<string,(keyof ArchiveData)[]>={
 '尽调与决策':['diligence','approvals','reports'],'投资与协议':['deals'],'投后管理':['post'],'风险与履约':['detail','post'],'项目文档':['detail','post','reports'],'任务待办':['detail'],'资金事项':['detail'],
};
type Step={label:string;value:string;view:string};
export function archiveSummary(module:string,data:ArchiveData){
 const step=(label:string,value:string,view:string):Step=>({label,value,view});
 const count=(n:number|undefined,unit='项')=>n===undefined?'待核对':`${n} ${unit}`;
 if(module==='尽调与决策'){
  const d=data.diligence,reports=data.reports?.filter(r=>r.type==='投决分析报告');
  const latest=['立项会','总办会','投委会'].map(type=>data.approvals?.rounds.filter(r=>r.meetingType===type).sort((a,b)=>b.attempt-a.attempt||b.createdAt.localeCompare(a.createdAt))[0]);
  const approval=data.approvals?latest.some(r=>r?.status==='rejected')?'有否决意见':latest.some(r=>r?.status==='returned')?'有退回意见':latest.some(r=>r?.status==='pending')?'审批中':latest.filter(r=>r?.status==='approved').length===3?'三会已通过':latest.some(Boolean)?'部分已办理':'未发起':'待核对';
  const diligence=d===undefined?'待核对':d===null?'未建档':{active:'办理中',pending:'待审核',approved:'已批准',rejected:'已否决'}[d.status];
  return{conclusion:d===null?'尚未建立尽调档案。先确认检查范围，再形成决策建议并办理审批。':`尽调${diligence}；决策建议${count(reports?.length,'份')}，${approval}。`,steps:[step('尽调分析',diligence,'尽调分析'),step('决策建议',count(reports?.length,'份'),'决策支持'),step('三会审批',approval,'三会审批')]};
 }
 if(module==='投资与协议'){
  const ds=data.deals,closed=ds?.filter(d=>Boolean(d.closing)&&d.status==='closed').length;
  return{conclusion:ds?ds.length?`已登记 ${ds.length} 个交易批次，${closed} 个已确认交割。请按批次核对协议签署、交割条件与付款凭证。`:'尚未建立交易批次。先登记投资要素，再办理协议签署与交割。':'交易记录待核对。',steps:[step('交易批次',count(ds?.length,'批'),'投资信息'),step('已签署协议',count(ds?.reduce((n,d)=>n+d.agreements.filter(a=>Boolean(a.signed)).length,0),'份'),'投资信息'),step('已确认交割',count(closed,'批'),'投资信息')]};
 }
 if(module==='投后管理'){
  const p=data.post,post=p?.postInvestment;
  return{conclusion:p?p.closedDeals.length?'先核对经营数据与审核状态，再记录走访、处理跟进并归集本期资料。':'尚无已确认交割批次。请先核对交易与交割档案。':'投后档案待核对。',steps:[step('经营数据',count(post?new Set(post.financials.map(r=>r.id)).size:undefined,'期'),'投后经营'),step('走访记录',count(post?new Set(post.visits.map(r=>r.id)).size:undefined,'份'),'走访记录'),step('期间档案',count(post?new Set(post.archives.map(r=>r.id)).size:undefined,'份'),'期间档案')]};
 }
 if(module==='风险与履约'){
  const risks=data.detail?.risks.filter(r=>!r.deletedAt&&r.status!=='已处理');
  const clauses=data.post?.postInvestment.clauses;const latest=new Map<string,NonNullable<typeof clauses>[number]>();for(const c of clauses??[]){if((latest.get(c.id)?.version??0)<c.version)latest.set(c.id,c);}
  const open=clauses?[...latest.values()].filter(c=>c.status==='active').length:undefined;
  return{conclusion:`待处理风险${count(risks?.length)}，待核对履约${count(open)}。请查阅来源、责任人与处理记录。`,steps:[step('未处理风险',count(risks?.length),'风险监控'),step('有效履约条件',count(open),'履约预警')]};
 }
 if(module==='项目文档')return{conclusion:data.detail?`已关联 ${data.detail.materials.length} 份原件。按原件、分类、报告与会议记录查阅，新增版本保留原有文件。`:'项目资料待核对。',steps:[step('原件管理',count(data.detail?.materials.length,'份'),'资料文件'),step('分类目录','分类查阅','资料目录'),step('项目报告',`通用 ${count(data.reports?.length,'份')} · 周期 ${count(data.post?new Set((data.post.postInvestment.reports??[]).map(r=>r.id)).size:undefined,'份')}`,'报告记录'),step('会议纪要',count(data.detail?.meetings.length,'份'),'会议纪要')]};
 if(module==='任务待办'){
  const tasks=data.detail?.tasks,open=tasks?.filter(t=>!['已完成','已取消'].includes(t.status));
  return{conclusion:tasks?`${open!.length} 项待办未完成。优先核对截止日，并从任务来源进入具体办理位置。`:'项目待办待核对。',steps:[step('全部待办',count(tasks?.length),'任务待办'),step('未完成',count(open?.length),'任务待办'),step('已完成',count(tasks?.filter(t=>t.status==='已完成').length),'任务待办')]};
 }
 const capital=data.detail?.capitalRecords;
 return{conclusion:capital?capital.length?`已登记 ${capital.length} 笔资金事项。请逐笔核对应收、实收、收款状态与来源凭据。`:'暂无项目资金事项。可登记本项目费用与收款事项，再留存核对凭据。':'资金事项待核对。',steps:[step('资金记录',count(capital?.length,'笔'),'资金事项'),step('待处理',count(capital?.filter(c=>c.status!=='已收').length,'笔'),'资金事项')]};
}
