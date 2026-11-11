import test from 'node:test';import assert from 'node:assert/strict';
import {projects} from '../src/data/projects.ts';
import type {AssetHistoryView,ExitClaim} from '../src/lib/assetHistoryTypes.ts';
const actor={id:'claim-reviewer',name:'处理人',email:'reviewer@example.test',role:'post_investment'};
function assetFixture(projectId:string):AssetHistoryView {
 return {projectId,name:'历史项目',legacyStatus:'已投',fundIds:[],status:'exited',statusLabel:'已退出',inManagedMetrics:false,legacyUnverified:false,blockers:[],positions:[],archiveCurrent:true,currentArchiveId:null,openClaimCount:0,archives:[],claims:[],latestClaims:[],revision:1,currentUser:actor,mayArchive:false,mayManageClaims:false};
}
function claimFixture(version:number,status:ExitClaim['status']):ExitClaim {
 return {id:'claim-history',version,status,title:`追索标题第${version}版`,description:`处理正文第${version}版`,reason:`变更原因第${version}版`,evidence:[],actor,time:'2026-10-30T02:00:00Z'};
}
import {withAssetHistory,isHistoricalAsset,isExitingAsset,isManagedProject,assetAiContext,assetAiNotice,matchesProjectAssetCategory} from '../src/lib/projectAssetHistory.ts';
import {deriveDashboardDecisions,isActiveDashboardReport} from '../src/lib/workbenchLogic.ts';
test('actual archive projection overrides a stale original lifecycle for metrics without changing original status',()=>{
 const original={...projects[0],status:'已投' as const};const asset=assetFixture(original.id);const [display]=withAssetHistory([original],[asset]);assert.equal(original.status,'已投');assert.equal(display.status,'已投');assert.equal(isHistoricalAsset(display),true);assert.equal(isManagedProject(display),false);
 const [reopened]=withAssetHistory([original],[{...asset,status:'exiting',statusLabel:'退出中',inManagedMetrics:true}]);assert.equal(isExitingAsset(reopened),true);assert.equal(isHistoricalAsset(reopened),false);assert.equal(isManagedProject(reopened),true);
 assert.match(assetAiContext('有哪些已退出项目？',[display]),/已退出/);assert.match(assetAiContext('汇总所有项目风险',[display]),/已退出/);assert.match(assetAiNotice('有哪些已退出项目？',[display]),/历史资产1个/);assert.match(assetAiContext('它还要做什么',[display],original.shortName),/已退出/);assert.match(assetAiContext(original.shortName,[display]),/已退出/);assert.match(assetAiNotice(original.shortName,[display]),/不纳入常规在管统计/);
 assert.match(assetAiContext('在管项目多少',[original]),/不能确认/);
 const legacy={...original,status:'已退出' as const};assert.match(assetAiNotice(legacy.shortName,[legacy]),/历史完成证据尚未核验/);assert.equal(isHistoricalAsset({...legacy,status:'退出'}),false);
});
test('historical ordinary post tasks/reports leave active dashboard while follow-up and open claims remain visible',()=>{
 const p={...projects[0],assetState:'exited' as const,assetManaged:false,assetStateLabel:'已退出',assetOpenClaims:1};const task=(id:string,type:string):any=>({id,name:type,type,status:'未开始',priority:'中',dueDate:'2026-10-30',stage:'投后管理',owner:'负责人',relation:'归档',note:''});
 const result=deriveDashboardDecisions({projects:[p],risks:[],capitalItems:[],tasksByProject:{[p.id]:[task('ordinary','每月投后报表'),task('legal','法务追索'),{...task('returns','收益依据审核'),kind:'review',relation:'returns'}]},reports:[{id:'report',projectId:p.id,name:'普通月报',target:p.name,type:'企业监控报告',status:'待审核',owner:'负责人',updatedAt:'2026-10-30'}]});
 assert.doesNotMatch(result.projectHealth[0].signal,/每月投后报表/);assert.equal(result.operationTodos.some(x=>'taskId' in x&&x.taskId==='ordinary'),false);assert.equal(result.operationTodos.some(x=>'taskId' in x&&x.taskId==='legal'),true);assert.equal(result.operationTodos.some(x=>'taskId' in x&&x.taskId==='returns'),true);assert.equal(result.operationTodos.some(x=>x.sourceId==='report:report'),false);assert.ok(result.operationTodos.some(x=>x.sourceId===`exit-claims:${p.id}`));
});

