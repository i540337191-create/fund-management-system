import assert from 'node:assert/strict';
import test from 'node:test';
import { projectProgress } from '../src/lib/dashboardProgress.ts';
import type { ApprovalState, ApprovalRound } from '../src/lib/apiClient.ts';
import type { DealBatch } from '../src/lib/dealTypes.ts';
import type { ProjectTask } from '../src/lib/workbenchLogic.ts';
const round=(meetingType:string,status:ApprovalRound['status'],attempt=1)=>({meetingType,status,attempt,createdAt:`2026-10-${String(10+attempt).padStart(2,'0')}`,dueDate:'2026-11-15'} as ApprovalRound);
const state=(rounds:ApprovalRound[])=>({rounds} as ApprovalState);
test('restricted project progress remains unknown rather than fabricating an unstarted workflow',()=>{const result=projectProgress({restricted:true},[]);assert.equal(result.stage,'权限受限');assert.ok(result.nodes.every(node=>node==='unknown'));assert.equal(result.due,'');});
test('loading and partial failures never become completed stage counts',()=>{assert.equal(projectProgress(undefined,[]).stage,'读取中');assert.ok(projectProgress({error:'审批读取失败'},[]).nodes.every(node=>node==='unknown'));});
test('new projects do not fabricate approval completion',()=>{const result=projectProgress({approvals:state([]),deals:[]},[]);assert.equal(result.stage,'未发起');assert.ok(result.nodes.every(node=>node==='pending'));assert.equal(result.due,'');});
test('returned resubmission supersedes previous approval',()=>{const result=projectProgress({approvals:state([round('立项会','approved'),round('立项会','returned',2)])},[]);assert.equal(result.nodes[0],'returned');assert.equal(result.stage,'立项会');});
test('three approvals allow transaction stage without assuming a closing',()=>{const result=projectProgress({approvals:state(['立项会','总办会','投委会'].map(name=>round(name,'approved'))),deals:[]},[]);assert.deepEqual(result.nodes,['complete','complete','complete','current','pending']);});
test('post investment requires actual closing evidence',()=>{const noClosing={status:'closed'} as DealBatch;assert.notEqual(projectProgress({approvals:state([]),deals:[noClosing]},[]).stage,'投后管理');const closed={status:'closed',closing:{time:'2026-10-29'}} as DealBatch;const result=projectProgress({approvals:state([]),deals:[closed,{status:'active'} as DealBatch]},[]);assert.equal(result.stage,'投后管理');assert.equal(result.nodes[0],'pending');assert.ok(result.note.includes('另有'));});
test('date is sourced from pending approval, otherwise real open task; completed tasks excluded',()=>{const tasks=[{status:'已完成',dueDate:'2026-01-01'},{status:'未开始',dueDate:'2026-11-30'}] as ProjectTask[];assert.equal(projectProgress({approvals:state([round('立项会','pending')])},tasks).due,'2026-11-15');assert.equal(projectProgress({approvals:state([])},tasks).due,'2026-11-30');});
test('attempt number wins over clock reversal',()=>{const old={...round('立项会','returned',1),createdAt:'2026-10-29T10:00:00Z'};const current={...round('立项会','pending',2),createdAt:'2026-10-29T09:59:59Z'};const result=projectProgress({approvals:state([old,current])},[]);assert.equal(result.nodes[0],'current');assert.equal(result.due,current.dueDate);});
test('a hung project read times out and a later retry can recover',async()=>{const {readProjectProgress}=await import('../src/lib/dashboardProgress.ts');const stuck=new Promise<never>(()=>{});await assert.rejects(readProjectProgress({getApprovals:()=>stuck,getDeals:()=>stuck},'p',5),/超时/);const result=await readProjectProgress({getApprovals:async()=>state([round('立项会','approved')]),getDeals:async()=>({deals:[],currentUser:{} as never})},'p',500);assert.equal(result.approvals?.rounds[0].status,'approved');});
test('timeout aborts both HTTP reads instead of merely abandoning their results',async()=>{
 const {readProjectProgress}=await import('../src/lib/dashboardProgress.ts'); const signals:AbortSignal[]=[];
 const wait=(_id:string,signal?:AbortSignal)=>new Promise<never>((_resolve,reject)=>{assert.ok(signal);signals.push(signal);signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});});
 await assert.rejects(readProjectProgress({getApprovals:wait,getDeals:wait},'p',5)); assert.equal(signals.length,2); assert.ok(signals.every(signal=>signal.aborted));
});
test('leaving the dashboard aborts active HTTP reads',async()=>{
 const {readProjectProgress}=await import('../src/lib/dashboardProgress.ts'); const parent=new AbortController();let aborted=0;
 const wait=(_id:string,signal?:AbortSignal)=>new Promise<never>((_resolve,reject)=>{assert.ok(signal);signal.addEventListener('abort',()=>{aborted++;reject(new DOMException('aborted','AbortError'));},{once:true});});
 const result=readProjectProgress({getApprovals:wait,getDeals:wait},'p',500,parent.signal);parent.abort();await assert.rejects(result);assert.equal(aborted,2);
});

test('next action follows actual returned/rejected/unstarted approvals instead of a stale project note',()=>{
 assert.match(projectProgress({approvals:state([])},[]).nextAction,/发起立项/);
 assert.match(projectProgress({approvals:state([round('立项会','returned')])},[]).nextAction,/退回/);
 assert.match(projectProgress({approvals:state([round('立项会','rejected')])},[]).nextAction,/否决/);
 assert.equal(projectProgress({error:'failed'},[]).nextAction,'流程读取失败，请重试');
});

test('diligence and actual exit evidence override an old main-file stage without fabricating approvals',()=>{
 const diligence=projectProgress({approvals:state([]),diligence:{status:'pending'} as any},[]);assert.equal(diligence.stage,'尽调办理');assert.equal(diligence.actionTab,'尽调分析');assert.ok(diligence.nodes.every(n=>n==='pending'));
 const historical=projectProgress({approvals:state([]),asset:{status:'legacy_exited',archiveCurrent:false,openClaimCount:2} as any},[]);assert.equal(historical.stage,'历史退出待核验');assert.match(historical.nextAction,/追索/);assert.ok(historical.nodes.every(n=>n==='pending'));
 const archived=projectProgress({approvals:state([]),asset:{status:'exited',archiveCurrent:true,openClaimCount:0} as any},[]);assert.equal(archived.stage,'退出已归档');assert.match(archived.nextAction,/归档/);
 const exiting=projectProgress({approvals:state([]),asset:{status:'exiting'} as any,exit:{positions:[{outstanding:'10.01'}],executions:[]} as any},[]);assert.equal(exiting.stage,'退出办理');assert.match(exiting.nextAction,/未收/);
});
