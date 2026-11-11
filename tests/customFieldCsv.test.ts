import assert from 'node:assert/strict';
import test from 'node:test';
import {customFieldCsv,csvCell} from '../src/lib/customFieldCsv.ts';
import type {CustomExportSnapshot,CustomField} from '../src/lib/customFields.ts';
const f=(id:string,type:CustomField['type']='text'):CustomField=>({id,label:id,type,order:0,required:false,enabled:true,options:[]});
function parse(text:string){const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;for(let i=1;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&c===','){row.push(cell);cell='';}else if(!quoted&&c==='\r'&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}else cell+=c;}return rows;}
test('CSV is actual BOM text with quoted Chinese/newlines, zero/false, stable option IDs and disabled history',()=>{
 const fields=[f('note'),f('n','number'),f('b','boolean'),{...f('choice','singleChoice'),options:[{id:'old',label:'旧分类',enabled:false}]},{...f('legacy'),enabled:false},f('toString')];
 const snapshot:CustomExportSnapshot={objectType:'project',capturedAt:'2026-11-01T12:00:00.000Z',schema:{schemaRevision:3,fields},records:[{id:'p',name:'中文,公司"名"\n下一行',dataOrigin:'user_input',schemaRevision:2,customFields:{note:'两行\n正文',n:'0',b:false,choice:'old',legacy:'历史保留'}}]};
 const out=customFieldCsv(snapshot,true);assert.equal(out.rows,1);const rows=parse(out.text),header=rows[0],data=rows[1];assert.equal(data[header.indexOf('名称')],snapshot.records[0].name);assert.equal(data[header.indexOf('n [n]')],'0');assert.equal(data[header.indexOf('b [b]')],'否');assert.equal(data[header.indexOf('choice选项标识 [choice]')],'old');assert.equal(data[header.indexOf('legacy（已停用） [legacy]')],'历史保留');assert.equal(data[header.indexOf('toString [toString]')],'');assert.equal(data[header.indexOf('数据填写版本')],'2');assert.equal(data[header.indexOf('字段设置版本')],'3');
});
test('snapshot source filtering excludes precise engineering records and never infers from names',()=>{
 const snapshot:CustomExportSnapshot={objectType:'company',capturedAt:'2026-11-01T12:00:00Z',schema:{schemaRevision:1,fields:[]},records:[{id:'fixture',name:'普通名称',dataOrigin:'user_input',dataPurpose:'engineering_fixture'},{id:'kept',name:'工程测试',dataOrigin:'user_input'}]};
 assert.equal(customFieldCsv(snapshot,true).rows,1);assert.equal(customFieldCsv(snapshot,false).rows,2);assert.match(customFieldCsv(snapshot,true).text,/工程测试/);
});
test('spreadsheet formula prefixes and quotes are escaped rather than executed',()=>{
 for(const value of ['=1+1','+SUM(A1)','-2+3','@SUM(A1)',' \t=1'])assert.ok(csvCell(value).startsWith('"\''));assert.equal(csvCell('公司"资料"'),'"公司""资料"""');assert.equal(csvCell(false),'"false"');
});
