import {DossierSections} from './DossierSections';
import {ProjectOperatingSnapshot} from '../components/ProjectOperatingSnapshot';
import {InvestmentLedgerPanel} from '../components/InvestmentLedgerPanel';
import {WorkflowDialog} from '../components/MaterialFileDialogs';
import {MaterialExcerpts} from './MaterialExcerpts';
import {useEffect,useState,type ReactNode} from 'react';
import {createApiClient,type ApprovalState} from '../lib/apiClient';
import type {Project} from '../data/projects';
import type {DiligenceCase} from '../lib/diligenceTypes';
import {useSourceScope} from '../lib/useSourceScope';
import {subscribeSessionInvalidation} from '../lib/sessionBoundary';
import {overviewRequirements,overviewApprovalBlocks} from './projectOverviewModel';
import {navigate} from '../components/Layout';
import {RefreshButton} from '../iterationA/RefreshButton';
import './overviewA.css';
const api=createApiClient();
type Detail=Awaited<ReturnType<typeof api.getProject>>;
type Snapshot={id:string;scope:string;detail?:Detail;diligence?:DiligenceCase|null;approvals?:ApprovalState;errors:string[]};
const diligenceLabels={active:'办理中',pending:'待审核',approved:'已批准',rejected:'已否决'};
export function ProjectOverviewA({project,onOpen,fields,nextAction}:{project:Project;onOpen:(tab:string)=>void;fields:ReactNode;nextAction:ReactNode}){
 const [inspector,setInspector]=useState<'basic'|'checklist'|'originals'|null>(null);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[retry,setRetry]=useState(0),[expired,setExpired]=useState(false);
 const scope=JSON.stringify([project.id,project.masterRevision,retry]),current=useSourceScope(scope);
 useEffect(()=>subscribeSessionInvalidation(()=>{setExpired(true);setSnapshot(null);}),[]);
 useEffect(()=>{
  if(expired)return;let active=true;setSnapshot({id:project.id,scope,errors:[]});
  const apply=(value:Partial<Snapshot>)=>{if(active&&current())setSnapshot(previous=>previous?.scope===scope?{...previous,...value}:previous);};
  const fail=(label:string)=>{if(active&&current())setSnapshot(previous=>previous?.scope===scope?{...previous,errors:[...previous.errors,label]}:previous);};
  void api.getProject(project.id).then(detail=>apply({detail})).catch(()=>fail('项目资料与风险'));
  void api.getDiligence(project.id).then(result=>apply({diligence:result.diligence})).catch(()=>fail('尽调资料清单'));
  void api.getApprovals(project.id).then(approvals=>apply({approvals})).catch(()=>fail('审批记录'));
  return()=>{active=false;};
 },[project.id,project.masterRevision,retry,expired]);
 const data=!expired&&snapshot?.scope===scope?snapshot:null;
 const requirements=data?.diligence!==undefined?overviewRequirements(data.diligence):null;
 const requiredCount=requirements?.reduce((n,row)=>n+row.required,0)??0;
 const missing=requirements?.reduce((n,row)=>n+row.missing,0);
 const blocks=data?.approvals?overviewApprovalBlocks(data.approvals):null;
 const risks=data?.detail?.risks.filter(risk=>!risk.deletedAt&&risk.status!=='已处理'&&risk.level==='高');
 const state=(label:string)=>expired?'登录已变化':data?.errors.includes(label)?'读取失败':'正在读取…';
 const metrics=[
  ['尽调档案',data?.diligence===undefined?'—':data.diligence?diligenceLabels[data.diligence.status]:'未建立',data?.diligence===undefined?state('尽调资料清单'):'依据尽调记录，不代表AI真实性核验'],
  ['待补要求',requirements&&requiredCount?String(missing):'—',requirements?requiredCount?'已声明清单中缺少原件的要求数':'尚未配置资料要求':state('尽调资料清单')],
  ['退回 / 否决',blocks?String(blocks.length):'—',blocks?'各会议最新轮次退回或否决，不含历史已纠正轮次':state('审批记录')],
  ['未处理高风险',risks?String(risks.length):'—',risks?'已登记且未处理的高风险；不表示全部潜在风险':state('项目资料与风险')],
 ];
 const tasks=data?.detail?.tasks.filter(task=>!['已完成','已取消'].includes(task.status));
 const rounds=data?.approvals?[...data.approvals.rounds].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):null;
 return <section className="iteration-b-overview project-overview-compact" aria-label="项目概览">
  <div className="archive-business-intro"><section><h3>公司简介</h3><p>{project.description||'尚未填写公司简介。'}</p></section><section><h3>投资逻辑</h3><p>{project.thesis||'尚未填写投资逻辑。'}</p></section><section><h3>最新进展</h3><p>{project.latest||'尚未填写最新进展。'}</p><time>{project.updatedAt}</time></section><section><h3>下一步动作</h3><p>{project.nextAction||'尚未填写下一步动作。'}</p></section></div>
  <DossierSections label="项目概览内容目录" items={[
   {id:'investment',label:'投资金额',content:<><div className="archive-master-investment"><span>主档投资金额</span><strong>{project.amount||'未录入'}</strong><button data-ui="secondary" onClick={()=>onOpen('投资信息')}>查看投资金额与协议</button></div><InvestmentLedgerPanel headline scope={{type:'project',id:project.id}} refreshToken={project.masterRevision}/></>},
   {id:'operating',label:'经营数据',content:<ProjectOperatingSnapshot projectId={project.id} revision={project.masterRevision}/>},
   {id:'risks',label:'风险关注',content:<section className="archive-section archive-business-risks"><header><h3>核心风险</h3><button data-ui="secondary" onClick={()=>onOpen('风险监控')}>查看 / 登记风险</button></header>{data?.detail?<>{data.detail.risks.filter(r=>!r.deletedAt&&r.status!=='已处理').slice(0,5).map(r=><p key={r.id}><strong>{r.level}风险 · {r.title}</strong>　{r.summary}</p>)}{!data.detail.risks.some(r=>!r.deletedAt&&r.status!=='已处理')?<p>尚无未处理的已登记风险。</p>:null}</>:<p>{state('项目资料与风险')}</p>}</section>},
   {id:'tasks',label:'待办跟进',content:<><section className="archive-business-action"><h3>待办与业务办理</h3>{nextAction}</section><section className="archive-section"><header><h3>下一步工作</h3><button type="button" data-ui="secondary" onClick={()=>onOpen('任务待办')}>查看全部待办</button></header><table className="overview-a-table"><thead><tr><th>事项</th><th>负责人</th><th>截止日期</th><th>状态</th><th>操作</th></tr></thead><tbody>{tasks?.slice(0,5).map(task=><tr key={task.id}><td>{task.name}</td><td>{task.owner||'未分派'}</td><td>{task.dueDate||'未设置'}</td><td>{task.status}</td><td><button type="button" data-ui="secondary" onClick={()=>navigate(`/projects/${encodeURIComponent(project.id)}?tab=${encodeURIComponent('任务待办')}&taskId=${encodeURIComponent(task.id)}`)}>前往处理</button></td></tr>)}{!tasks?.length?<tr><td colSpan={5}>{tasks?'暂无未完成的项目待办，可在任务待办中新增。':state('项目资料与风险')}</td></tr>:null}</tbody></table></section></>},
   {id:'documents',label:'资料与审批',content:<><section className="archive-section"><header><h3>资料与原件归集</h3><div className="project-inline-actions"><button type="button" data-ui="secondary" onClick={()=>onOpen('尽调分析')}>建立 / 核对清单</button><button type="button" data-ui="secondary" onClick={()=>onOpen('资料文件')}>上传 / 管理原件</button></div></header><table className="overview-a-table"><thead><tr><th>档案内容</th><th>当前记录</th><th>操作</th></tr></thead><tbody><tr><td>尽调报告</td><td>{data?.diligence===undefined?state('尽调资料清单'):data.diligence?.reports.length?`${data.diligence.reports.length} 个留存版本`:'尚未形成报告'}</td><td><button type="button" data-ui="secondary" onClick={()=>onOpen('尽调分析')}>查阅尽调</button></td></tr><tr><td>审批记录</td><td>{rounds?`${rounds.length} 轮审批记录`:state('审批记录')}</td><td><button type="button" data-ui="secondary" onClick={()=>onOpen('三会审批')}>查阅审批</button></td></tr><tr><td>关联原件</td><td>{data?.detail?`${data.detail.materials.length} 份关联资料`:state('项目资料与风险')}</td><td><button type="button" data-ui="secondary" onClick={()=>onOpen('资料目录')}>分类查阅</button></td></tr><tr><td>项目报告</td><td>按期间查阅正文、审阅与归档版本</td><td><button type="button" data-ui="secondary" onClick={()=>onOpen('报告记录')}>查阅报告</button></td></tr></tbody></table></section><section className="archive-section"><header><h3>最近审批</h3></header>{rounds?.length?<ol className="archive-timeline">{rounds.slice(0,3).map(round=><li key={round.id}><time>{round.createdAt.slice(0,10)}</time><strong>{round.meetingType} · {{pending:'待审批',approved:'已通过',returned:'已退回',rejected:'已否决'}[round.status]}</strong><span>第 {round.attempt} 轮 · {round.submittedBy.name}</span></li>)}</ol>:<p>{rounds?'尚无审批记录，不能从项目登记阶段推定已通过审批。':state('审批记录')}</p>}<button type="button" data-ui="secondary" onClick={()=>onOpen('三会审批')}>办理 / 查看审批</button></section><details className="project-support-details"><summary>资料检查与审批状态</summary><dl className="project-overview-facts">{metrics.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details><nav className="archive-inspector-links" aria-label="项目详细资料"><span>详细资料</span><button type="button" data-ui="secondary" onClick={()=>setInspector('basic')}>基本资料</button><button type="button" data-ui="secondary" onClick={()=>setInspector('checklist')}>检查明细{requirements?`（${requirements.length}）`:''}</button><button type="button" data-ui="secondary" onClick={()=>setInspector('originals')}>原件与摘录</button></nav></>},
  ]}/>
  {inspector?<WorkflowDialog title={{basic:'项目基本资料',checklist:'资料检查明细',originals:'关联原件与正文摘录'}[inspector]} busy={false} onClose={()=>setInspector(null)}>
   {inspector==='basic'?<div className="archive-basic-record"><dl>{[['项目名称',project.name],['所属基金',project.fund],['行业',project.industry],['负责人',project.manager],['登记阶段',project.stage],['更新日期',project.updatedAt]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'未录入'}</dd></div>)}</dl><section><h3>项目简介</h3><p>{project.description||'未填写'}</p></section><section><h3>投资逻辑</h3><p>{project.thesis||'未填写'}</p></section><section><h3>最新进展与办理备注</h3><p>{project.latest||'未填写最新进展'}</p><p>{project.nextAction||'未填写办理备注'}</p></section>{fields}<section><h3>核查范围</h3>{metrics.map(([label,,hint])=><p key={label}>{label}：{hint}</p>)}</section></div>:null}
   {inspector==='checklist'?<><p className="archive-drawer-intro">查阅已声明的检查事项、原件缺口和审核状态。</p>{requirements?.length?<table className="overview-a-table"><thead><tr><th>检查事项</th><th>资料要求</th><th>待补原件</th><th>办理</th></tr></thead><tbody>{requirements.map(row=><tr key={row.id}><td>{row.title}</td><td>{row.required||'未设置'}</td><td>{row.missing}{row.unreadable?` · ${row.unreadable}项待读取`:''}</td><td><button type="button" data-ui="secondary" onClick={()=>{setInspector(null);navigate(`/projects/${encodeURIComponent(project.id)}?tab=${encodeURIComponent('尽调分析')}&taskId=${encodeURIComponent(row.taskId)}`);}}>{row.missing?'补齐原件':'查阅底稿'}</button></td></tr>)}</tbody></table>:<div className="archive-empty"><p>{requirements?'尚未建立资料检查清单。':state('尽调资料清单')}</p><button type="button" data-ui="primary" onClick={()=>{setInspector(null);onOpen('尽调分析');}}>建立 / 核对清单</button></div>}</>:null}
   {inspector==='originals'?<><div className="archive-drawer-toolbar"><p>{data?.detail?`关联原件 ${data.detail.materials.length} 份`:state('项目资料与风险')}</p><RefreshButton aria-label="重新读取关联原件" onClick={()=>setRetry(value=>value+1)} disabled={expired}/></div>{data?.detail?<MaterialExcerpts materials={data.detail.materials}/>:null}<button type="button" data-ui="secondary" onClick={()=>{setInspector(null);onOpen('资料文件');}}>管理原件与版本</button></>:null}
  </WorkflowDialog>:null}
  {data?.errors.length?<p role="alert">未能核验：{data.errors.join('、')}。<button type="button" data-ui="secondary" onClick={()=>setRetry(value=>value+1)}>重新读取</button></p>:null}
 </section>;
}
