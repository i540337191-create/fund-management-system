import test from 'node:test';import assert from 'node:assert/strict';import {savePreparedReport} from '../src/lib/reportPreparationSave.ts';import type {ReportRecord} from '../src/data/reports.ts';
const draft:ReportRecord={id:'r-stable',name:'报告',target:'基金',targetType:'fund',targetId:'f-1',type:'基金季度报告',status:'草稿',owner:'经办人',updatedAt:'v1',sections:[{title:'正文',text:'待核对'}]},ref={id:'t-1',version:1};
test('lost create or template-bind response resumes same report, preserving review status',async()=>{
 let row:ReportRecord|undefined,creates=0,binds=0,loseCreate=true,loseBind=true;
 const io={list:async()=>row?[row]:[],create:async(value:ReportRecord)=>{creates++;row=structuredClone(value);if(loseCreate){loseCreate=false;throw Error('lost create response');}return row;},bind:async(value:ReportRecord)=>{binds++;row={...value,updatedAt:'v2',templateSnapshot:{...ref,title:'模板'}};if(loseBind){loseBind=false;throw Error('lost bind response');}return row;}};
 await assert.rejects(savePreparedReport(draft,ref,io));await assert.rejects(savePreparedReport(draft,ref,io));const saved=await savePreparedReport(draft,ref,io);assert.equal(creates,1);assert.equal(binds,1);assert.equal(saved.status,'草稿');assert.equal(saved.templateSnapshot?.version,1);
});
test('a concurrent human edit or changed template is never overwritten during retry',async()=>{
 for(const changed of [{...draft,sections:[{title:'正文',text:'人工新正文'}]},{...draft,templateSnapshot:{id:'different',title:'另一个模板',version:2}}]){let writes=0;await assert.rejects(savePreparedReport(draft,ref,{list:async()=>[changed],create:async()=>{writes++;return draft;},bind:async()=>{writes++;return draft;}}));assert.equal(writes,0);}
});
test('PostgreSQL target columns and JSONB key order do not masquerade as a human edit',async()=>{
 const pg={...draft,targetType:undefined,targetId:undefined,fundId:'f-1',projectId:null,sections:[{text:'待核对',title:'正文'}]};let creates=0,binds=0;
 const result=await savePreparedReport(draft,ref,{list:async()=>[pg],create:async()=>{creates++;return draft;},bind:async r=>{binds++;return {...r,templateSnapshot:{...ref,title:'模板'}};}});assert.equal(creates,0);assert.equal(binds,1);assert.equal(result.fundId,'f-1');
 const project={...draft,targetType:'project' as const,targetId:'p-1',fundId:'f-1',projectId:'p-1'};
 await savePreparedReport(project,ref,{list:async()=>[{...project,targetType:undefined,targetId:undefined,sections:[{text:'待核对',title:'正文'}]}],create:async()=>{throw Error('Must not duplicate');},bind:async r=>r});
});
test('real target, section order, title or text changes still prevent overwrite',async()=>{
 const two={...draft,sections:[{title:'甲',text:'A'},{title:'乙',text:'B'}]};
 for(const changed of [{...two,targetId:'other'},{...two,sections:[...two.sections].reverse()},{...two,sections:[{title:'甲修改',text:'A'},two.sections[1]]},{...two,sections:[{title:'甲',text:'A修改'},two.sections[1]]}])await assert.rejects(savePreparedReport(two,ref,{list:async()=>[changed],create:async()=>{throw Error('Must not create');},bind:async()=>{throw Error('Must not write');}}),/报告已被修改/);
});
