import test from 'node:test';
import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {OriginalUploadFeedback,type OriginalUploadState} from '../../src/iterationA/OriginalUploadFeedback';
test('original upload states keep one fixed region and distinguish saved, failed and unknown outcomes',()=>{
 for(const state of ['idle','uploading','saved','unknown','failed'] as OriginalUploadState[]){
  const html=renderToStaticMarkup(<OriginalUploadFeedback state={state}/>);
  assert.match(html,/height:72px/);
  assert.match(html,/aria-label="原件上传结果"/);
  if(state==='saved'){assert.match(html,/var\(--success\)/);assert.match(html,/lucide-check/);assert.match(html,/完整性单独核对/);}
  if(state==='failed'){assert.match(html,/role="alert"/);assert.match(html,/var\(--danger\)/);}
  if(state==='unknown'){assert.match(html,/尚未确认/);assert.doesNotMatch(html,/lucide-check/);}
 }
});
