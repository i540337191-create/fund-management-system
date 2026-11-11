import test from 'node:test';
import assert from 'node:assert/strict';
import {inferFileProject,inferFileType} from '../src/lib/intakeFiles.ts';
test('intake infers only one unambiguous project and respects explicit selection',()=>{
 const projects=[{id:'a',name:'甲公司',shortName:'甲企'},{id:'b',name:'乙公司',shortName:'乙企'}];
 assert.equal(inferFileProject('甲公司会议纪要.pdf',projects),'a');assert.equal(inferFileProject('甲公司乙公司协议.pdf',projects),'');assert.equal(inferFileProject('不明归属.png',projects),'');assert.equal(inferFileProject('甲公司.pdf',projects,'b'),'b');
});
test('audio and meeting files suggest minutes, financial documents suggest finance',()=>{
 const types=['项目资料','会议纪要','财务资料'];assert.equal(inferFileType('访谈.m4a',types),'会议纪要');assert.equal(inferFileType('年度财务报表.pdf',types),'财务资料');assert.equal(inferFileType('未知.png',types),'项目资料');
});
