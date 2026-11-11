import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {AgentRepository} from '../src/agent/repository.ts';
import {registerReportRoutes} from '../src/http/reports.ts';

test('report content and historical template snapshot commit together; conflict changes neither',async()=>{
 const store=createMemoryLedgerStore(),repository=new AgentRepository(),server=Fastify();
 registerReportRoutes(server,store,{auth:{mode:'local-bypass'},agentRepository:repository});
 const project=store.listProjects()[0],report=store.createReport({name:'模板并发工程样例',target:project.name,targetId:project.id,targetType:'project',type:'项目报告',status:'草稿',owner:'经办人',updatedAt:'2026-11-01T00:00:00.000Z',sections:[{title:'旧正文',text:'原始正文'}]}).report;
 const original={id:'historical-template',ownerId:'user-admin',scope:'organization' as const,title:'旧版模板',objectType:'report' as const,stage:'',fields:[],materials:[],version:1,status:'published' as const};
 await repository.transaction(s=>{s.templateHistory.push(original);s.templates.push({...original,title:'新版模板',version:2});});
 try{
  const url=`/api/reports/${report.id}/content`,payload={sections:[{title:'新正文',text:'人工核对后的正文'}],expectedUpdatedAt:report.updatedAt,templateRef:{id:original.id,version:1}};
  let r=await server.inject({method:'PATCH',url,payload});assert.equal(r.statusCode,200,r.body);const saved=r.json().report;assert.equal(saved.templateSnapshot.title,'旧版模板');assert.deepEqual(saved.sections,payload.sections);
  const events=store.listAuditEvents().length;
  r=await server.inject({method:'PATCH',url,payload:{...payload,sections:[{title:'过期窗口',text:'不能覆盖'}],templateRef:{id:original.id,version:2}}});assert.equal(r.statusCode,409,r.body);assert.deepEqual(store.listReports().find(x=>x.id===report.id),saved);assert.equal(store.listAuditEvents().length,events);
  r=await server.inject({method:'PATCH',url,payload:{...payload,expectedUpdatedAt:saved.updatedAt,templateRef:{id:original.id,version:999}}});assert.equal(r.statusCode,409,r.body);assert.deepEqual(store.listReports().find(x=>x.id===report.id),saved);
  const read=await server.inject({url:'/api/reports?includeDemo=true'});assert.equal(read.json().reports.find((x:any)=>x.id===report.id).templateSnapshot.version,1);
 }finally{await server.close();}
});
