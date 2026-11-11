import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardTaskCounts,dashboardCurrentReport,dashboardTaskBadge,dashboardLatestReport,dashboardReportHighlights} from '../src/lib/dashboardOverview.ts';
import {fundStageFromSearch,icebergFundStages} from '../src/lib/dashboardLifecycle.ts';
test('task counts partition actual statuses without relabelling unknown states as confirmed',()=>{
 const counts=dashboardTaskCounts([{status:'待审核'},{status:'待确认'},{status:'待确认'},{status:'待核查'},{status:'未开始'},{status:'等待中'}]);
 assert.deepEqual(counts,{review:1,confirm:2,verify:1,other:2});
 assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),6);
 assert.deepEqual(dashboardTaskCounts([]),{review:0,confirm:0,verify:0,other:0});
});
test('current report uses the current Beijing week and visible owner scope, never a future or other personal report',()=>{
 const reports=[{id:'future',week:'2027-W01',ownerId:'me'},{id:'other',week:'2026-W45',ownerId:'other'},{id:'old',week:'2026-W45',ownerId:'me',createdAt:'2026-11-02T00:00:00Z'},{id:'new',week:'2026-W45',scope:'organization',createdAt:'2026-11-06T00:00:00Z'}];
 assert.equal(dashboardCurrentReport(reports,'me',new Date('2026-11-07T00:00:00Z'))?.id,'new');
 assert.equal(dashboardCurrentReport(reports,undefined,new Date('2026-11-07T00:00:00Z')),undefined);
 assert.equal(dashboardCurrentReport(reports,'me',new Date('2026-11-09T00:00:00+08:00')),undefined);
});
test('task urgency badge follows real due timestamps without changing the stored workflow status',()=>{
 const task={status:'未开始',dueAt:'2026-11-06T16:00:00Z'};
 const saved=JSON.stringify(task);
 assert.deepEqual(dashboardTaskBadge(task,Date.parse('2026-11-07T00:00:00Z')),{label:'逾期',tone:'overdue'});
 assert.equal(JSON.stringify(task),saved);
 assert.deepEqual(dashboardTaskBadge({status:'待确认',dueAt:'invalid'},0),{label:'待确认',tone:'normal'});
 assert.deepEqual(dashboardTaskBadge({status:'待审核',dueAt:'2026-11-10T00:00:00Z'},Date.parse('2026-11-07T00:00:00Z')),{label:'待审核',tone:'normal'});
});
test('fund phase links accept only registered lifecycle stages and preserve unrelated query parameters',()=>{
 for(const stage of icebergFundStages)assert.equal(fundStageFromSearch('?other=1&stage='+encodeURIComponent(stage)),stage);
 assert.equal(fundStageFromSearch('?stage=unknown'),'全部阶段');assert.equal(fundStageFromSearch(''),'全部阶段');
});
test('latest report uses saved creation order and visible ownership, retaining a historical reporting week',()=>{
 const reports=[{id:'old',ownerId:'me',week:'2026-W45',createdAt:'2026-11-01T00:00:00Z'},{id:'latest',scope:'organization',week:'2026-W44',createdAt:'2026-11-07T00:00:00Z'},{id:'private',ownerId:'other',createdAt:'2026-11-08T00:00:00Z'}];
 assert.equal(dashboardLatestReport(reports,'me')?.id,'latest');assert.equal(dashboardLatestReport(reports,undefined),undefined);
});
test('report highlights quote stored content instead of creating synthetic achievements',()=>{
 const report={thisWeek:'1. 完成审计核对。\n2、2025年报告已归档',nextWeek:'继续跟进管理费',taskIds:['t1']};
 assert.deepEqual(dashboardReportHighlights(report),['本周 · 完成审计核对','本周 · 2025年报告已归档','计划 · 继续跟进管理费']);
 assert.equal(dashboardReportHighlights({thisWeek:'1.2亿元数据待核对'})[0],'本周 · 1.2亿元数据待核对');
 assert.deepEqual(dashboardReportHighlights({thisWeek:'23日已完成核验',nextWeek:'下周复核',taskIds:['a','b']}),['本周 · 23日已完成核验','计划 · 下周复核','关联待办 · 2 项']);
});
