import test from 'node:test';
import assert from 'node:assert/strict';
import {internalBusinessPath} from '../src/lib/internalNavigation.ts';
test('business references retain target context within the same system',()=>{assert.equal(internalBusinessPath('/materials?materialId=abc','http://127.0.0.1:15176'),'/materials?materialId=abc');assert.equal(internalBusinessPath('http://127.0.0.1:15176/projects/p?tab=tasks#x','http://127.0.0.1:15176'),'/projects/p?tab=tasks#x');});
test('downloads, external links and unsafe schemes are not intercepted',()=>{for(const href of ['/api/materials/x/versions/y/file','/docs/source-materials/original.pdf','https://example.com/projects/a','javascript:alert(1)','//example.com/materials'])assert.equal(internalBusinessPath(href,'http://127.0.0.1:15176'),null);});
