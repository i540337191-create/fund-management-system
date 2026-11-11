"""Read bounded OOXML packages without evaluating formulas, macros or external links."""
import posixpath, re, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

S='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
P='http://schemas.openxmlformats.org/presentationml/2006/main'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'

def extract_office(source, extension):
    with zipfile.ZipFile(source) as z:
        entries=z.infolist()
        if len(entries)>4000 or sum(f.file_size for f in entries)>64*1024*1024 or any(f.file_size>16*1024*1024 or f.flag_bits&1 for f in entries):raise RuntimeError('office_package_limit')
        names=[f.filename for f in entries]
        if len(names)!=len(set(names)) or any(n.startswith('/') or '..' in n.split('/') for n in names):raise RuntimeError('invalid_office_package')
        def xml(name):
            raw=z.read(name)
            probe=raw.replace(b'\x00',b'').upper()
            if b'<!DOCTYPE' in probe or b'<!ENTITY' in probe:raise RuntimeError('unsafe_office_xml')
            return ET.fromstring(raw)
        def relationships(name):
            parent=posixpath.dirname(name); rel=posixpath.join(parent,'_rels',posixpath.basename(name)+'.rels')
            return {r.get('Id'):posixpath.normpath(r.get('Target','').lstrip('/')) if r.get('Target','').startswith('/') else posixpath.normpath(posixpath.join(parent,r.get('Target',''))) for r in xml(rel) if r.get('TargetMode')!='External'}
        pages=[]
        if extension=='xlsx':
            workbook_xml=xml('xl/workbook.xml');links=relationships('xl/workbook.xml')
            for sheet in workbook_xml.findall('.//{'+S+'}sheet'):
                sheet_xml=xml(links[sheet.get('{'+R+'}id')]);rows=0;cells=0
                for row in sheet_xml.iter('{'+S+'}row'):
                    rows+=1
                    if rows>200000 or int(row.get('r',rows))>200000:raise RuntimeError('sheet_limit')
                    for cell in row.findall('{'+S+'}c'):
                        cells+=1;coordinate=cell.get('r')
                        if cells>2_000_000:raise RuntimeError('sheet_limit')
                        if coordinate:
                            match=re.fullmatch(r'([A-Z]{1,3})([1-9]\d{0,5})',coordinate)
                            if not match or int(match[2])>200000:raise RuntimeError('sheet_limit')
                            col=0
                            for letter in match[1]:col=col*26+ord(letter)-64
                            if col>2000:raise RuntimeError('sheet_limit')
            from openpyxl import load_workbook
            workbook=load_workbook(source,read_only=True,data_only=False,keep_links=False)
            cached=load_workbook(source,read_only=True,data_only=True,keep_links=False)
            try:
                for number,sheet in enumerate(workbook,1):
                    if number>200 or (sheet.max_row or 0)*(sheet.max_column or 0)>2_000_000:raise RuntimeError('sheet_limit')
                    sheet.reset_dimensions();cached[sheet.title].reset_dimensions()
                    text=['工作表 '+sheet.title+('（隐藏）' if sheet.sheet_state!='visible' else '')]
                    count=0;characters=0;row_count=0
                    for row,values in zip(sheet.iter_rows(),cached[sheet.title].iter_rows()):
                        row_count+=1
                        if row_count>200000 or len(row)>2000:raise RuntimeError('sheet_limit')
                        count+=len(row)
                        if count>2_000_000:raise RuntimeError('sheet_limit')
                        cells=[]
                        for cell,stored in zip(row,values):
                            value=cell.value
                            if value is None:continue
                            if cell.data_type=='f':value=str(stored.value) if stored.value is not None else '无缓存值';value+=' [公式: '+cell.value+'；未重新计算]'
                            elif isinstance(value,(float,int)) and cell.number_format.endswith('%'):value=str(value*100)+'%'
                            cells.append(cell.coordinate+'='+str(value))
                        if cells:
                            line=' | '.join(cells);characters+=len(line)
                            if characters>4*1024*1024:raise RuntimeError('extraction_limit')
                            text.append(line)
                    pages.append({'page':number,'text':'\n'.join(text),'method':'spreadsheet_text'})
            finally:workbook.close();cached.close()
        else:
            presentation=xml('ppt/presentation.xml');links=relationships('ppt/presentation.xml')
            for number,slide in enumerate(presentation.findall('.//{'+P+'}sldId'),1):
                if number>200:raise RuntimeError('slide_limit')
                name=links[slide.get('{'+R+'}id')]
                paragraphs=[''.join(n.text or '' for n in p.iter('{'+A+'}t')) for p in xml(name).iter('{'+A+'}p')]
                rel=posixpath.join(posixpath.dirname(name),'_rels',posixpath.basename(name)+'.rels')
                if rel in names:
                    for target in relationships(name).values():
                        if target.startswith('ppt/notesSlides/notesSlide') and target.endswith('.xml'):
                            paragraphs+=['备注：']+[''.join(n.text or '' for n in p.iter('{'+A+'}t')) for p in xml(target).iter('{'+A+'}p')]
                pages.append({'page':number,'text':'\n'.join(p for p in paragraphs if p),'method':'presentation_text'})
        if sum(len(p['text']) for p in pages)>4*1024*1024:raise RuntimeError('extraction_limit')
        return pages
