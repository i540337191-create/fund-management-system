import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createMemoryLedgerStore,createSeedLedgerState} from '../../server/src/ledger/store.ts';
// Domain-seeded test original with real stored bytes; never accepts a database store.
export async function createReferenceVisualStore(storageRoot:string){
 const seed=createSeedLedgerState(),id='a-engineering-reference',project=seed.projects[0],name='隔离工程参考原件.txt';
 seed.materials.push({...seed.materials[0],id,projectId:project.id,fundId:project.fundId,project:project.name,name,type:'会议资料',currentVersion:0,currentVersionId:null,originalFilePath:null,dataOrigin:'user_input'});
 const store=createMemoryLedgerStore(seed,{sourcePurposes:[{recordType:'material',recordId:id,dataPurpose:'engineering_fixture',evidence:{isolatedInMemory:true},classifiedBy:'isolated-qa',classifiedAt:'2026-11-06T00:00:00Z',revision:1}]}),bytes=Buffer.from('隔离工程测试原件，不得用于AI业务事实判断。'),versionId=randomUUID(),legacyId=randomUUID(),sha256=createHash('sha256').update(bytes).digest('hex');
 await mkdir(storageRoot,{recursive:true});await writeFile(resolve(storageRoot,legacyId),bytes);await writeFile(resolve(storageRoot,versionId),bytes);
 const result=store.uploadMaterial({materialId:id,expectedVersion:0,requestId:randomUUID(),name,type:'会议资料',projectId:project.id,versionId,sizeBytes:bytes.length,sha256,mimeType:'text/plain',actor:{id:'user-admin',name:'隔离核验'},legacyVersion:{id:legacyId,blobId:legacyId,name,sizeBytes:bytes.length,sha256,mimeType:'text/plain',uploadedBy:'隔离核验',uploadedById:'user-admin',createdAt:'2026-11-06T00:00:00Z',requestId:randomUUID(),fingerprint:'legacy:'+sha256}});
 return {store,reference:{id,versionId:result.version.id,bytes}};
}
