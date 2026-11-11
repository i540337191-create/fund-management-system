import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeReceipt} from '../src/ledger/receipt-recognition.ts';
import {receiptWorkbook} from '../src/ledger/receipt-workbook.ts';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('receipt suggestions retain original page evidence and refuse ambiguous/invalid dates',()=>{const p=recognizeReceipt([{page:2,text:'交易日期：2026年11月2日\n金额：￥1,234.56\n银行流水号：ABC123\n对方户名：测试客户\n摘要：费用\n收支类型：收入'}]);assert.equal(p.suggestions.amount.value,'1234.56');assert.equal(p.suggestions.date.value,'2026-11-02');assert.equal(p.suggestions.reference.page,2);assert.equal(p.suggestions.counterparty.value,'测试客户');assert.equal(p.suggestions.direction.value,'in');const ambiguous=recognizeReceipt([{page:1,text:'交易金额：10.00\n交易金额：20.00\n日期：2026-02-30'}]);assert.equal(ambiguous.suggestions.amount,undefined);assert.equal(ambiguous.suggestions.date,undefined);assert.deepEqual(ambiguous.ambiguous,['amount']);assert.equal(p.requiresHumanReview,true);});
test('real XLSX package preserves exact money, account leading zeros and literal formula text',async()=>{const dir=await mkdtemp(join(tmpdir(),'xlsx-'));try{const bytes=await receiptWorkbook([['账户','金额(元)','流水号'],['000123','123456789012345678.12','=HYPERLINK("bad")']]);assert.equal(bytes.subarray(0,2).toString(),'PK');const path=join(dir,'receipts.xlsx');await writeFile(path,bytes);const {stdout}=await promisify(execFile)('python3',['-c',`import zipfile,xml.etree.ElementTree as E,sys
z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None
for name in z.namelist():E.fromstring(z.read(name))
x=E.fromstring(z.read('xl/worksheets/sheet1.xml'));ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
t=[v.text for v in x.findall('.//s:t',ns)];assert '000123' in t;assert '123456789012345678.12' in t;assert '=HYPERLINK("bad")' in t;assert not x.findall('.//s:f',ns)
print('valid XLSX exact strings; no formulas')`,path]);assert.match(stdout,/valid XLSX/);}finally{await rm(dir,{recursive:true,force:true});}});
