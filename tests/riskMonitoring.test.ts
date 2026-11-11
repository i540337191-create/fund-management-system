import assert from 'node:assert/strict';
import test from 'node:test';
import { risks } from '../src/data/risks.ts';
import { projects } from '../src/data/projects.ts';
import { filterMonitoringRisks } from '../src/lib/riskMonitoring.ts';

const all = {company:'全部企业',category:'全部对象',type:'全部类型',time:'全部时间',today:'2026-11-04',start:'',end:''};
test('risk desk sorts severity without mutating examples or dropping records', () => {
  const before = risks.map(r=>r.title);
  const result = filterMonitoringRisks(risks, projects, all);
  assert.deepEqual(result.map(r=>r.level), ['高','中','中','中','低']);
  assert.equal(new Set(result.map(r=>r.title)).size,5);
  assert.deepEqual(risks.map(r=>r.title),before);
  assert.deepEqual(filterMonitoringRisks([],projects,all),[]);
});
test('monitor object categories use project membership or actual event type',()=>{
  assert.equal(filterMonitoringRisks(risks,projects,{...all,category:'拟投企业'})[0].target,'演示清洁能源有限公司');
  assert.ok(filterMonitoringRisks(risks,projects,{...all,category:'被投企业'}).every(r=>!r.title.includes('开庭公告')));
  for(const [category,type] of [['重点行业','行业动态'],['政府部门','政府公告'],['诉讼信息','诉讼信息'],['知识产权','知识产权']]) {
    const result=filterMonitoringRisks(risks,projects,{...all,category});
    assert.equal(result.length,1);assert.equal(result[0].type,type);
  }
  assert.equal(filterMonitoringRisks(risks,[],{...all,category:'被投企业'}).length,0);
});
test('company and type filters intersect, never broaden another filter',()=>{
  const company='演示智能设备有限公司';
  assert.equal(filterMonitoringRisks(risks,projects,{...all,company}).length,2);
  assert.equal(filterMonitoringRisks(risks,projects,{...all,company,type:'诉讼信息'}).length,0);
});
test('recent windows exclude archived, future and unknown dates; boundaries inclusive',()=>{
  assert.equal(filterMonitoringRisks(risks,projects,{...all,time:'近 30 天'}).length,0);
  const records=['2026-10-29','2026-10-28','2026-11-04','2026-11-05','未知'].map(time=>({...risks[0],time}));
  assert.deepEqual(filterMonitoringRisks(records,projects,{...all,time:'近 7 天'}).map(r=>r.time),['2026-10-29','2026-11-04']);
  assert.equal(filterMonitoringRisks(risks,projects,{...all,time:'近 30 天',today:'2026-05-21'}).length,5);
  assert.equal(filterMonitoringRisks(risks,projects,{...all,time:'近 30 天',today:'2026-05-22'}).length,4);
});
test('quarter and custom dates respect inclusive date bounds',()=>{
  assert.equal(filterMonitoringRisks(risks,projects,{...all,time:'本季度'}).length,0);
  assert.equal(filterMonitoringRisks(risks,projects,{...all,time:'本季度',today:'2026-04-27'}).length,5);
  assert.equal(filterMonitoringRisks(risks,projects,{...all,time:'自定义',start:'2026-04-24',end:'2026-04-26'}).length,3);
  assert.equal(filterMonitoringRisks(risks,projects,{...all,time:'自定义',start:'2026-04-27',end:'2026-04-22'}).length,0);
});
