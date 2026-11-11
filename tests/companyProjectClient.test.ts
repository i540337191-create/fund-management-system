import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../src/lib/apiClient.ts';
import {companyBindingPayload,emptyCompanyBinding,canEditProjectMaster,type ProjectMasterInput} from '../src/lib/companyProjectTypes.ts';

test('company binding requires an explicit ID or independently entered metadata and leaves unknown identity unbound',()=>{
 assert.deepEqual(companyBindingPayload(emptyCompanyBinding()),{});
 assert.throws(()=>companyBindingPayload({...emptyCompanyBinding(),mode:'existing'}),/明确选择/);
 assert.deepEqual(companyBindingPayload({...emptyCompanyBinding(),mode:'existing',companyId:'company-same-name-b'}),{companyId:'company-same-name-b'});
 assert.throws(()=>companyBindingPayload({...emptyCompanyBinding(),mode:'new',newCompany:{name:'同名不是身份',shortName:'',industry:''}}),/名称与简称/);
 assert.deepEqual(companyBindingPayload({...emptyCompanyBinding(),mode:'new',newCompany:{name:' 主体名称 ',shortName:' 主体 ',industry:''}}),{newCompany:{name:'主体名称',shortName:'主体',industry:''}});
});

test('project and company master clients preserve target identity, revision, unknown fields, and original request during retry',async()=>{
 const seen:{url:string;method?:string;body?:string}[]=[];
 const api=createApiClient({fetchImpl:async(url,init)=>{seen.push({url:String(url),method:init?.method,body:init?.body as string});return new Response('{}',{headers:{'content-type':'application/json'}});}});
 const input:ProjectMasterInput={requestId:'one-request',expectedRevision:7,name:'项目名称',shortName:'项目',industry:'行业',description:'',companyId:'company-b'};
 await api.updateProjectMaster('project /一',input);await api.updateProjectMaster('project /一',input);
 assert.equal(seen[0].url,'/api/projects/project%20%2F%E4%B8%80');assert.equal(seen[0].method,'PATCH');assert.equal(seen[0].body,seen[1].body);assert.deepEqual(JSON.parse(seen[0].body!),input);
 await api.updateCompany('company /二',{requestId:'company-edit',expectedRevision:3,name:'企业改名',shortName:'企业',industry:''});assert.equal(seen[2].url,'/api/companies/company%20%2F%E4%BA%8C');assert.equal(JSON.parse(seen[2].body!).expectedRevision,3);
 await api.createProject({requestId:'new-project',name:'项目名称',shortName:'项目',industry:'工程',fundId:'fund-a',manager:'',collaborators:'',sourceChannel:'',description:'',newCompany:{name:'独立主体',shortName:'主体',industry:''}});assert.equal(JSON.parse(seen[3].body!).newCompany.name,'独立主体');
 assert.equal(canEditProjectMaster('admin'),true);assert.equal(canEditProjectMaster('investment_manager'),true);for(const r of ['finance','viewer','legal','post_investment',undefined])assert.equal(canEditProjectMaster(r),false);
});
