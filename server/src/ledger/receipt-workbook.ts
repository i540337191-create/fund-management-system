import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {resolve} from 'node:path';
import {WorkflowError} from './workflow.ts';
const run=promisify(execFile);
export async function receiptWorkbook(rows:(string|undefined)[][]):Promise<Buffer>{
 if(rows.length>50000||rows.some(r=>r.length>30)||JSON.stringify(rows).length>20000000)throw new WorkflowError('workbook_limit',413);
 const dir=await mkdtemp(resolve(tmpdir(),'fundapp-receipts-'));
 try{let python=process.env.DOCUMENT_PYTHON??resolve(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');try{await access(python);}catch{python='python3';}await writeFile(resolve(dir,'rows.json'),JSON.stringify(rows));await run(python,['-c',SCRIPT,resolve(dir,'rows.json'),resolve(dir,'receipts.xlsx')],{timeout:30000,maxBuffer:1024*1024});return await readFile(resolve(dir,'receipts.xlsx'));}catch(e){if(e instanceof WorkflowError)throw e;throw new WorkflowError('workbook_generation_unavailable',503);}finally{await rm(dir,{recursive:true,force:true});}
}
const SCRIPT=String.raw`
import json,sys,zipfile
from xml.sax.saxutils import escape
rows=json.load(open(sys.argv[1],encoding='utf-8'))
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
def text(v):return escape(''.join(c for c in str(v or '') if c in '\n\t' or 32<=ord(c)<=0xD7FF or 0xE000<=ord(c)<=0xFFFD or 0x10000<=ord(c)<=0x10FFFF))
def col(i):
 s=''
 while i:i,r=divmod(i-1,26);s=chr(65+r)+s
 return s
sheet='<worksheet xmlns="'+ns+'"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+''.join('<col min="'+str(i)+'" max="'+str(i)+'" width="'+('24' if i!=4 else '20')+'" customWidth="1"/>' for i in range(1,len(rows[0])+1))+'</cols><sheetData>'
for i,row in enumerate(rows,1):
 sheet+='<row r="'+str(i)+'" ht="28" customHeight="1">'
 for j,v in enumerate(row,1):sheet+='<c r="'+col(j)+str(i)+'" t="inlineStr" s="'+('1' if i==1 else '0')+'"><is><t xml:space="preserve">'+text(v)+'</t></is></c>'
 sheet+='</row>'
sheet+='</sheetData><autoFilter ref="A1:'+col(len(rows[0]))+str(len(rows))+'"/></worksheet>'
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
 z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
 z.writestr('xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="银行回单台账" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
 z.writestr('xl/styles.xml','<styleSheet xmlns="'+ns+'"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>')
 z.writestr('xl/worksheets/sheet1.xml',sheet)
`;
