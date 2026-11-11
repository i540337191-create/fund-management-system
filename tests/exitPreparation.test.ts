import test from 'node:test';import assert from 'node:assert/strict';
import {exitPreparationMissing} from '../src/lib/exitPreparation.ts';
test('zero consideration is known while absent documents and unknown price remain explicit missing items',()=>{
 const documents:any=['plan','negotiation','agreement'].map(kind=>({kind}));
 assert.deepEqual(exitPreparationMissing({documents,consideration:'0.00'}),[]);
 assert.deepEqual(exitPreparationMissing({documents:documents.slice(0,1),consideration:null}),['谈判函件','协议材料','已明确的退出对价']);
});
