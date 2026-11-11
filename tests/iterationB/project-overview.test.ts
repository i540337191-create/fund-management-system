import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overviewRequirements,overviewApprovalBlocks} from '../../src/iterationB/projectOverviewModel.ts';
import type {DiligenceCase} from '../../src/lib/diligenceTypes.ts';
import type {ApprovalState} from '../../src/lib/apiClient.ts';
test('requirements use latest submission and distinguish missing from unreadable originals',()=>{
 const diligence={items:[{id:'a',taskId:'t-a',title:'原件',status:'returned',requirements:[{id:'r1'},{id:'r2'}],submissions:[{version:1,evidence:[{requirementId:'r1',material:{}},{requirementId:'r2',material:{}}]},{version:2,evidence:[{requirementId:'r1',material:{readIssue:'restricted'}}]}]}]} as unknown as DiligenceCase;
 assert.deepEqual(overviewRequirements(diligence),[{id:'a',taskId:'t-a',title:'原件',required:2,missing:1,unreadable:1,status:'returned',version:2}]);assert.deepEqual(overviewRequirements(null),[]);
});
test('superseded returned approvals do not remain current blockers',()=>{
 const approvals={rounds:[{id:'old',meetingType:'投委会',attempt:1,createdAt:'2026-01-01',status:'returned'},{id:'new',meetingType:'投委会',attempt:2,createdAt:'2026-02-01',status:'approved'},{id:'block',meetingType:'立项会',attempt:1,createdAt:'2026-03-01',status:'rejected'}]} as ApprovalState;
 assert.deepEqual(overviewApprovalBlocks(approvals).map(round=>round.id),['block']);
});
