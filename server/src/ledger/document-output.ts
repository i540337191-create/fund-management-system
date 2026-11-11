import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { resolve } from 'node:path';
import { WorkflowError } from './workflow.ts';
export type BusinessDocument = {title:string;subtitle?:string;sections:{title:string;text:string;keepTogether?:boolean}[]};
export const documentMime = {docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pdf:'application/pdf'} as const;
const run = promisify(execFile);
const bundled=resolve(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
async function binary(setting:string|undefined, fallback:string, command:string){if(setting)return setting;try{await access(fallback);return fallback;}catch{return command;}}
// Use a fresh working directory and office profile per request to avoid cross-user output and conversion locks.
export async function generateDocument(document:BusinessDocument,format:string):Promise<Buffer>{
 if(format!=='docx'&&format!=='pdf')throw new WorkflowError('invalid_report_format',400);
 if(typeof document.title!=='string'||!document.title.trim()||document.title.length>500||!Array.isArray(document.sections)||document.sections.length>1000||document.sections.some(s=>!s||typeof s.title!=='string'||typeof s.text!=='string')||JSON.stringify(document).length>2_000_000)throw new WorkflowError('invalid_document_content',400);
 const dir=await mkdtemp(resolve(tmpdir(),'fundapp-document-'));
 try{
  const python=await binary(process.env.DOCUMENT_PYTHON,resolve(bundled,'python/bin/python3'),'python3');
  await writeFile(resolve(dir,'content.json'),JSON.stringify(document));
  await run(python,['-c',DOCX_SCRIPT,resolve(dir,'content.json'),resolve(dir,'document.docx')],{timeout:30000,maxBuffer:1024*1024});
  if(format==='pdf'){
   const office=await binary(process.env.DOCUMENT_SOFFICE,resolve(bundled,'bin/override/soffice'),'soffice');
   const env={...process.env};
   if(!env.FONTCONFIG_FILE){const config=resolve(bundled,'native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/Resources/fontconfig/fonts.conf');try{await access(config);env.FONTCONFIG_FILE=config;}catch{ /* Use the target system font configuration. */ }}
   await run(office,[`-env:UserInstallation=${new URL('file://'+resolve(dir,'profile')).href}`,'--headless','--convert-to','pdf','--outdir',dir,resolve(dir,'document.docx')],{timeout:60000,maxBuffer:1024*1024,env});
  }
  const bytes=await readFile(resolve(dir,`document.${format}`));
  if(format==='pdf'?!bytes.subarray(0,5).equals(Buffer.from('%PDF-')):!bytes.subarray(0,2).equals(Buffer.from('PK')))throw new Error('invalid_document_signature');
  return bytes;
 }catch(error){if(error instanceof WorkflowError)throw error;throw new WorkflowError('document_generation_unavailable',503);}
 finally{await rm(dir,{recursive:true,force:true});}
}
const DOCX_SCRIPT=String.raw`
import json,sys,zipfile
from xml.sax.saxutils import escape
v=json.load(open(sys.argv[1],encoding='utf-8'))
def clean(s): return ''.join(c for c in str(s) if c in '\n\t' or 32<=ord(c)<=0xD7FF or 0xE000<=ord(c)<=0xFFFD or 0x10000<=ord(c)<=0x10FFFF)
def p(text,style='Normal',keep=False):
    return '<w:p><w:pPr><w:pStyle w:val="'+style+'"/>'+('<w:keepLines/>' if keep else '')+'</w:pPr>'+''.join('<w:r><w:t xml:space="preserve">'+escape(clean(line))+'</w:t></w:r>'+('<w:r><w:br/></w:r>' if i<len(str(text).split('\n'))-1 else '') for i,line in enumerate(str(text).split('\n')))+'</w:p>'
body=p(v['title'],'Title')+(p(v['subtitle']) if v.get('subtitle') else '')
for s in v['sections']: body+=p(s['title'],'Heading1')+p(s['text'],keep=s.get('keepTogether',False))
ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
styles='<w:styles xmlns:w="'+ns+'"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial Unicode MS"/><w:color w:val="000000"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="340" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="300"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>'
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
 z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
 z.writestr('word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
 z.writestr('word/styles.xml',styles)
 z.writestr('word/document.xml','<w:document xmlns:w="'+ns+'"><w:body>'+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1361" w:right="1361" w:bottom="1361" w:left="1361"/></w:sectPr></w:body></w:document>')
`;
