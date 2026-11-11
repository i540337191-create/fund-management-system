import {preparePostVisualFixture} from '../iterationB/post-visual-fixture.ts';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from '../../server/src/index.ts';
import {createReferenceVisualStore} from './reference-eligibility-fixture.ts';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
// Isolated in-memory visual fixture; never use it as persistence acceptance evidence.
const referenceFixture=await createReferenceVisualStore(resolve('../evidence/design-review-20261106/双线程交接/A/visual-qa-files'));
const store=referenceFixture.store;
const server=createServer({ledgerStore:store,auth:{mode:'local-bypass'},materialStorageRoot:resolve('../evidence/design-review-20261106/双线程交接/A/visual-qa-files')});
const project=store.listProjects()[0],fund=store.listFunds().find(f=>f.id===project.fundId)??store.listFunds()[0];
const modePath=resolve('../evidence/design-review-20261106/双线程交接/A/runtime-qa-mode.json');
await writeFile(modePath,'{}');
const qaMode=async()=>JSON.parse(await readFile(modePath,'utf8')) as {riskFail?:boolean;taskFail?:boolean;delayMs?:number;role?:string};
server.addHook('onRequest',async(request,reply)=>{
 if(request.method!=='GET')return;
 const path=request.url.split('?')[0],mode=await qaMode();
 if(!['/api/risks/records','/api/agent-workspace'].includes(path))return;
 if(mode.delayMs)await new Promise(resolve=>setTimeout(resolve,Math.min(mode.delayMs,5000)));
 if(path==='/api/risks/records'&&mode.riskFail||path==='/api/agent-workspace'&&mode.taskFail)return reply.code(503).send({error:'isolated_visual_qa_failure'});
});
server.addHook('onSend',async(request,reply,payload)=>{
 if(request.method!=='GET'||reply.statusCode!==200||typeof payload!=='string')return payload;
 const path=request.url.split('?')[0],mode=await qaMode();
 if(path==='/api/session/me'&&mode.role){const body=JSON.parse(payload);body.user.role=mode.role;return JSON.stringify(body);}
 if(path!=='/api/risks/records')return payload;
 const body=JSON.parse(payload);
 // Isolated presentation fixtures; backend authorization is tested with registered sessions separately.
 const risks=[['a-risk-demo','seed_demo','unknown',project.id],['a-risk-engineering','user_input','engineering_fixture',project.id],['a-risk-outside','user_input','unknown','not-visible-project']].map(([id,dataOrigin,dataPurpose,projectId])=>({id,projectId,dataOrigin,dataPurpose,title:id,target:'隔离风险样本',type:'经营风险',level:'中',status:'待处理',source:'隔离内存样本，不是业务事实',time:'2026-11-06',summary:'仅用于来源保留和可见项目边界核验。',version:1,updatedAt:'2026-11-06T00:00:00Z'}));
 body.risks.push(...risks);return JSON.stringify(body);
});
const response=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name:'隔离视觉核验原件.txt',type:'会议资料',projectId:project.id}),headers:{'content-type':'application/octet-stream'},payload:Buffer.from('隔离合成核验原件\n此原件仅用于收件箱C稿的嵌入预览核验。\n不属于实际业务资料，不写入现有数据库。')});
if(response.statusCode!==201)throw Error('visual fixture upload failed: '+response.statusCode);
const {material,version}=response.json();
store.createAiIntakeItem({id:'iteration-a-source-preview',title:'隔离视觉核验：来源原件预览',inputType:'会议纪要',source:'隔离合成原件',submittedBy:'隔离核验',submittedAt:'2026-11-06 12:00',summary:'仅核对来源、原件预览和当前收件切换，不代表实际识别质量。',confidence:'待人工核对',suggestedFund:fund.name,suggestedFundId:fund.id,suggestedProject:project.name,suggestedPath:'隔离核验 / 原件预览',extracted:['合成核验原件，不是实际业务资料'],generatedTasks:[],sourceMaterialId:material.id,sourceVersionId:version.id,dataOrigin:'user_input'});
const revision=await server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name:material.name,type:material.type,projectId:project.id,materialId:material.id,expectedVersion:'1'}),headers:{'content-type':'application/octet-stream'},payload:Buffer.from('隔离核验新版 V2\n新版文字不得混入旧收件的识别依据。')});
if(revision.statusCode!==201)throw Error('visual fixture revision failed: '+revision.statusCode);
const current=revision.json();
store.createAiIntakeItem({id:'iteration-a-source-current',title:'隔离视觉核验：当前版本正文',inputType:'会议纪要',source:'隔离合成原件',submittedBy:'隔离核验',submittedAt:'2026-11-06 12:01',summary:'仅核对版本一致的正文展示。',confidence:'待人工核对',suggestedFund:fund.name,suggestedFundId:fund.id,suggestedProject:project.name,suggestedPath:'隔离核验 / 当前版本',extracted:['当前版本 V2'],generatedTasks:[],sourceMaterialId:material.id,sourceVersionId:current.version.id,dataOrigin:'user_input'});
const post=await preparePostVisualFixture(store,server,{cookie:'',isolatedInMemory:true});
await writeFile(resolve('../evidence/design-review-20261106/双线程交接/A/visual-fixture-manifest.json'),JSON.stringify({reference:{id:referenceFixture.reference.id,versionId:referenceFixture.reference.versionId},intake:{materialId:material.id,oldVersionId:version.id,currentVersionId:current.version.id},post},null,2));
await server.listen({host:'127.0.0.1',port:18799});
console.log('A visual fixture: 18799, in memory only');
