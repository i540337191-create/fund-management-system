import test from 'node:test';
import assert from 'node:assert/strict';
import {symlinkSync,mkdtempSync,mkdirSync,writeFileSync,copyFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
test('workspace release excludes private files and dependencies, and verifies an unversioned source snapshot',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'fundapp-workspace-release-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const files=['scripts/package-workspace.mjs','scripts/preflight-server-release.mjs','scripts/package-release.mjs','server/Dockerfile','server/scripts/extract-document-linux.py','server/scripts/extract-office.py','server/scripts/transcribe-audio.py','server/scripts/check-runtime.mjs','server/scripts/start-container.mjs','server/harness/package-lock.json','server/harness/runner.mjs','server/scripts/container-entrypoint.sh','server/scripts/prepare-storage.py','server/scripts/restore-files.py','scripts/full-backup.mjs','docker-compose.yml','Dockerfile.web','Dockerfile.nginx','deploy/nginx.conf'];
 for(const f of files){mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});copyFileSync(path.join(root,f),path.join(dir,f));}
 for(const name of ['whisper-v1.9.5.tar.gz','ggml-small-q5_1.bin']){mkdirSync(path.join(dir,'server/vendor/asr'),{recursive:true});writeFileSync(path.join(dir,'server/vendor/asr',name),'synthetic packaging fixture; not executable');}
 mkdirSync(path.join(dir,'src'));writeFileSync(path.join(dir,'src/app.ts'),'export const value=1');if(process.platform==='darwin')execFileSync('xattr',['-w','com.fundapp.delivery-test','synthetic',path.join(dir,'src/app.ts')]);
 for(const f of ['.env.release','server/.env.production','server/harness/node_modules/private.txt','server/private-material-storage/private.txt']){mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});writeFileSync(path.join(dir,f),'must-not-ship');}
 const build=spawnSync(process.execPath,['scripts/package-workspace.mjs'],{cwd:dir,encoding:'utf8'});assert.equal(build.status,0,build.stderr);const out=JSON.parse(build.stdout);
 assert.equal(out.ok,true);const list=execFileSync('tar',['-tzf',out.archivePath],{encoding:'utf8'});assert.ok(list.includes('release-manifest.json'));assert.ok(!/(^|\/)\._/m.test(list));assert.ok(!list.includes('.env.release'));assert.ok(!list.includes('node_modules'));assert.ok(!list.includes('private-material-storage'));
 const unpack=path.join(dir,'unpack');mkdirSync(unpack);execFileSync('tar',['-xzf',out.archivePath,'-C',unpack]);
 writeFileSync(path.join(unpack,'.env.release'),'APP_AUTH_MODE=password\nSESSION_SECRET=synthetic-release-secret-0123456789abcdef\nADMIN_EMAIL=ops@example.invalid\nADMIN_PASSWORD=synthetic-safe-password-123\nPOSTGRES_PASSWORD=synthetic-safe-postgres-123\nQWEN_API_KEY=synthetic-provider-key\n',{mode:0o600});
 const bin=path.join(dir,'bin');mkdirSync(bin);for(const f of ['docker','pg_dump','pg_restore','psql'])writeFileSync(path.join(bin,f),'#!/bin/sh\necho synthetic-version\n',{mode:0o755});writeFileSync(path.join(bin,'git'),'#!/bin/sh\nexit 128\n',{mode:0o755});
 const verify=()=>spawnSync(process.execPath,['scripts/preflight-server-release.mjs','--compose','--release-env-file','.env.release','--json'],{cwd:unpack,encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH}});
 let result=verify();assert.equal(result.status,0,result.stdout+result.stderr);assert.ok(JSON.parse(result.stdout).checks.some((c:any)=>c.name==='source manifest'&&c.ok));
 writeFileSync(path.join(unpack,'src/unlisted.ts'),'unexpected');result=verify();assert.equal(result.status,1);rmSync(path.join(unpack,'src/unlisted.ts'));
 writeFileSync(path.join(unpack,'src/app.ts'),'changed');result=verify();assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).ok,false);
});

test('full backup refuses a symlinked source/web destination before invoking Docker',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'fundapp-backup-path-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 symlinkSync(path.join(root,'src'),path.join(dir,'alias'),'dir');const env=path.join(dir,'private.env');writeFileSync(env,'APP_AUTH_MODE=password\n',{mode:0o600});
 const result=spawnSync(process.execPath,['scripts/full-backup.mjs','backup','--write','--release-env-file',env,'--directory',path.join(dir,'alias','should-not-be-created')],{cwd:root,encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/outside the source and web root/);assert.equal(existsSync(path.join(root,'src/should-not-be-created.partial')),false);
});
