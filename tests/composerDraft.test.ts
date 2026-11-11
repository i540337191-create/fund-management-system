import test from 'node:test';
import assert from 'node:assert/strict';
import {readComposerDraft,writeComposerDraft,lastComposerConversation} from '../src/lib/composerDraft.ts';
function storage(){const map=new Map<string,string>();return{getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);}};}
test('composer drafts retain independent account and conversation input/context',()=>{
 const s=storage(),a={conversationId:'conversation-a',input:'A 未发送',projectId:'project-a',materialIds:['material-a']},b={conversationId:'conversation-b',input:'B 未发送',projectId:'project-b',materialIds:[]};
 assert.equal(writeComposerDraft(s,'account-a',a),true);writeComposerDraft(s,'account-a',b);
 assert.deepEqual(readComposerDraft(s,'account-a','conversation-a'),a);assert.deepEqual(readComposerDraft(s,'account-a','conversation-b'),b);
 assert.equal(readComposerDraft(s,'account-b','conversation-a'),null);assert.equal(lastComposerConversation(s,'account-a'),'conversation-b');assert.equal(lastComposerConversation(s,'account-b'),undefined);
 writeComposerDraft(s,'account-a',{input:'新对话草稿',projectId:'',materialIds:[]});assert.equal(lastComposerConversation(s,'account-a'),undefined);assert.deepEqual(readComposerDraft(s,'account-a','conversation-a'),a);
});
test('invalid storage and denied storage do not invent drafts or block conversation reads',()=>{
 assert.equal(readComposerDraft({getItem:()=>'{invalid',setItem:()=>{}},'a'),null);
 assert.equal(readComposerDraft({getItem:()=>JSON.stringify({input:'x',projectId:'',materialIds:[42]}),setItem:()=>{}},'a'),null);
 assert.equal(readComposerDraft(null,'a'),null);assert.equal(lastComposerConversation(null,'a'),undefined);
 assert.equal(writeComposerDraft(null,'a',{input:'',projectId:'',materialIds:[]}),false);
 const denied={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('quota');}};
 assert.equal(readComposerDraft(denied,'a'),null);assert.equal(writeComposerDraft(denied,'a',{input:'',projectId:'',materialIds:[]}),false);
});
