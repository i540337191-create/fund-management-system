#!/usr/bin/env node
import {chmodSync,cpSync,existsSync,lstatSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const output=path.resolve(root,option('--output-dir','release-packages')),stage=mkdtempSync(path.join(tmpdir(),'fundapp-release-'));
const entries=['.dockerignore','.env.example','.gitignore','assets','deploy','docs','public','scripts','server','src','tests','index.html','package.json','package-lock.json','Dockerfile.web','Dockerfile.nginx','docker-compose.yml','tsconfig.json','tsconfig.app.json','tsconfig.node.json','vite.config.ts','postcss.config.js','tailwind.config.js','README.md'];
try{
 const excluded=new Set(['__pycache__','.DS_Store','node_modules','dist','.git','backups','private-material-storage','release-evidence','release-packages','output']);
 for(const entry of entries)if(existsSync(path.join(root,entry)))cpSync(path.join(root,entry),path.join(stage,entry),{recursive:true,filter:source=>{const parts=path.relative(root,source).split(path.sep),name=path.basename(source);if(name.startsWith('._')||parts.some(p=>excluded.has(p))||(name.startsWith('.env')&&name!=='.env.example')||name.endsWith('.dump'))return false;if(lstatSync(source).isSymbolicLink())throw Error('Release source contains symlink: '+path.relative(root,source));return true;}});
 const files=[];const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else files.push({path:path.relative(stage,p).split(path.sep).join('/'),sha256:createHash('sha256').update(readFileSync(p)).digest('hex')});}};walk(stage);files.sort((a,b)=>a.path.localeCompare(b.path));
 const fingerprint=createHash('sha256').update(JSON.stringify(files)).digest('hex');
 const manifest={source:'working-tree-snapshot',createdAt:new Date().toISOString(),fingerprint,files};writeFileSync(path.join(stage,'release-manifest.json'),JSON.stringify(manifest,null,2));
 mkdirSync(output,{recursive:true,mode:0o700});const archive=path.join(output,'fund-management-fund-'+fingerprint.slice(0,12)+'.tar.gz');if(existsSync(archive))throw Error('Release already exists');execFileSync('tar',['-czf',archive,'-C',stage,'.'],{env:{...process.env,COPYFILE_DISABLE:'1'}});chmodSync(archive,0o600);
 const result={ok:true,archivePath:archive,archiveSha256:createHash('sha256').update(readFileSync(archive)).digest('hex'),sourceFingerprint:fingerprint,fileCount:files.length};writeFileSync(archive+'.manifest.json',JSON.stringify({...result,archivePath:path.basename(archive)},null,2));console.log(JSON.stringify(result));
}finally{rmSync(stage,{recursive:true,force:true});}
