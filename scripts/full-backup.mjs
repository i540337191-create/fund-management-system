#!/usr/bin/env node
import {spawn,spawnSync} from 'node:child_process';
import {createReadStream,createWriteStream,existsSync,readFileSync,realpathSync,writeFileSync,mkdirSync,chmodSync,renameSync} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),mode=args[0];
const option=(key)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
if(!['backup','restore'].includes(mode)||!args.includes('--write')||!option('--release-env-file')||!option('--directory'))throw Error('Use backup|restore --write --release-env-file <private env> --directory <backup directory>; restore requires --fresh-target.');
const envPath=path.resolve(option('--release-env-file')),fileEnv={};for(const line of readFileSync(envPath,'utf8').split(/\r?\n/)){const match=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(match)fileEnv[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');}
const env={...fileEnv,...process.env},requestedDirectory=path.resolve(option('--directory')),user=env.POSTGRES_USER??'fundapp',database=env.POSTGRES_DB??'fundapp_road_fund';
let ancestor=requestedDirectory;const missing=[];while(!existsSync(ancestor)){missing.unshift(path.basename(ancestor));const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('Invalid backup path');ancestor=parent;}
const directory=path.join(realpathSync(ancestor),...missing),sourceRoot=realpathSync(root);
if(directory===sourceRoot||directory.startsWith(sourceRoot+path.sep))throw Error('Backup directory must be outside the source and web root');
const base=['compose','--env-file',envPath];
const dc=async(command,{input,output}={})=>{const child=spawn('docker',[...base,...command],{cwd:root,env,stdio:[input?'pipe':'ignore',output?'pipe':'inherit','inherit']});const tasks=[new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Compose backup/restore step failed')));})];if(input)tasks.push(pipeline(createReadStream(input),child.stdin));if(output)tasks.push(pipeline(child.stdout,createWriteStream(output,{flags:'wx',mode:0o600})));try{await Promise.all(tasks);}catch(error){child.kill();throw error;}};
const text=command=>{const r=spawnSync('docker',[...base,...command],{cwd:root,env,encoding:'utf8'});if(r.status!==0)throw Error('Cannot inspect restore target');return r.stdout.trim();};
const hash=async file=>{const sha=createHash('sha256');for await(const part of createReadStream(file))sha.update(part);return sha.digest('hex');};
if(mode==='backup'){
 if(existsSync(directory)||existsSync(directory+'.partial'))throw Error('Backup directory already exists');
 const stage=directory+'.partial';mkdirSync(stage,{recursive:true,mode:0o700});const running=text(['ps','--status','running','--services']).split('\n').includes('api');
 try{
  await dc(['stop','-t','30','api']);
  await dc(['exec','-T','postgres','pg_dump','--format=custom','-U',user,'-d',database],{output:path.join(stage,'database.dump')});
  await dc(['run','--rm','--no-deps','-T','--entrypoint','tar','api','-C','/app/private-material-storage','-cf','-','.'],{output:path.join(stage,'material-files.tar')});
  const files={};for(const name of ['database.dump','material-files.tar'])files[name]=await hash(path.join(stage,name));
  writeFileSync(path.join(stage,'release.env'),readFileSync(envPath),{mode:0o600});files['release.env']=await hash(path.join(stage,'release.env'));
  writeFileSync(path.join(stage,'manifest.json'),JSON.stringify({format:1,createdAt:new Date().toISOString(),consistentWithApiStopped:true,files},null,2),{mode:0o600});renameSync(stage,directory);console.log('Full backup completed; directory includes private credentials and must remain protected.');
 }finally{if(running)await dc(['start','api']);}
}else{
 if(!args.includes('--fresh-target'))throw Error('Restore is allowed only into a fresh target; no existing business database or files will be overwritten.');
 const manifest=JSON.parse(readFileSync(path.join(directory,'manifest.json'),'utf8'));if(manifest.format!==1)throw Error('Unsupported backup');
 for(const name of ['database.dump','material-files.tar','release.env'])if(await hash(path.join(directory,name))!==manifest.files[name])throw Error('Backup integrity mismatch');
 const tables=text(['exec','-T','postgres','psql','-U',user,'-d',database,'-Atc',"select count(*) from pg_tables where schemaname='public'"]);
 if(tables!=='0')throw Error('Restore target database is not empty');
 if(text(['ps','--status','running','--services']).split('\n').includes('api'))throw Error('Restore target API must remain stopped');
 await dc(['exec','-T','postgres','pg_restore','--single-transaction','--exit-on-error','--no-owner','--no-privileges','-U',user,'-d',database],{input:path.join(directory,'database.dump')});
 await dc(['run','--rm','--no-deps','-T','--entrypoint','python3','api','scripts/restore-files.py'],{input:path.join(directory,'material-files.tar')});
 await dc(['up','-d','api']);console.log('Full database and private files restored into fresh target. If restore fails, keep API stopped and retry in another fresh target.');
}
