"""Offline Linux document extraction; invoked only with a verified private copy of an upload."""
import importlib.util, json, os, re, signal, subprocess, sys
from pathlib import Path
source=Path(sys.argv[1]).resolve();extension=sys.argv[2];work=source.parent

def stopped(_signum,_frame):raise RuntimeError('extraction_stopped')
signal.signal(signal.SIGTERM,stopped)
def run(args,timeout=30):
    process=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        out,_=process.communicate(timeout=timeout)
        if process.returncode:raise RuntimeError('document_extraction_failed')
        if len(out)>8*1024*1024:raise RuntimeError('extraction_limit')
        return out.decode('utf-8-sig')
    except BaseException:
        process.kill();process.communicate();raise

def ocr(path):
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 40_000_000
    with Image.open(path) as image:
        if image.width>20000 or image.height>20000 or image.width*image.height>40_000_000:raise RuntimeError('image_dimension_limit')
        image.verify()
    return run(['tesseract',str(path),'stdout','-l','chi_sim+eng','--psm','3']).strip()

def helper(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def office_convert(target):
    profile=work/'office-profile';profile.mkdir(exist_ok=True)
    (profile/'user').mkdir(exist_ok=True)
    (profile/'user/registrymodifications.xcu').write_text('<oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Common/Load"><prop oor:name="UpdateDocMode" oor:op="fuse"><value>0</value></prop></item></oor:items>')
    run([os.environ.get('DOCUMENT_SOFFICE','soffice'),'-env:UserInstallation='+profile.as_uri(),'--headless','--convert-to',target,'--outdir',str(work),str(source)],60)
    return source.with_suffix('.'+target.split(':')[0])

# Legacy Office must contain its actual OLE stream; never let Office guess arbitrary text.
if extension in ('doc','xls','ppt'):
    import olefile
    if not olefile.isOleFile(str(source)):raise RuntimeError('invalid_legacy_office')
    with olefile.OleFileIO(str(source),raise_defects=olefile.DEFECT_INCORRECT) as container:
        expected={'doc':['WordDocument'],'xls':['Workbook','Book'],'ppt':['PowerPoint Document']}[extension]
        if not any(container.exists(name) and container.get_size(name)>0 for name in expected):raise RuntimeError('invalid_legacy_office')

pages=[]
if extension in ('wav','mp3','m4a','ogg','webm','flac'):
    pages=helper('transcribe-audio').transcribe(source,run)
elif extension in ('xls','xlsx','ppt','pptx'):
    modern={'xls':'xlsx','ppt':'pptx'}.get(extension,extension)
    converted=office_convert(modern) if modern!=extension else source
    pages=helper('extract-office').extract_office(converted,modern)
elif extension=='pdf':
    info=run(['pdfinfo',str(source)])
    count=re.search(r'^Pages:\s+(\d+)',info,re.M)
    if not count or not 0<int(count[1])<=200 or re.search(r'^Encrypted:\s+yes',info,re.M):raise RuntimeError('invalid_pdf_or_page_limit')
    for number in range(1,int(count[1])+1):
        text=run(['pdftotext','-f',str(number),'-l',str(number),'-layout','-enc','UTF-8',str(source),'-']).strip('\f\n ')
        # Rasterize one bounded page at a time, including mixed text/image pages.
        prefix=work/'ocr-page'
        run(['pdftoppm','-f',str(number),'-l',str(number),'-singlefile','-scale-to','2400','-png',str(source),str(prefix)])
        image=prefix.with_suffix('.png')
        try:scanned=ocr(image)
        finally:image.unlink(missing_ok=True)
        method='pdf_text'
        if scanned:
            if len(text)<80:text=scanned;method='tesseract_ocr'
            elif scanned not in text:text+='\n'+scanned;method='pdf_text+tesseract_ocr'
        pages.append({'page':number,'text':text,'method':method})
        if sum(len(p['text']) for p in pages)>4*1024*1024:raise RuntimeError('extraction_limit')
elif extension in ('png','jpg','jpeg'):
    pages=[{'page':1,'text':ocr(source),'method':'tesseract_ocr'}]
elif extension in ('doc','docx'):
    text=office_convert('txt:Text').read_text(encoding='utf-8-sig')
    pages=[{'page':1,'text':text,'method':'word_text'}]
else:raise RuntimeError('unsupported_extraction_type')
print(json.dumps(pages,ensure_ascii=False))
