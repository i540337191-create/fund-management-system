"""Regression checks for real Office output and hostile package dimensions."""
import importlib.util, pathlib, tempfile, zipfile, re, unittest
scripts=pathlib.Path(__file__).resolve().parent.parent/'scripts';fixtures=pathlib.Path(__file__).resolve().parent/'fixtures/extraction'
spec=importlib.util.spec_from_file_location('office',scripts/'extract-office.py');office=importlib.util.module_from_spec(spec);spec.loader.exec_module(office)
class OfficeBoundaries(unittest.TestCase):
    def test_real_values_dates_formulas_and_notes(self):
        pages=office.extract_office(fixtures/'budget.xlsx','xlsx');self.assertEqual(len(pages),2)
        self.assertIn('246813579',pages[0]['text']);self.assertIn('2026-11-05',pages[0]['text']);self.assertIn('25.0%',pages[0]['text']);self.assertIn('无缓存值',pages[0]['text']);self.assertIn('OFFICE39SECOND',pages[1]['text'])
        slides=office.extract_office(fixtures/'brief.pptx','pptx');self.assertIn('NOTE39REQUIRED',slides[0]['text']);self.assertIn('PRESENT39SECOND',slides[1]['text'])
    def test_missing_dimension_cannot_hide_huge_sparse_row(self):
        with tempfile.TemporaryDirectory() as d:
            bad=pathlib.Path(d)/'sparse.xlsx'
            with zipfile.ZipFile(fixtures/'budget.xlsx') as src,zipfile.ZipFile(bad,'w') as dst:
                for name in src.namelist():
                    data=src.read(name)
                    if name=='xl/worksheets/sheet1.xml':
                        data=re.sub(rb'<dimension[^>]*/>',b'',data).replace(b'<row r="2"',b'<row r="999999999"')
                    dst.writestr(name,data)
            with self.assertRaisesRegex(RuntimeError,'sheet_limit'):office.extract_office(bad,'xlsx')
    def test_underreported_dimension_does_not_truncate_body(self):
        with tempfile.TemporaryDirectory() as d:
            changed=pathlib.Path(d)/'underreported.xlsx'
            with zipfile.ZipFile(fixtures/'budget.xlsx') as src,zipfile.ZipFile(changed,'w') as dst:
                for name in src.namelist():
                    data=src.read(name)
                    if name=='xl/worksheets/sheet1.xml':data=re.sub(rb'<dimension[^>]*/>',b'<dimension ref="A1:A1"/>',data)
                    dst.writestr(name,data)
            self.assertIn('246813579',office.extract_office(changed,'xlsx')[0]['text'])
    def test_external_entity_and_zip_expansion_are_rejected(self):
        for content in [b'<!DOCTYPE x [<!ENTITY e "unsafe">]><x>&e;</x>','<?xml version="1.0" encoding="utf-16"?><!DOCTYPE x [<!ENTITY e "unsafe">]><x>&e;</x>'.encode('utf-16'),b'x'*(16*1024*1024+1)]:
            with tempfile.TemporaryDirectory() as d:
                bad=pathlib.Path(d)/'bad.pptx'
                with zipfile.ZipFile(bad,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('ppt/presentation.xml',content)
                with self.assertRaisesRegex(RuntimeError,'unsafe_office_xml|office_package_limit'):office.extract_office(bad,'pptx')
class AudioBoundaries(unittest.TestCase):
    def test_duration_and_non_audio_are_rejected_before_decoder_or_model(self):
        import json
        spec=importlib.util.spec_from_file_location('audio',scripts/'transcribe-audio.py');audio=importlib.util.module_from_spec(spec);spec.loader.exec_module(audio)
        for duration,streams in [(0,[{'codec_type':'audio'}]),(-1,[{'codec_type':'audio'}]),(3601,[{'codec_type':'audio'}]),('NaN',[{'codec_type':'audio'}]),(20,[{'codec_type':'video'}])]:
            calls=[]
            def run(args,*unused):calls.append(args[0]);return json.dumps({'format':{'duration':duration},'streams':streams})
            with self.assertRaisesRegex(RuntimeError,'audio_duration_limit'):audio.transcribe(pathlib.Path('/synthetic/recording.wav'),run)
            self.assertEqual(calls,['ffprobe'])
if __name__=='__main__':unittest.main()
