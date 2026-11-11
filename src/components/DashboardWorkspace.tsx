import {dashboardConcerns,dashboardConcernAttention,type FundConcernFinding,type MaterialConcernFinding} from '../lib/dashboardConcerns';
import {risks as riskReferences} from '../data/risks';
import {filterSeedDemoRecords} from '../lib/dataOriginFilter';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import {DashboardScheduleDialog} from './DashboardScheduleDialog';
import {dashboardObjectOrder,dashboardPersonalSchedule,isManagedDashboardFund} from '../lib/dashboardSelection';
import {DashboardObjectIcon} from './DashboardObjectIcon';
import {RefreshButton} from '../iterationA/RefreshButton';
import './DashboardSummaryDialogs.css';
import {DashboardIceberg} from './DashboardIceberg';
import {dashboardTaskAction,dashboardTaskOrder,dashboardTaskRelation} from '../lib/dashboardTaskPresentation';
import {DashboardTaskOverview} from './DashboardTaskOverview';
import {dashboardHighlights} from '../lib/dashboardHighlights';
import {DashboardRiskOverview} from './DashboardRiskOverview';
import {AgentTaskWorkspace} from './AgentWorkbench';
import {useAgentWorkspace} from '../lib/agentWorkspaceClient';
import {WorkflowDialog} from './MaterialFileDialogs';
import {DismissibleMenu} from './DismissibleMenu';
import {NoticeHelp} from './NoticeHelp';
import {DashboardMiniCalendar} from './DashboardMiniCalendar';
import {useBackdropDismiss} from '../lib/useBackdropDismiss';
import {returnTaskHref} from '../lib/returnBasisView';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronRight, ClipboardList, FolderOpen, MoreHorizontal, ShieldAlert, X } from 'lucide-react';
import type { Project } from '../data/projects';
import type { Fund } from '../data/funds';
import type { MeetingRecord } from '../data/meetings';
import type { ReportRecord } from '../data/reports';
import type { CapitalItem } from '../data/capital';
import type { ApiClient, ApiMaterial } from '../lib/apiClient';
import { type ProjectTask } from '../lib/workbenchLogic';
import type { RiskItem } from '../data/risks';
import { projectProgress, progressStages, readProjectProgress, type ProgressSnapshot } from '../lib/dashboardProgress';
import { navigate } from './Layout';
import { StatusBadge } from './ui';
import {isManagedProject,projectLifecycleLabel,matchesProjectAssetCategory} from '../lib/projectAssetHistory';
type Props={mayReadProgress:boolean;projects:Project[];funds:Fund[];reports:ReportRecord[];tasksByProject:Record<string,ProjectTask[]>;capitalRecords:CapitalItem[];meetingRecords:MeetingRecord[];materials:ApiMaterial[];apiClient:ApiClient;pendingAiIntakeCount:number;onCreate?:()=>void;onCreateFund?:()=>void;currentRole?:string;quickPrompts:string[];legacyReminders:ReactNode;onRefresh:()=>Promise<void>};
function Pager({total,page,size,onChange,label}:{total:number;page:number;size:number;onChange:(page:number)=>void;label:string}) {
 return <div className="restored-pager"><span>共 {total} 项</span><div><button aria-label={`${label}上一页`} disabled={!page} onClick={()=>onChange(page-1)}>上一页</button><span>{page+1} / {Math.max(1,Math.ceil(total/size))}</span><button aria-label={`${label}下一页`} disabled={(page+1)*size>=total} onClick={()=>onChange(page+1)}>下一页</button></div></div>;
}
function RowMenu({name,projectId,onInspect}:{name:string;projectId?:string;onInspect?:()=>void}) {
 return <DismissibleMenu className="restored-menu"><summary aria-label={`${name}更多操作`}><MoreHorizontal size={18}/></summary><div>{onInspect?<button onClick={onInspect}>查看事项详情</button>:null}{projectId?<>{[['项目概览','项目概览'],['三会审批','三会审批'],['投资与交割','投资信息'],['资料文件','资料文件'],['任务待办','任务待办']].map(([label,tab])=><button key={tab} onClick={()=>navigate(`/projects/${encodeURIComponent(projectId)}?tab=${encodeURIComponent(tab)}`)}>{label}</button>)}</>:<button onClick={()=>navigate('/tasks')}>打开任务中心</button>}</div></DismissibleMenu>;
}
export function DashboardWorkspace(props:Props) {
 const workspace=useAgentWorkspace();
 const hideDemo=useHideSeedDemo();
 const [fundFindings,setFundFindings]=useState<FundConcernFinding[]>([]),[fundRiskError,setFundRiskError]=useState(false),[fundRiskLoading,setFundRiskLoading]=useState(true);
 const [materialFindings,setMaterialFindings]=useState<MaterialConcernFinding[]>([]),[materialRiskError,setMaterialRiskError]=useState(false),[materialRiskLoading,setMaterialRiskLoading]=useState(true);
 const [summary,setSummary]=useState<string|null>(null);
 const [manageTasks,setManageTasks]=useState(false);
 const [creatingSchedule,setCreatingSchedule]=useState(false);
 useEffect(()=>{setManageTasks(false);},[summary]);
 const [ledger,setLedger]=useState<'tasks'|'projects'|null>(null);
 const {mayReadProgress,projects,funds,tasksByProject,apiClient}=props;
 const [risks,setRisks]=useState<RiskItem[]>([]),[riskState,setRiskState]=useState<'loading'|'ready'|'error'>('loading');
 const [snapshots,setSnapshots]=useState<Record<string,ProgressSnapshot>>({});
 const [reload,setReload]=useState(0),[loading,setLoading]=useState(true);
 const [riskReload,setRiskReload]=useState(0);
 const [taskFilter,setTaskFilter]=useState('全部'),[priority,setPriority]=useState('全部优先级'),[taskPage,setTaskPage]=useState(0);
 const [stageDescending,setStageDescending]=useState(true);
 const [stageFilter,setStageFilter]=useState('全部项目'),[legacyFilter,setLegacyFilter]=useState('在管项目'),[projectPage,setProjectPage]=useState(0);
 const [refreshError,setRefreshError]=useState(''),[refreshing,setRefreshing]=useState(false);
 const [selected,setSelected]=useState<string[]>([]),[inspected,setInspected]=useState<string[]>([]);
 const detailDialog=useRef<HTMLDialogElement>(null);
 const dismissDetail=useBackdropDismiss(()=>detailDialog.current?.close());
 const projectKey=projects.map(project=>project.id).join('|');
 const materialReviewKey=JSON.stringify(props.materials.map(m=>[m.id,m.currentVersionId,m.name,m.fundId,m.projectId,m.relationships]));
 const fundReviewKey=JSON.stringify([funds.map(f=>[f.id,f.updatedAt,f.revision,f.scale,f.invested,f.balance]),materialReviewKey]);
 useEffect(()=>{let cancelled=false;setRiskState('loading');apiClient.getRiskRecords().then(result=>{if(!cancelled){setRisks(result.risks);setRiskState('ready');}},()=>{if(!cancelled)setRiskState('error');});return()=>{cancelled=true;};},[apiClient,projectKey,reload,riskReload,summary==='风险关注']);
 useEffect(()=>{let active=true;setMaterialRiskError(false);setMaterialRiskLoading(true);apiClient.getMaterialConcernFindings().then(data=>{if(active){setMaterialFindings(data.findings);setMaterialRiskLoading(false);}},()=>{if(active){setMaterialFindings([]);setMaterialRiskError(true);setMaterialRiskLoading(false);}});return()=>{active=false;};},[apiClient,reload,riskReload,summary==='风险关注',materialReviewKey]);
 useEffect(()=>{let active=true;setFundRiskError(false);setFundRiskLoading(true);apiClient.getFundConcernFindings(!hideDemo).then(data=>{if(active){setFundFindings(data.findings);setFundRiskLoading(false);}},()=>{if(active){setFundFindings([]);setFundRiskError(true);setFundRiskLoading(false);}});return()=>{active=false;};},[apiClient,reload,riskReload,summary==='风险关注',fundReviewKey,hideDemo]);
 useEffect(()=>{
  if(!mayReadProgress){setSnapshots({});setLoading(false);return;}
  if(!workspace.state)return;
  let cancelled=false,cursor=0;const controller=new AbortController();setLoading(true);setSnapshots({});
  async function worker(){while(cursor<projects.length&&!cancelled){const project=projects[cursor++];let result:ProgressSnapshot;
    try{result=await readProjectProgress(apiClient,project.id,12000,controller.signal);}catch{result={error:'流程记录读取失败或超时，请刷新重试'};}
    if(!cancelled)setSnapshots(current=>({...current,[project.id]:result}));
  }}
  Promise.all(Array.from({length:Math.min(4,projects.length)},worker)).then(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;controller.abort();};
 },[apiClient,projectKey,reload,mayReadProgress,!!workspace.state]);

 const todos=(workspace.state?.tasks??[]).filter(row=>!['complete','cancelled'].includes(row.status)).map(row=>{
  const project=projects.find(project=>project.id===row.projectId);
  const task=row.id.startsWith('business:')&&project?(tasksByProject[project.id]??[]).find(task=>task.id===row.id.slice(9)):undefined;
  const overdue=row.dueAt&&Date.parse(row.dueAt)<Date.now(),high=['high','urgent'].includes(row.priority);
  const scope=row.projectId?'项目' as const:row.fundId?'基金' as const:'其他' as const;
  const relation=dashboardTaskRelation({projectId:row.projectId,fundId:row.fundId},project,funds,snapshots[project?.id??'']?.deals);
  const status=task?.kind==='review'?'待审核':task?.status??row.sourceStatus??(row.status==='waiting'?'等待中':'待确认');
  return {note:row.note,dataOrigin:row.dataOrigin,dataPurpose:row.dataPurpose,id:row.id,projectId:row.projectId,fundId:row.fundId,createdAt:row.createdAt,item:row.title,module:task?.type??row.source??'个人安排',path:row.href||'/tasks',project,task,status,due:task?.dueDate??(row.dueAt?new Date(row.dueAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}):'未设置截止'),priority:task?.priority??(high?'高':'中'),importance:high?'高重要':'中重要',urgency:overdue?'高紧急':'低紧急',action:dashboardTaskAction({...row,priority:task?.priority??row.priority,status}),scope,relation,sourceUnavailable:row.sourceUnavailable,ownerId:row.ownerId,dueAt:row.dueAt};
 });
 const orderedTodos=dashboardTaskOrder(todos);
 const filteredTodos=orderedTodos.filter(item=>(taskFilter==='全部'||(taskFilter==='其他'?!['待审核','待确认','待核查'].includes(item.status):item.status===taskFilter))&&(priority==='全部优先级'||item.action===priority));
 const taskPages=Math.max(1,Math.ceil(filteredTodos.length/5)),tp=Math.min(taskPage,taskPages-1),pageTodos=filteredTodos.slice(tp*5,tp*5+5);
 const progress=projects.map(project=>({...project,progress:projectProgress(mayReadProgress?snapshots[project.id]:{restricted:true},tasksByProject[project.id]??[])})).sort((a,b)=>{const score=(stage:string)=>progressStages.findIndex(value=>value===stage);return (score(b.progress.stage)-score(a.progress.stage))*(stageDescending?1:-1);});
 const categoryProjects=progress.filter(project=>matchesProjectAssetCategory(project,legacyFilter));
 const visibleProjects=categoryProjects.filter(project=>stageFilter==='全部项目'||project.progress.stage===stageFilter);
 const pp=Math.min(projectPage,Math.max(0,Math.ceil(visibleProjects.length/4)-1));
 const now=Date.now();
 const concerns=dashboardConcerns({risks:riskState==='ready'?risks:[],references:filterSeedDemoRecords(riskReferences,hideDemo),projects,funds,tasks:orderedTodos,materials:props.materials,snapshots,findings:materialFindings,fundFindings},now);
 const availableRisks=concerns;
 const concernState=riskState==='error'||workspace.error||materialRiskError||fundRiskError||Object.values(snapshots).some(s=>s.error)?'error':riskState==='loading'||!workspace.state||loading||materialRiskLoading||fundRiskLoading?'loading':'ready';
 const rankedFunds=dashboardObjectOrder(funds.filter(isManagedDashboardFund),'fund',projects,orderedTodos,availableRisks,now);
 const rankedProjects=dashboardObjectOrder(progress.filter(isManagedProject),'project',projects,orderedTodos,availableRisks,now);
 const mountainHighlights=dashboardHighlights(workspace.state&&!workspace.error?orderedTodos:[],riskState==='ready'?risks:[],projects,funds,now);
 const riskAttention=dashboardConcernAttention(concerns,projects,funds,now);
 const {schedule,overdue:overdueSchedule}=dashboardPersonalSchedule(todos,workspace.state?.currentUserId,now);
 const inspect=(ids:string[])=>{setInspected(ids);detailDialog.current?.showModal();};
 const allPageSelected=pageTodos.length>0&&pageTodos.every(item=>selected.includes(item.id));
 const failed=Object.values(snapshots).filter(snapshot=>snapshot.error).length;
 const refreshDashboard=async()=>{setRefreshing(true);setRefreshError('');try{await Promise.all([props.onRefresh(),workspace.refresh()]);setReload(value=>value+1);}catch{setRefreshError('刷新失败，已保留当前视图，请重试。');}finally{setRefreshing(false);}};
 const taskLedger=<section className="restored-panel"><header><div className="dashboard-task-heading"><h2>待办办理队列</h2></div><div><RefreshButton aria-label="刷新工作台" data-ui="secondary" disabled={refreshing} onClick={refreshDashboard}>{refreshing?'刷新中…':'刷新'}</RefreshButton><RowMenu name="待办" onInspect={()=>inspect(selected.length?selected:pageTodos.map(item=>item.id))}/></div></header>
    <div className="restored-filterline"><div className="restored-tabs" aria-label="待办状态筛选">{['全部','待审核','待确认','待核查','其他'].map(filter=><button key={filter} aria-pressed={taskFilter===filter} className={taskFilter===filter?'active':''} onClick={()=>{setTaskFilter(filter);setTaskPage(0);}}>{filter} ({workspace.state?(filter==='全部'?todos.length:todos.filter(item=>filter==='其他'?!['待审核','待确认','待核查'].includes(item.status):item.status===filter).length):'—'})</button>)}</div><label className="restored-extra-filter"><span className="sr-only">原有优先级筛选</span><select aria-label="原有优先级筛选" value={priority} onChange={event=>{setPriority(event.target.value);setTaskPage(0);}}>{['全部优先级','现在处理','今日跟进','本周处理','持续观察'].map(value=><option key={value}>{value}</option>)}</select></label></div>
    <div className="restored-selection">已选 {selected.filter(id=>todos.some(item=>item.id===id)).length} 项 <button disabled={!selected.some(id=>todos.some(item=>item.id===id))} onClick={()=>inspect(selected)}>查看已选事项</button><button disabled={!selected.length} onClick={()=>setSelected([])}>清空选择</button></div>
    <p className="restored-read-status" style={{minHeight:28}} role={workspace.error?'alert':'status'}>{workspace.error?'待办读取失败，请刷新重试；当前记录可能不是最新。':!workspace.state?'正在读取统一待办…':''}</p><div className="restored-table-scroll"><table className="restored-task-table"><thead><tr><th className="check-col"><input type="checkbox" aria-label="全选本页任务" checked={allPageSelected} onChange={event=>setSelected(current=>event.target.checked?Array.from(new Set([...current,...pageTodos.map(item=>item.id)])):current.filter(id=>!pageTodos.some(item=>item.id===id)))}/></th><th>任务事项</th><th>关联项目 / 企业</th><th>任务类型</th><th>优先级</th><th>截止时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{pageTodos.map(item=><tr key={item.id}><td><input type="checkbox" aria-label={`选择任务：${item.item}`} checked={selected.includes(item.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/></td><td><button className="restored-name" title={item.item} onClick={()=>inspect([item.id])}>{item.item}</button></td><td>{item.project?.shortName??'跨项目事项'}</td><td>{item.module}</td><td className="restored-nowrap"><i className={`priority-dot priority-${item.priority}`}/>{item.priority}</td><td className="restored-nowrap">{item.due}</td><td><StatusBadge status={item.status}/></td><td><div className="restored-actions"><button data-ui="info" className="restored-view" onClick={()=>navigate(item.task&&item.project?(returnTaskHref(item.project.id,item.task)??`/projects/${item.project.id}?tab=${encodeURIComponent('任务待办')}&taskId=${encodeURIComponent(item.task.id)}`):item.path)}>查看</button><RowMenu name={item.item} projectId={item.project?.id} onInspect={()=>inspect([item.id])}/></div></td></tr>)}</tbody></table></div>{workspace.state&&!workspace.error&&!filteredTodos.length?<p className="restored-empty">当前筛选下没有待办，切换分类可查看其他事项。</p>:null}
    {workspace.state?<Pager total={filteredTodos.length} page={tp} size={5} onChange={setTaskPage} label="待办"/>:null}
   </section>;
 const projectLedger=<section className="restored-panel"><header><h2>{legacyFilter==='已退出'?'历史资产进展':'在管项目进展'}</h2><div><button className="restored-text-link" onClick={()=>navigate('/projects')}>查看更多 <ChevronRight size={14}/></button></div></header>
    <div className="restored-filterline"><div className="restored-tabs" aria-label="项目流程阶段筛选">{['全部项目',...progressStages].map(stage=><button key={stage} className={stageFilter===stage?'active':''} aria-pressed={stageFilter===stage} onClick={()=>{setStageFilter(stage);setProjectPage(0);}}>{stage} ({stage==='全部项目'?categoryProjects.length:categoryProjects.filter(project=>project.progress.stage===stage).length})</button>)}</div><label className="restored-extra-filter"><span className="sr-only">原有项目分类</span><select aria-label="原有项目分类" value={legacyFilter} onChange={event=>{setLegacyFilter(event.target.value);setProjectPage(0);}}>{['在管项目','全部分类','投后管理','风险关注','已投项目','尽调中','拟投项目','退出中','已退出'].map(value=><option key={value}>{value}</option>)}</select></label></div>
    {!mayReadProgress?<p className="restored-read-status" role="status">当前账号可查看资产状态，完整交易进度受权限限制；财务办理请从资金与费用进入。<a className="notice-inline-help" href="/capital">前往资金与费用 →</a></p>:null}{loading?<p className="restored-read-status" role="status">正在读取审批与交割记录（{Object.keys(snapshots).length}/{projects.length}），尚未加载的项目不计入阶段分类。</p>:null}{failed?<div className="restored-read-status" role="alert">{failed} 个项目流程读取失败，记录仍保留在全部项目中。<button onClick={()=>setReload(value=>value+1)}>重新读取</button></div>:null}
    <div className="restored-table-scroll"><table className="restored-project-table"><thead><tr><th>项目名称</th><th>企业名称</th><th><button aria-label="切换项目阶段排序" onClick={()=>{setStageDescending(value=>!value);setProjectPage(0);}}>当前阶段 {stageDescending?"↓":"↑"}</button></th><th>阶段进展</th><th>下一步事项</th><th>当前事项截止</th><th>操作</th></tr></thead><tbody>{visibleProjects.slice(pp*4,pp*4+4).map(project=><tr key={project.id}><td><button className="restored-name" title="当前项目以企业简称建档；完整企业名称见相邻列" onClick={()=>navigate(`/projects/${project.id}`)}>{project.shortName}</button><small className="block text-[var(--secondary)]">{projectLifecycleLabel(project)}</small></td><td title={project.name}>{project.name}</td><td><span className="restored-current-stage">{project.progress.stage}</span></td><td><ol className="restored-progress" aria-label={`${project.shortName}流程：${project.progress.stage}`}>{progressStages.map((stage,index)=><li key={stage} className={`node-${project.progress.nodes[index]}`}><span aria-hidden="true">{project.progress.nodes[index]==='complete'?<Check size={10}/>:project.progress.nodes[index]==='rejected'?<X size={9}/>:project.progress.nodes[index]==='unknown'?'?':<i/>}</span><small>{stage}</small><b className="sr-only">{({complete:'已完成',current:'当前阶段',pending:'未完成',returned:'已退回',rejected:'已否决',unknown:'待核实'})[project.progress.nodes[index]]}</b></li>)}</ol><p className="restored-progress-note">{project.progress.note?project.progress.note:''}{project.progress.nodes.includes('returned')?' · 审批退回待处理':''}{project.progress.nodes.includes('rejected')?' · 审批未通过':''}</p></td><td><button className="restored-text-link" onClick={()=>navigate(`/projects/${project.id}?tab=${encodeURIComponent(project.progress.actionTab)}`)}>{project.progress.nextAction}</button></td><td className="restored-nowrap">{project.progress.due||'尚未登记'}<small className="restored-date-source">{project.progress.dueSource}</small></td><td><div className="restored-actions"><button data-ui="info" className="restored-view" onClick={()=>navigate(`/projects/${project.id}`)}>查看</button><RowMenu name={project.shortName} projectId={project.id}/></div></td></tr>)}</tbody></table></div>{!visibleProjects.length?<p className="restored-empty">当前分类暂无项目，未发起与未核实项目可在全部项目中查看。</p>:null}
    <Pager total={visibleProjects.length} page={pp} size={4} onChange={setProjectPage} label="项目"/>
    <p className="restored-source-note">截止：当前审批或最近待办的截止日期</p>
   </section>;
 return <div className="restored-dashboard">
  <header className="restored-heading page-heading"><div className="restored-title"><div className="page-heading-main"><p className="page-heading-eyebrow">日常工作 / 项目进展</p><h1>工作台</h1></div></div><DashboardMiniCalendar/><div className="restored-metrics">{[
   {tone:'funds',label:'在管基金',value:rankedFunds.length,Icon:FolderOpen}, {tone:'projects',label:'在管项目',value:projects.filter(isManagedProject).length,Icon:FolderOpen}, {tone:'todo',label:'全部待办',value:workspace.state?workspace.state.tasks.filter(t=>!['complete','cancelled'].includes(t.status)).length:'—',Icon:ClipboardList}, {tone:'risk',label:'风险关注',value:concernState==='ready'?concerns.length:'—',Icon:ShieldAlert}
  ].map(({tone,label,value,Icon})=><button data-metric={tone} key={label} onClick={()=>setSummary(label)}><Icon size={20}/><span><span className="metric-label">{label}</span><strong>{value}</strong></span></button>)}</div></header>
  {refreshError?<p role="alert" className="restored-read-status">{refreshError}<NoticeHelp message={refreshError}/></p>:null}
  <DashboardIceberg funds={rankedFunds} projects={rankedProjects} tasks={orderedTodos} highlights={mountainHighlights} attention={riskAttention} schedule={schedule} overdue={overdueSchedule} reports={workspace.state?.weeklyReports??[]} userId={workspace.state?.currentUserId} workspaceReady={!!workspace.state} workspaceError={workspace.error} riskState={concernState} refreshing={refreshing} onRefresh={refreshDashboard} onRetry={()=>void refreshDashboard()} onInspect={inspect} onSummary={setSummary} onLedger={name=>name==='tasks'?setSummary('全部待办'):setLedger(name)} onAllAttention={()=>setSummary('风险关注')} onCreateProject={props.onCreate} onCreateFund={props.onCreateFund} onCreateSchedule={['admin','investment_manager','post_investment'].includes(props.currentRole??'')&&workspace.state?()=>setCreatingSchedule(true):undefined}/>
  {creatingSchedule?<DashboardScheduleDialog model={workspace} funds={funds} projects={projects} onClose={()=>setCreatingSchedule(false)}/>:null}
  {ledger?<WorkflowDialog title={ledger==='tasks'?'待办办理队列':'在管项目进展'} busy={false} onClose={()=>setLedger(null)}><div className="iceberg-ledger">{ledger==='tasks'?taskLedger:projectLedger}</div></WorkflowDialog>:null}
  {summary&&<WorkflowDialog title={summary} busy={false} onClose={()=>setSummary(null)}><div className="dashboard-summary-content" data-summary={summary}>{summary==='在管基金'?<p className="dashboard-summary-total">在管基金共 {rankedFunds.length} 只</p>:summary==='在管项目'?<p className="dashboard-summary-total">在管项目共 {projects.filter(isManagedProject).length} 个</p>:null}{summary==='全部待办'?(manageTasks?<><button data-ui="secondary" onClick={()=>setManageTasks(false)}>← 返回待办概览</button><AgentTaskWorkspace/></>:<DashboardTaskOverview tasks={orderedTodos} ready={!!workspace.state} error={workspace.error} onInspect={inspect} onManage={()=>setManageTasks(true)} onCreate={['admin','investment_manager','post_investment'].includes(props.currentRole??'')?()=>navigate('/tasks?create=1'):undefined} onRetry={()=>void workspace.refresh().catch(()=>{})}/>):summary==='在管基金'?(rankedFunds.length?rankedFunds.map(fund=><article className="dashboard-summary-row" key={fund.id}><span className="dashboard-object-icon" data-kind="fund" aria-hidden="true"><DashboardObjectIcon kind="fund"/></span><div><h3>{fund.name}</h3><p>{fund.stage} · 管理人：{fund.manager}</p></div><button data-ui="info" onClick={()=>navigate(`/funds/${fund.id}`)}>查看基金</button></article>):<p role="status">当前范围暂无在管基金。</p>):summary==='在管项目'?(rankedProjects.length?rankedProjects.map(project=><article className="dashboard-summary-row" key={project.id}><span className="dashboard-object-icon" data-kind="project" aria-hidden="true"><DashboardObjectIcon kind="project"/></span><div><h3>{project.name}</h3><p>{projectLifecycleLabel(project)} · 主归属基金：{funds.find(f=>f.id===project.fundId)?.name??project.fund??'未登记'}</p></div><button data-ui="info" onClick={()=>navigate(`/projects/${project.id}`)}>查看项目</button></article>):<p role="status">当前范围暂无在管项目。</p>):<DashboardRiskOverview currentRole={props.currentRole} risks={concerns} projects={projects} funds={funds} state={concernState} onRetry={()=>void refreshDashboard()}/>}</div></WorkflowDialog>}
  <dialog {...dismissDetail} ref={detailDialog} className="restored-detail-dialog" aria-labelledby="restored-detail-title"><header><h2 id="restored-detail-title">待办事项详情</h2><button aria-label="关闭待办详情" onClick={()=>detailDialog.current?.close()}><X size={20}/></button></header>{todos.filter(item=>inspected.includes(item.id)).map(item=><article key={item.id}><h3>{item.item}</h3><p>{item.relation}</p><p>任务类型：{item.module} · 状态：{item.status}</p><p>优先级：{item.importance} · {item.urgency} · {item.action}</p><p>截止：{item.due}</p>{item.task?<p>负责人：{item.task.owner} · 说明：{item.task.note||'尚未登记'}</p>:null}<button data-ui="primary" className="restored-primary" onClick={()=>navigate(item.task&&item.project?(returnTaskHref(item.project.id,item.task)??`/projects/${item.project.id}?tab=${encodeURIComponent('任务待办')}&taskId=${encodeURIComponent(item.task.id)}`):item.path)}>前往处理</button></article>)}<footer><button data-ui="secondary" className="restored-view" onClick={()=>detailDialog.current?.close()}>关闭</button></footer></dialog>
 </div>;
}