test('historical ordinary reports use the same eligibility for dashboard counts and todos',()=>{const p={...projects[0],assetState:'exited' as const,assetManaged:false};const report:any={projectId:p.id,target:p.name,type:'企业监控报告',name:'普通月报'};assert.equal(isActiveDashboardReport(report,[p]),false);assert.equal(isActiveDashboardReport({...report,type:'退出复盘报告'},[p]),true);});

test('list and stage counts share the same asset category, with exiting distinct from historical',()=>{const normal={...projects[0],assetState:'managed' as const,assetManaged:true},exiting={...normal,id:'exiting',assetState:'exiting' as const},historical={...normal,id:'historical',assetState:'exited' as const,assetManaged:false};const items=[normal,exiting,historical];assert.deepEqual(items.filter(p=>matchesProjectAssetCategory(p,'退出中')).map(p=>p.id),['exiting']);assert.deepEqual(items.filter(p=>matchesProjectAssetCategory(p,'已退出')).map(p=>p.id),['historical']);assert.equal(items.filter(p=>matchesProjectAssetCategory(p,'在管项目')).length,2);assert.equal(matchesProjectAssetCategory(historical,'已投项目'),false);});

for(const field of ['title','description','reason'] as const){
 test(`project search retains every visible claim ${field} after resolving and reopening`,()=>{
  const original={...projects[0]},before=structuredClone(original);
  const versions=[claimFixture(1,'open'),claimFixture(2,'resolved'),claimFixture(3,'open')];
  for(let count=1;count<=versions.length;count++){
   const claims=versions.slice(0,count),latest=claims[count-1];
   const asset={...assetFixture(original.id),claims,latestClaims:[latest],openClaimCount:latest.status==='open'?1:0};
   const assetBefore=structuredClone(asset);
   const [display]=withAssetHistory([original],[asset]);
   for(const claim of claims){
    const query=claim[field];
    assert.equal([display].filter(p=>p.name.includes(query)||p.shortName.includes(query)||Boolean(p.assetClaimText?.includes(query))).length,1,`V${claim.version} ${field} must remain searchable at V${count}`);
   }
   assert.equal(display.assetOpenClaims,asset.openClaimCount);
   assert.deepEqual(original,before);
   assert.deepEqual(asset,assetBefore);
  }
 });
}
test('claim search stays within supplied project history and excludes evidence and actor metadata',()=>{
 const original={...projects[0]},other={...projects[1]},claim=claimFixture(1,'open');
 claim.evidence=[{materialId:'restricted-material',versionId:'restricted-version',name:'无权查看凭证',readIssue:'forbidden',sha256:'proof-hash',sizeBytes:1,downloadHref:'/private-proof'}];
 const [display,unmatched]=withAssetHistory([original,other],[{...assetFixture(original.id),claims:[claim],latestClaims:[claim],openClaimCount:1}]);
 assert.equal(display.assetClaimText,`${claim.title} ${claim.description} ${claim.reason}`);
 for(const metadata of ['restricted-material','restricted-version','无权查看凭证','forbidden','proof-hash','/private-proof',actor.email,actor.id])assert.equal(display.assetClaimText?.includes(metadata),false);
 assert.equal(unmatched,other);
 const [empty]=withAssetHistory([original],[assetFixture(original.id)]);
 assert.equal(empty.assetClaimText,'');
 assert.equal(withAssetHistory([original],null)[0],original);
});
