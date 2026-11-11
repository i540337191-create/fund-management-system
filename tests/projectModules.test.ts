import test from 'node:test';
import assert from 'node:assert/strict';
import {projectModules,projectModuleFor,projectView} from '../src/lib/projectModules.ts';
test('eight modules cover every previous business tab without exposing duplicate investment pages',()=>{
 assert.equal(projectModules.length,8);
 const legacy=['项目概览','三会审批','投资信息','资料目录','协议条款','资料文件','任务待办','尽调分析','投后经营','走访记录','期间档案','履约预警','决策支持','报告记录','风险监控','会议纪要','资金事项'];
 for(const name of legacy)assert.ok(projectModuleFor(name),name);
 assert.equal(projectView('协议条款'),'投资信息');assert.equal(projectView('无权编造模块'),'项目概览');
 assert.equal(projectModuleFor('履约预警').name,'风险与履约');assert.equal(projectModuleFor('报告记录').name,'项目文档');assert.equal(projectView('尽调与决策'),'尽调分析');
 const views=projectModules.flatMap(m=>[...m.views]);assert.equal(new Set(views).size,views.length);
});
