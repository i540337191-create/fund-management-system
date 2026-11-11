import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {readMaterialExtraction} from '../src/material-preview/extraction.ts';
const exec=promisify(execFile);
test('audio transcription never supplies business hints as speech and retains the recognizer output',async()=>{
 const script=resolve(import.meta.dirname,'../scripts/transcribe-audio.py');
 const check=String.raw`
import importlib.util,json,tempfile,wave,array,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('audio',sys.argv[1]);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'source.wav';p.write_bytes(b'fixture')
 def run(args,*rest):
  if args[0]=='ffprobe':return json.dumps({'format':{'duration':'1'},'streams':[{'codec_type':'audio'}]})
  if args[0]=='ffmpeg':
   with wave.open(args[-1],'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(array.array('h',[1000,-1000]*8000).tobytes())
   return ''
  assert '--prompt' not in args and '--prompt-file' not in args, 'business hints must not enter recognizer context'
  out=Path(args[args.index('-of')+1]).with_suffix('.json');out.write_text(json.dumps({'transcription':[{'text':'讨论门店材料检测','offsets':{'from':0,'to':1000}}]}))
  return ''
 result=mod.transcribe(p,run);assert result[0]['text'].endswith('讨论门店材料检测');print('ok')
`;
 assert.equal((await exec('python3',['-c',check,script])).stdout.trim(),'ok');
});
test('pre-fix audio caches are invalidated while versioned audio and ordinary document caches remain readable',async t=>{
 const root=await mkdtemp(resolve(tmpdir(),'audio-revision-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(resolve(root,'extracted-text'));
 const id=randomUUID(),sha256='a'.repeat(64),version={id,blobId:id,name:'recording.m4a',sha256} as any,path=resolve(root,'extracted-text',`${id}-${sha256}.json`),base={versionId:id,sha256,status:'ready',pages:[{page:1,text:'旧提示词重复',method:'local_audio_transcription'}],updatedAt:new Date().toISOString()};
 await writeFile(path,JSON.stringify(base));assert.equal(await readMaterialExtraction(root,version),null);
 await writeFile(path,JSON.stringify({...base,audioRevision:2}));assert.equal((await readMaterialExtraction(root,version))?.status,'ready');
 await writeFile(path,JSON.stringify(base));assert.equal((await readMaterialExtraction(root,{...version,name:'document.txt'}))?.status,'ready');
});
