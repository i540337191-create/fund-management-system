import test from 'node:test';import assert from 'node:assert/strict';
import {latestPostRecords,postTaskTab} from '../src/lib/postInvestmentView.ts';
test('latest records stay separate by stable ID and preserve highest version independent of input order',()=>{
 const rows=[{id:'a',version:2,period:'2026-Q2'},{id:'b',version:1,period:'2026-Q3'},{id:'a',version:1,period:'2026-Q2'}];
 assert.deepEqual(latestPostRecords(rows),rows.slice(0,2));assert.equal(rows.length,3);
 assert.equal(postTaskTab('投后审核'),'投后经营');assert.equal(postTaskTab('条款预警'),'履约预警');
});
import {findPostTaskRecord} from '../src/lib/postInvestmentView.ts';
import type {PostInvestmentState} from '../src/lib/postInvestmentTypes';
test('task source resolves exact record and closed batch, including older versions',()=>{
 const p={financials:[{id:'f1',version:1,dealId:'deal-a',reviewerTaskId:'task-a'},{id:'f2',version:1,dealId:'deal-b',reviewerTaskId:'task-b'},{id:'f2',version:2,dealId:'deal-b'}],clauses:[{id:'c1',version:1,dealId:'deal-b',warningTaskId:'warning-old'},{id:'c1',version:2,dealId:'deal-b',warningTaskId:'warning-new'}]} as PostInvestmentState;
 assert.equal(findPostTaskRecord(p,'task-b')?.dealId,'deal-b');assert.equal(findPostTaskRecord(p,'task-b')?.version,1);
 assert.equal(findPostTaskRecord(p,'warning-old')?.version,1);assert.equal(findPostTaskRecord(p,'warning-new')?.version,2);
 assert.equal(findPostTaskRecord(p,'unrelated'),undefined);assert.equal(findPostTaskRecord(p,null),undefined);
});
test('report review and missing-data tasks navigate to their exact report version and closed batch',()=>{
 assert.equal(postTaskTab('投后报告审核'),'报告记录');assert.equal(postTaskTab('投后报告补件'),'报告记录');
 const p={financials:[],clauses:[],reports:[{id:'report',version:1,dealId:'deal-b',taskIds:['review','missing']},{id:'report',version:2,dealId:'deal-b',taskIds:[]}]} as unknown as PostInvestmentState;
 assert.equal(findPostTaskRecord(p,'missing')?.version,1);assert.equal(findPostTaskRecord(p,'review')?.dealId,'deal-b');
});
test('exit review tasks navigate to investment information and retain exact plan version and batch',()=>{
 assert.equal(postTaskTab('退出方案审核'),'投资信息');
 const post={financials:[],clauses:[],exitPreparations:[{id:'exit-a',dealId:'deal-a',version:1,reviewerTaskId:'exit-review-a'},{id:'exit-b',dealId:'deal-b',version:1,reviewerTaskId:'exit-review-b'},{id:'exit-b',dealId:'deal-b',version:2}]} as unknown as PostInvestmentState;
 assert.equal(findPostTaskRecord(post,'exit-review-b')?.dealId,'deal-b');assert.equal(findPostTaskRecord(post,'exit-review-b')?.version,1);
});
