import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/controls.css',import.meta.url),'utf8');
function luminance(hex:string){const values=hex.match(/[a-f\d]{2}/gi)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
for(const [mode,body] of [...css.matchAll(/:root(?:\[data-color-mode="(dark)"\])?\{([^}]+)\}/g)].filter(m=>m[2].includes('--action-primary:')).map(m=>[m[1]??'light',m[2]])){
 test(`${mode} action labels remain legible on normal and hover surfaces`,()=>{
  const tokens=Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[a-f\d]{6})/gi)].map(m=>[m[1],m[2]]));
  for(const tone of ['primary','secondary','info','danger','success'])for(const state of ['', '-hover']){
   const a=luminance(tokens[`action-${tone}${state}`]),b=luminance(tokens[`action-${tone}-ink`]);
   assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${tone}${state} contrast below 4.5:1`);
  }
 });
}
