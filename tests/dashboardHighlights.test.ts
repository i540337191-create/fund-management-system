import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardHighlights} from '../src/lib/dashboardHighlights.ts';
const now=Date.parse('2026-11-07T12:00:00+08:00');
const projects=[{id:'p1',name:'甲项目',shortName:'甲'},{id:'p2',name:'乙项目',shortName:'乙'}],funds=[{id:'f1',name:'乙基金'}];
const task=(id:string,projectId?:string)=>({id,item:'办理'+id,status:'未开始',action:'现在处理' as const,projectId,dueAt:'2026-11-06T00:00:00+08:00'});
test('mountain callouts use actual tasks, deduplicate objects and include fund work without fixed project names',()=>{
 const result=dashboardHighlights([task('a','p1'),task('b','p1'),{...task('c'),fundId:'f1'}],[],projects,funds,now);
 assert.deepEqual(result.map(r=>r.subject),['甲','乙基金']);assert.deepEqual(result.map(r=>r.taskId),['a','c']);assert.equal(result[1].detail,'办理c');
});
test('completion and missing permissions remove old callouts; an unrelated newly created fund does not occupy them',()=>{
 const result=dashboardHighlights([{...task('a','p1'),status:'已完成'},task('b','p2')],[],projects,[...funds,{id:'new',name:'刚创建基金'}],now);
 assert.equal(result.length,1);assert.equal(result[0].subject,'乙');
 assert.deepEqual(dashboardHighlights([task('a','hidden')],[],projects,funds,now),[]);
 assert.deepEqual(dashboardHighlights([{...task('a','p1'),sourceUnavailable:true}],[],projects,funds,now),[]);
 assert.deepEqual(dashboardHighlights([{...task('a','p1'),action:'持续观察',dueAt:'2026-12-01T00:00:00+08:00'}],[],projects,funds,now),[]);
});
test('active high risk comes first and resolved/deleted risks never remain as mountain labels',()=>{
 const risk={id:'r1',projectId:'p2',title:'许可待核查',target:'乙项目',type:'合规',level:'高' as const,status:'待跟进',source:'登记',time:'2026-11-07',summary:'查验原件'};
 assert.equal(dashboardHighlights([task('a','p1')],[risk],projects,funds,now)[0].id,'risk:r1');
 assert.equal(dashboardHighlights([],[{...risk,status:'已处理'}],projects,funds,now).length,0);
 assert.equal(dashboardHighlights([],[{...risk,deletedAt:'2026-11-07'}],projects,funds,now).length,0);
});
