import type { ApprovalState, ApiClient } from './apiClient';
import type { DealBatch } from './dealTypes';
import type {DiligenceCase} from './diligenceTypes';
import type {AssetHistoryView} from './assetHistoryTypes';
import type {ExitSettlementView} from './exitSettlementTypes';
import type { ProjectTask } from './workbenchLogic';
export const progressStages = ['立项会', '总办会', '投委会', '交易交割', '投后管理'] as const;
export type ProgressSnapshot = { approvals?: ApprovalState; deals?: DealBatch[];diligence?:DiligenceCase|null;asset?:AssetHistoryView;exit?:ExitSettlementView; error?: string;restricted?:boolean };
export type ProgressNode = 'complete'|'current'|'pending'|'returned'|'rejected'|'unknown';
export function projectProgress(snapshot: ProgressSnapshot | undefined, tasks: ProjectTask[]) {
  const nodes: ProgressNode[] = progressStages.map(() => 'pending');
  if(snapshot?.restricted)return {nodes:progressStages.map(()=>'unknown' as const),stage:'权限受限',due:'',dueSource:'',note:'当前账号无权读取完整交易流程',nextAction:'当前账号无权读取完整交易流程',actionTab:'项目概览'};
  if (!snapshot || snapshot.error) return { nodes: progressStages.map(() => 'unknown' as const), stage: snapshot?.error ? '读取失败' : '读取中', due: '', dueSource: '', note: snapshot?.error ?? '',nextAction:snapshot?.error?'流程读取失败，请重试':'正在核验实际流程',actionTab:'项目概览' };
  const rounds = snapshot.approvals?.rounds ?? [];
  const latest = progressStages.slice(0,3).map(name => rounds.filter(round => round.meetingType === name).sort((a,b) => b.attempt-a.attempt || b.createdAt.localeCompare(a.createdAt))[0]);
  latest.forEach((round,index) => { if (round) nodes[index] = round.status === 'approved' ? 'complete' : round.status === 'pending' ? 'current' : round.status; });
  const closed = snapshot.deals?.find(deal => deal.closing && deal.status === 'closed');
  const active = snapshot.deals?.find(deal => deal.status === 'active');
  let current = latest.findIndex(round => round && round.status !== 'approved');
  if (closed) { nodes[3]='complete'; nodes[4]='current'; current=4; }
  else if (active || latest[2]?.status === 'approved') { nodes[3]='current'; current=3; }
  else if (current < 0) current = latest.findIndex(round => !round);
  // A not-yet-submitted meeting is upcoming, not a completed or active approval.
  const stage = current < 3 && latest.every(round => !round) ? '未发起' : progressStages[current < 0 ? 3 : current];
  const roundDue = current >= 0 && current < 3 && latest[current]?.status === 'pending' ? latest[current]?.dueDate : '';
  const taskDue = tasks.filter(task => !['已完成','已取消'].includes(task.status) && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)).map(task => task.dueDate).sort()[0] ?? '';
  const currentRound=current>=0&&current<3?latest[current]:undefined;
  let nextAction=closed?'核对投后经营与履约事项':active?'办理当前交易批次与交割':current===3?'发起投资交易批次':!currentRound?`发起${progressStages[Math.max(0,current)]}审批`:currentRound.status==='returned'?`${currentRound.meetingType}已退回，核对意见后重新提交`:currentRound.status==='rejected'?`${currentRound.meetingType}已否决，请核对决策意见`:`办理${currentRound.meetingType}审批`;
  let actionTab=closed?'投后经营':current>=3?'投资信息':'三会审批';
  let actualStage:string=stage;
  const diligence=snapshot.diligence;
  if(!closed&&!active&&diligence&&diligence.status!=='approved'){actualStage='尽调办理';actionTab='尽调分析';nextAction=diligence.status==='rejected'?'尽调已否决，请核对意见':diligence.status==='pending'?'审核尽调报告与发现事项':'补齐尽调清单与发现事项';}
  if(snapshot.asset?.status==='exited'||snapshot.asset?.status==='legacy_exited'){actualStage=snapshot.asset.archiveCurrent?'退出已归档':'历史退出待核验';actionTab='投资信息';nextAction=snapshot.asset.openClaimCount?'处理历史资产追索事项':snapshot.asset.archiveCurrent?'查看退出归档与回款依据':'核对历史退出原件与结算依据';if(snapshot.asset.archiveCurrent)nodes[4]='complete';}
  else if(snapshot.asset?.status==='exiting'||snapshot.exit?.executions.some(e=>e.status==='recorded')){actualStage='退出办理';actionTab='投资信息';nextAction=snapshot.exit?.positions.some(p=>p.outstanding!==null&&Number(p.outstanding)>0)?'核对退出回款与未收对价':'核对退出执行与结算依据';}
  return { nodes, stage:actualStage,nextAction,actionTab, due: roundDue || taskDue, dueSource: roundDue ? '当前审批截止' : taskDue ? '最近待办截止' : '', note: closed && active ? '已进入投后，另有交易批次进行中' : '' };
}

export async function readProjectProgress(api: Pick<ApiClient, 'getApprovals'|'getDeals'> & Partial<Pick<ApiClient,'getDiligence'|'getProjectAssetHistory'|'getExitSettlement'>>, projectId: string, timeoutMs = 12000, parentSignal?: AbortSignal): Promise<ProgressSnapshot> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) throw new DOMException('流程读取已取消', 'AbortError');
  parentSignal?.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.all([api.getApprovals(projectId, controller.signal), api.getDeals(projectId, controller.signal),api.getDiligence?.(projectId,controller.signal),api.getProjectAssetHistory?.(projectId,true,controller.signal),api.getExitSettlement?.(projectId,true,controller.signal)]).then(([approvals, result,diligence,asset,exit]) => ({ approvals, deals: result.deals,...(diligence?{diligence:diligence.diligence}:{}),...(asset?{asset}:{}),...(exit?{exit}:{}) })),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(new Error('流程读取超时，请重试')); controller.abort(); }, timeoutMs); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
    controller.abort();
  }
}

export function needsInitialChecklist(snapshot:ProgressSnapshot|undefined){return snapshot?.diligence===null&&projectProgress(snapshot,[]).stage==='未发起';}
