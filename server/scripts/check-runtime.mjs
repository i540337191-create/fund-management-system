import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {accessSync,readFileSync,mkdtempSync,rmSync,constants} from 'node:fs';
import {pathToFileURL} from 'node:url';
const check=(command,args,timeout=30000)=>execFileSync(command,args,{timeout,stdio:['ignore','pipe','pipe']}).toString();
if(process.platform!=='linux')throw Error('Linux runtime check requires Linux');
accessSync(new URL('./extract-document-linux.py',import.meta.url),constants.R_OK);
check(process.env.DOCUMENT_PYTHON??'python3',['-c','from PIL import Image; import zipfile; import openpyxl; import olefile']);
check('ffmpeg',['-version']);check('ffprobe',['-version']);check(process.env.ASR_WHISPER_BIN??'/usr/local/bin/whisper-cli',['--help']);
if(createHash('sha256').update(readFileSync(process.env.ASR_MODEL_PATH??'/opt/fundapp-asr/ggml-small-q5_1.bin')).digest('hex')!=='ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb')throw Error('ASR model integrity failure');
// Exercise the actual model/backend so unsupported CPU instructions fail before serving users.
const probe=mkdtempSync(join(tmpdir(),'fundapp-asr-check-'));
try{
 const wav=join(probe,'silence.wav');
 check(process.env.DOCUMENT_PYTHON??'python3',['-c',"import sys,wave; f=wave.open(sys.argv[1],'wb'); f.setnchannels(1); f.setsampwidth(2); f.setframerate(16000); f.writeframes(bytes(32000)); f.close()",wav]);
 check(process.env.ASR_WHISPER_BIN??'/usr/local/bin/whisper-cli',['-m',process.env.ASR_MODEL_PATH??'/opt/fundapp-asr/ggml-small-q5_1.bin','-f',wav,'-l','en','-t','4','-ng','-np'],120000);
}finally{rmSync(probe,{recursive:true,force:true});}
for(const helper of ['extract-office.py','transcribe-audio.py'])accessSync(new URL(helper,import.meta.url),constants.R_OK);
check('pdftotext',['-v']);check('pdftoppm',['-v']);check('pdfinfo',['-v']);check(process.env.DOCUMENT_SOFFICE??'soffice',['--version']);
const langs=check('tesseract',['--list-langs']);for(const lang of ['eng','chi_sim'])if(!langs.split(/\s+/).includes(lang))throw Error('Missing OCR language '+lang);
if(!process.env.FUNDAPP_HARNESS_MODULE)throw Error('Business Harness must be configured');
accessSync(process.env.FUNDAPP_HARNESS_MODULE,constants.R_OK);
const harness=await import(pathToFileURL(process.env.FUNDAPP_HARNESS_MODULE).href);if(typeof harness.runBusinessHarness!=='function')throw Error('Business Harness is invalid');
console.log('Linux OCR, Office, local ASR model and business Harness dependencies ready.');
