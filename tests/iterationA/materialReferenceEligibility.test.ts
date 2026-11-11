import test from 'node:test';import assert from 'node:assert/strict';
import {materialReferenceEligibility as check} from '../../src/iterationA/materialReferenceEligibility.ts';
test('catalogue visibility does not grant engineering records or unverified versions AI reference eligibility',()=>{
 const material={id:'m',currentVersionId:'v1'};
 assert.equal(check(material,material,true).allowed,true);
 for(const testSource of [{dataPurpose:'engineering_fixture'},{currentVersionPurpose:'engineering_fixture'},{sourceBasis:[{dataPurpose:'engineering_fixture'}]}])assert.match(check({...material,...testSource},material,true).reason,/测试资料/);
 assert.equal(check(material,undefined,false).allowed,false);
 assert.equal(check(material,undefined,true).allowed,false);
 assert.match(check({...material,currentVersionId:'v2'},material,true).reason,/版本已变化/);
});
