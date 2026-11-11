import {useFundOverviewCounts} from '../iterationB/useFundOverviewCounts';
import type {Fund} from '../data/funds';
import type {Project} from '../data/projects';
import {useAgentWorkspace} from '../lib/agentWorkspaceClient';
import {isOpenWorkspaceTask,matchesTaskFund} from '../lib/taskFundScope';
import {isManagedProject,isHistoricalAsset} from '../lib/projectAssetHistory';
import {StatCard} from './ui';
import {navigate} from './Layout';
export function FundOverviewMetrics({fund,projects}:{fund:Fund;projects:Project[]}){
 const counts=useFundOverviewCounts(fund,projects);
 const workspace=useAgentWorkspace(),ready=Boolean(workspace.state)&&!workspace.error;
 const open=workspace.state?.tasks.filter(task=>isOpenWorkspaceTask(task)&&matchesTaskFund(task,fund.id,[])).length;
 return <><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
  <StatCard label="在管主归属项目" value={String(projects.filter(isManagedProject).length)} hint={`历史资产 ${projects.filter(isHistoricalAsset).length} 个，联合出资见投资项目页`} tone="navy"/>
  <StatCard label="投资者" value={counts.investors===undefined?'—':String(counts.investors)} hint="当前可见LP登记数量；不按主档历史标签推算" tone="gold"/>
  <StatCard label="待办事项" value={ready?String(open):'—'} hint="当前基金 · 统一未完成任务" tone="orange" onClick={ready?()=>navigate('/tasks?fund='+encodeURIComponent(fund.id)):undefined}/>
  <StatCard label="未处理项目风险" value={counts.risks===undefined?'—':String(counts.risks)} hint={counts.riskError?'风险读取失败，请重试':counts.risks===undefined?'正在读取主归属项目风险':'主归属项目未处理风险；联合出资另核'} tone="red"/>
 </div><p role={workspace.error||counts.riskError?'alert':'status'} className="h-16 overflow-y-auto text-sm text-[var(--secondary)]">{counts.riskError?<button type="button" data-ui="secondary" onClick={counts.refreshRisks}>重读基金项目风险</button>:null}{workspace.error?<>统一待办读取失败，未判定数量。<button type="button" data-ui="secondary" onClick={()=>void workspace.refresh().catch(()=>{})}>重试统一待办</button></>:!workspace.state?'正在读取统一待办…':''}</p></>;
}
