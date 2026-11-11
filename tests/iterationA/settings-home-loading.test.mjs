import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';
import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),module={exports:{}};
const source=readFileSync(new URL('../../src/components/SettingsOverview.tsx',import.meta.url),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{exports:module.exports,React,require:id=>id.endsWith('.css')?{}:require(id)});
const props={role:'admin',account:null,aiState:'正在检查',onOpen:()=>{},onAuditExport:()=>{},onRevoke:()=>{},reminders:null};
const render=extra=>renderToStaticMarkup(React.createElement(module.exports.SettingsOverview,{...props,...extra}));
test('pending audit reads remain unverified rather than becoming zero, while a verified zero remains visible',()=>{
 assert.match(render({}),/记录数量尚未核实/);assert.doesNotMatch(render({}),/当前可见 0 条记录/);
 assert.match(render({auditCount:0}),/当前可见 0 条记录/);
 assert.match(render({auditCount:588}),/当前可见 588 条记录/);
});
test('settings keeps direct business entries and hides administrator scope configuration for viewers',()=>{
 assert.match(render({}),/设置可见范围/);assert.doesNotMatch(render({role:'viewer'}),/设置可见范围/);
 for(const label of ['管理账号','管理业务字段','管理业务模板','管理本人会话','查看服务状态','查看记录'])assert.match(render({}),new RegExp(label));
});
