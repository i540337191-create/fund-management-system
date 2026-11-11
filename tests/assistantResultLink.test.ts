import test from 'node:test';
import assert from 'node:assert/strict';
import {actionResultLink} from '../src/lib/assistantActions.ts';
test('business results stay in the application and only owned action-document paths become downloads',()=>{
 for(const href of ['/reports','/tasks','/materials','/capital','/ai-inbox','/projects/p'])assert.deepEqual(actionResultLink(href,'https://example.test'),{href,download:false});
 const href='/api/ai/conversations/1234-abcd/actions/5678-abcd/document';assert.deepEqual(actionResultLink(href,'https://example.test'),{href,download:true});
 for(const href of ['https://other.test/projects/p','javascript:alert(1)','/api/session/login','//other.test/projects/p'])assert.equal(actionResultLink(href,'https://example.test'),null);
});
