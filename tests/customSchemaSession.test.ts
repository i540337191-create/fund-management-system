import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptClientSession,clientSessionEpoch,invalidateClientSession} from '../src/lib/sessionBoundary.ts';
import {readSchemaSessionDraft,saveSchemaSessionDraft,hasSchemaSessionWork,type SchemaSessionDraft} from '../src/lib/customSchemaSession.ts';
function draft():SchemaSessionDraft{return {base:{schemaRevision:2,fields:[]},draft:[],pending:{requestId:'same-request',expectedRevision:2,fields:[]},unknown:true,blocked:false,error:'连接中断',notice:'',latest:null,conflict:false};}
test('navigation restores independent object drafts and the exact uncertain request without aliasing',()=>{
 acceptClientSession('admin-a');const epoch=clientSessionEpoch(),saved=draft();saveSchemaSessionDraft(epoch,'project',saved);
 saveSchemaSessionDraft(epoch,'company',{...draft(),pending:null,unknown:false});
 assert.deepEqual(readSchemaSessionDraft('project'),saved);assert.equal(hasSchemaSessionWork(),true);
 const restored=readSchemaSessionDraft('project')!;restored.pending!.requestId='must-not-replace-original';
 assert.equal(readSchemaSessionDraft('project')!.pending!.requestId,'same-request');
 assert.equal(readSchemaSessionDraft('company')!.pending,null);
 saveSchemaSessionDraft(epoch,'project',{...saved,pending:null,unknown:false});assert.equal(hasSchemaSessionWork(),false);
});
test('invalidation and account rotation erase cached work and reject late previous-session writes',()=>{
 acceptClientSession('admin-a');const old=clientSessionEpoch();saveSchemaSessionDraft(old,'fund',draft());
 invalidateClientSession();assert.equal(readSchemaSessionDraft('fund'),null);assert.equal(hasSchemaSessionWork(),false);
 acceptClientSession('admin-b');saveSchemaSessionDraft(old,'fund',draft());assert.equal(readSchemaSessionDraft('fund'),null);
 saveSchemaSessionDraft(clientSessionEpoch(),'fund',draft());acceptClientSession('admin-c');assert.equal(readSchemaSessionDraft('fund'),null);
});
