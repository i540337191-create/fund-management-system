import test from 'node:test';
import assert from 'node:assert/strict';
import {lpNumberPattern} from '../src/lib/lpProfile.ts';
import {applyLpIntake,lpIntakeFields,lpIntakeLabels} from '../src/lib/lpIntake.ts';
const master={name:'',type:'自然人',contactName:'',contactPhone:'',contactEmail:'',profile:{kind:'natural' as const,fields:{identityNumber:'prior synthetic'}}};
const templates=[{id:'synthetic-template',fields:[{id:'confirmed',label:'人工确认',enabled:true,type:'boolean'},{id:'date',label:'核对日期',enabled:true,type:'date'},{id:'choice',label:'分类',enabled:true,type:'choice',options:['待核对','已核对']}]}];
test('LP original candidates map only to selected profile/core fields and preserve typed custom false',()=>{
 const adopted=applyLpIntake(master,{name:'synthetic LP','profile.fields.identityNumber':'synthetic id','profile.extraFields.synthetic-template:confirmed':'否','profile.extraFields.synthetic-template:date':'2026-11-05'},templates);
 assert.equal(adopted.name,'synthetic LP');assert.equal(adopted.profile!.fields.identityNumber,'synthetic id');assert.equal(adopted.profile!.extraFields!['synthetic-template:confirmed'],false);assert.equal(master.profile.fields.identityNumber,'prior synthetic');assert.equal(lpIntakeFields(adopted)['profile.extraFields.synthetic-template:confirmed'],'false');assert.equal(lpIntakeLabels(adopted.profile,templates)['profile.fields.identityNumber'],'证件号码');
});
test('LP adoption rejects financial posting fields, mismatched category, undeclared fields and invalid options/dates',()=>{
 for(const values of [{amount:'1000'},{commitment:'1000'},{paidIn:'1000'},{signStatus:'已签署'},{type:'机构'},{'profile.fields.filingNumber':'wrong category'},{'profile.extraFields.synthetic-template:choice':'invented'},{'profile.extraFields.synthetic-template:date':'2026-02-30'},{'profile.extraFields.synthetic-template:confirmed':'maybe'}])assert.throws(()=>applyLpIntake(master,values,templates));
});
test('LP number HTML pattern is valid under browser unicodeSets semantics',()=>{
 const pattern=lpNumberPattern;const regex=new RegExp('^(?:'+pattern+')$','v');for(const value of ['1000','-1.5','+2','0'])assert(regex.test(value));for(const value of ['1e3','NaN','123abc'])assert(!regex.test(value));
});
test('all three original LP forms accept their own source-backed fields without mixing categories',()=>{
 for(const [kind,type,key] of [['natural','自然人','identityNumber'],['institution','机构','representativeIdentityNumber'],['product','产品','filingNumber']] as const){const current={name:'',type,contactName:'',contactPhone:'',contactEmail:'',profile:{kind,fields:{}}};const result=applyLpIntake(current,{['profile.fields.'+key]:'SYNTHETIC-'+kind},[]);assert.equal((result.profile!.fields as Record<string,string>)[key],'SYNTHETIC-'+kind);}
});
test('natural-person bank proof fills reserved account metadata without creating financial entries',()=>{
 const adopted=applyLpIntake(master,{'profile.fields.reservedBankName':'合成银行','profile.fields.reservedBankAccount':'SYNTHETIC-ACCOUNT','profile.fields.reservedAccountHolder':'合成持有人'},[]);
 assert.equal(adopted.profile!.fields.reservedBankAccount,'SYNTHETIC-ACCOUNT');assert.equal((adopted as any).commitment,undefined);assert.equal((adopted as any).paidIn,undefined);
});
test('institution and product bank proof metadata is optional and explicitly source classified',()=>{
 for(const [kind,type]of [['institution','机构'],['product','产品']] as const){const adopted=applyLpIntake({...master,type,profile:{kind,fields:{}}},{'profile.fields.reservedBankAccount':'SYNTHETIC-OPTIONAL-ACCOUNT','profile.fields.bankProofClassification':'自行提供的打款回单'},[]);assert.equal(adopted.profile!.fields.reservedBankAccount,'SYNTHETIC-OPTIONAL-ACCOUNT');assert.equal(adopted.profile!.fields.bankProofClassification,'自行提供的打款回单');}
});
test('actual model category enum from PNG E2E adopts into user-facing investor type',()=>{
 const adopted=applyLpIntake({...master,type:'机构',profile:{kind:'institution',fields:{}}},{type:'institution'},[]);assert.equal(adopted.type,'机构');assert.equal(adopted.profile!.kind,'institution');
});
