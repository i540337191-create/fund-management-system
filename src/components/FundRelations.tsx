import {useEffect,useRef,useState} from 'react';
import {useHideSeedDemo} from '../lib/sourceVisibility';
import '../iterationB/fundRelations.css';
import {ArrowRight,Info,ScanLine} from 'lucide-react';
import {WorkflowDialog} from './MaterialFileDialogs';
import {createApiClient,type FundCompletenessResult} from '../lib/apiClient';
import {normalizeDataOrigin} from '../lib/dataOrigin';
import type {useAgentWorkspace} from '../lib/agentWorkspaceClient';
import {matchesTaskFund,isOpenWorkspaceTask,visibleFundsTaskScope} from '../lib/taskFundScope';
import type {Fund,FundStage} from '../data/funds';

type FundRelationRecord=Pick<Fund,'id'|'name'|'stage'|'scale'|'paidIn'|'invested'|'balance'|'dataOrigin'|'projectCount'|'investorCount'|'registeredTotals'|'registeredTotalsIncludeDemo'>;
const api=createApiClient();
const stages: {stage:FundStage;label:string;color:string}[]=[{stage:'募集期',label:'募集',color:'#e8b563'},{stage:'投资期',label:'投资',color:'#e2c9aa'},{stage:'投后管理',label:'投后',color:'#a45b20'},{stage:'退出期',label:'退出',color:'#d6ccc0'}];
export function FundRelations({funds,onShowAll,onTasks,onStage,onReviewFund,localMoney=false,workspace}:{funds:FundRelationRecord[];onShowAll:()=>void;onTasks:()=>void;onStage:(stage:FundStage)=>void;onReviewFund:(id:string,tab:string)=>void;localMoney?:boolean;workspace:ReturnType<typeof useAgentWorkspace>}){
  const [reviewing,setReviewing]=useState(false),[selectedFund,setSelectedFund]=useState(''),[fundQuery,setFundQuery]=useState('');
  const hideDemo=useHideSeedDemo(),investors=funds.map(f=>f.registeredTotalsIncludeDemo===!hideDemo?f.registeredTotals?.investorCount:undefined);
  const [checking,setChecking]=useState(false),[checkError,setCheckError]=useState(''),[checkResult,setCheckResult]=useState<FundCompletenessResult|null>(null);
  const checkRun=useRef(0),checkBusy=useRef(false);
  const scope=JSON.stringify([hideDemo,funds.map(f=>[f.id,f.name,f.stage,f.dataOrigin,f.scale,f.paidIn,f.invested,f.balance,f.registeredTotals,f.registeredTotalsIncludeDemo])]);
  useEffect(()=>{setCheckResult(null);setCheckError('');setSelectedFund('');setFundQuery('');setChecking(false);checkBusy.current=false;return()=>{checkRun.current++;};},[scope]);
  const detect=async()=>{
    if(checkBusy.current||!funds.length)return;
    checkBusy.current=true;const run=++checkRun.current;setChecking(true);setCheckError('');
    try{const result=await api.checkFundCompleteness(funds.map(f=>f.id),!hideDemo);if(run===checkRun.current)setCheckResult(result);}
    catch(error){if(run===checkRun.current){const {status,code}=error as {status?:number;code?:string};setCheckError(code==='model_not_configured'?'智能助手尚未配置，请在系统设置中配置 AI 服务后重试。':status===401||status===403?'登录或基金访问权限已变化，请刷新页面后重试。':'本次检测未完成，请重试。下方保留已有登记检查，不能据此判断资料完整。');}}
    finally{if(run===checkRun.current){checkBusy.current=false;setChecking(false);}}
  };
  const investorCount=investors.every(count=>count!==undefined)?investors.reduce<number>((sum,count)=>sum+(count??0),0):undefined;
  const ready=Boolean(workspace.state)&&!workspace.error;
  const openTasks=workspace.state?.tasks.filter(task=>isOpenWorkspaceTask(task)&&matchesTaskFund(task,visibleFundsTaskScope,funds)).length;
  const seedDemoCount=funds.filter(f=>normalizeDataOrigin(f.dataOrigin)==='seed_demo').length;
  const pending=funds.map(fund=>({fund,fields:[
    {label:'基金规模',value:fund.scale,tab:'概览',action:'编辑基金规模',detail:'进入基金档案的“编辑基金资料”，登记基金规模。',kind:'missing'},
    {label:'实缴',action:'核对投资者实缴',detail:'进入募集档案的投资者台账，补录实缴到账及对应凭证。',kind:'missing',value:localMoney?fund.paidIn:fund.registeredTotalsIncludeDemo===!hideDemo?fund.registeredTotals?.paidIn:null,tab:'募集档案'},
    {label:'已投金额',value:fund.invested,tab:'账户资金',action:'核对已投资金',detail:'进入账户资金，核对投资支出流水与凭证，再核对汇总口径。',kind:'missing'},
    {label:'账户余额',value:fund.balance,tab:'账户资金',action:'核对账户余额',detail:'进入账户资金，补齐流水和对账依据，核对余额。',kind:'missing'},
  ].filter(field=>field.value==null||!String(field.value).trim()||/待|未|—/.test(String(field.value)))})).filter(row=>row.fields.length);
  const reviewRows=checkResult?checkResult.rows.filter(row=>row.fields.length):pending;
  const missingCount=reviewRows.reduce((total,row)=>total+row.fields.filter(field=>field.kind!=='review').length,0);
  const suggestionCount=reviewRows.reduce((total,row)=>total+row.fields.filter(field=>field.kind==='review').length,0);
  const matchingRows=reviewRows.filter(row=>row.fund.name.toLocaleLowerCase().includes(fundQuery.trim().toLocaleLowerCase()));
  const selectedRow=matchingRows.find(row=>row.fund.id===selectedFund)??matchingRows[0];
  const groups=selectedRow?[
    {id:'basic',title:'基本信息',fields:selectedRow.fields.filter(field=>field.kind!=='review'&&field.tab==='概览')},
    {id:'money',title:'资金台账',fields:selectedRow.fields.filter(field=>field.kind!=='review'&&['募集档案','账户资金','基金运营'].includes(field.tab))},
    {id:'documents',title:'资料档案',fields:selectedRow.fields.filter(field=>field.kind!=='review'&&!['概览','募集档案','账户资金','基金运营'].includes(field.tab))},
    {id:'suggestions',title:'AI 建议',fields:selectedRow.fields.filter(field=>field.kind==='review')},
  ].filter(group=>group.fields.length):[];
  const stageCounts=stages.map(item=>({...item,count:funds.filter(fund=>fund.stage===item.stage).length}));
  let end=0;
  const segments=stageCounts.map(({count,color})=>{const start=end;end+=funds.length?count/funds.length*100:0;return `${color} ${start}% ${end}%`;});
  return <section className="fund-ledger-overview" aria-label="基金全貌">
    <div className="fund-ledger-landscape">
      <div className="fund-stage-composition">
        <div className="fund-stage-donut" style={{background:funds.length?`conic-gradient(${segments.join(',')})`:'var(--line)'}}>
          <button type="button" onClick={onShowAll} aria-label="查看全部基金" className="fund-ledger-metric fund-ledger-count"><strong>{funds.length}</strong><span>只基金</span></button>
        </div>
        <div className="fund-ledger-stages" role="group" aria-label="基金阶段构成，按基金数量统计">
          <h2>基金阶段构成</h2>
          {stageCounts.map(({stage,label,count,color})=><button key={stage} type="button" onClick={()=>onStage(stage)} aria-label={`查看${stage}基金`}><i aria-hidden="true" style={{backgroundColor:color}}/><span>{label}</span><span><strong>{count}</strong> 只</span></button>)}
        </div>
      </div>
      <div className="fund-ledger-metrics">
        <div className="fund-ledger-metric"><strong>{funds.reduce((n,f)=>n+f.projectCount,0)}</strong><span>关联项目</span></div>
        <button type="button" className="fund-ledger-metric" onClick={onTasks} disabled={!ready} title="查看当前可见基金的统一未完成待办"><strong>{ready?openTasks:'—'}</strong><span>未完成待办</span></button>
        <div className="fund-ledger-metric" title="按基金台账汇总的关联记录，不是跨基金去重人数"><strong>{investorCount??'—'}</strong><span>投资者关联记录</span></div>
      </div>
    </div>
    <div className="fund-ledger-guidance">
      <div className="fund-ledger-source" title="PDF/OCR资料与真实原始物料另行标记"><Info size={18} aria-hidden="true"/><span>{pending.length?'资金口径待完善':'资金字段已登记'}{seedDemoCount?` · 含${seedDemoCount}只模拟基金`:''}</span></div>
      <div className="fund-ledger-assistant" role={workspace.error?'alert':'status'}><span><b>智能助理：</b>{pending.length?'资金信息待核对 · ':''}{ready?(openTasks?<strong className="fund-ledger-task-alert">{openTasks}项未完成待办</strong>:pending.length?'':'当前无未完成待办'):workspace.error?'待办读取失败':'正在读取统一待办…'}</span>{workspace.error?<button type="button" data-ui="secondary" onClick={()=>void workspace.refresh().catch(()=>{})}>重试</button>:null}</div>
      <button type="button" data-ui="primary" className="fund-review-entry" onClick={()=>setReviewing(true)}>查看待补齐 <svg className="fund-review-entry-arrow" viewBox="0 0 26 22" fill="none" aria-hidden="true"><path d="M3 17C7 8 14 7 22 10M17 4.5 22 10l-7 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
    </div>

    {reviewing?<WorkflowDialog title="基金资料待补齐" busy={checking} className="fund-completeness-dialog" onClose={()=>setReviewing(false)} headerAction={<button type="button" data-ui="primary" onClick={()=>void detect()} disabled={checking||!funds.length}><ScanLine size={16} aria-hidden="true"/>{checking?'正在检测…':'智能助手检测'}</button>}>
      <div className="fund-review-status" role={checkError?'alert':'status'} aria-live="polite">
        {checking?'正在核查最新台账与关联资料，请稍候…':checkError||(checkResult?`已检查 ${checkResult.fundCount} 只基金 · ${new Date(checkResult.checkedAt).toLocaleString('zh-CN')}`:'当前为台账登记检查，可运行智能助手检测核查关联资料。')}
      </div>
      <div className="fund-review-totals" aria-label="补齐事项汇总"><span><b>{reviewRows.length}</b> 只基金待处理</span><span className={missingCount?"fund-review-priority":"fund-review-muted"}>台账待完善 <b>{missingCount}</b> 项</span><span className={!checkResult||suggestionCount?"fund-review-advice":"fund-review-muted"}>AI 建议 {checkResult?<><b>{suggestionCount}</b> 项</>:'待检测'}</span></div>
      <div className="fund-review-layout" aria-busy={checking}>
        <nav className="fund-review-funds" aria-label="选择待补齐基金">
          <h3>选择基金</h3>
          {reviewRows.length>8?<input aria-label="搜索待补齐基金" placeholder="搜索基金名称" value={fundQuery} onChange={event=>setFundQuery(event.target.value)}/>:null}
          <div className="fund-review-fund-options">{matchingRows.map(({fund,fields})=><button type="button" key={fund.id} aria-pressed={selectedRow?.fund.id===fund.id} onClick={()=>setSelectedFund(fund.id)} title={fund.name}>
            <strong>{fund.name}</strong><span>{fields.some(field=>field.kind!=='review')?<span className="fund-review-priority">待完善 {fields.filter(field=>field.kind!=='review').length}</span>:<span className="fund-review-muted">台账已登记</span>}{checkResult?<span className={fields.some(field=>field.kind==='review')?"fund-review-advice":"fund-review-muted"}>建议 {fields.filter(field=>field.kind==='review').length}</span>:null}</span>
          </button>)}</div>
        </nav>
        <div className="fund-ledger-review-list">
          {selectedRow?<article key={`${selectedRow.fund.id}:${checkResult?.checkedAt??'initial'}`}>
            <header><div><h3 title={`基金编号：${selectedRow.fund.id}`}>{selectedRow.fund.name}</h3>{normalizeDataOrigin(selectedRow.fund.dataOrigin)==='seed_demo'?<small className="fund-review-demo">模拟业务数据</small>:null}</div></header>
            <p className="fund-review-order">先完善台账登记，再核对 AI 建议；未登记不等于 0。</p>
            {groups.map((group,index)=><details className={`fund-review-category${group.id==='suggestions'?' fund-review-category-advice':''}`} key={group.id} open={index===0&&group.id!=='suggestions'}>
              <summary><div><h4>{group.title}<span className={group.id==='suggestions'?'fund-review-advice':'fund-review-priority'}>{group.fields.length} 项{group.id==='suggestions'?'建议核对':'待完善'}</span></h4><p>{group.fields.map(field=>field.label).join('、')}</p></div><span className="fund-review-disclosure" aria-hidden="true"/></summary>
              <ul>{group.fields.map((field,fieldIndex)=><li key={`${field.label}-${fieldIndex}`}><div><h4>{field.label}</h4><p>{field.detail}</p><small>办理位置：{field.tab}</small></div><button type="button" data-ui="secondary" disabled={checking} onClick={()=>{setReviewing(false);onReviewFund(selectedRow.fund.id,field.tab);}}>{field.action}<ArrowRight size={14} aria-hidden="true"/></button></li>)}</ul>
            </details>)}
          </article>:<p className="fund-review-empty">{fundQuery?'未找到匹配的基金。':checkResult?'本次检查未发现待补齐项；原件内容仍须人工确认。':'当前资金字段均已登记，可运行智能助手检测核查资料。'}</p>}
        </div>
      </div>
      <p className="fund-review-scope">{checkResult?'AI 建议须人工核对，检测未审阅全部原件正文。':'检测只读取当前可见基金，不修改业务记录。'}</p>
    </WorkflowDialog>:null}
  </section>;
}
