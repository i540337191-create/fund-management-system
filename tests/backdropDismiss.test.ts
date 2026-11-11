import test from 'node:test';
import assert from 'node:assert/strict';
import {backdropDismissHandlers} from '../src/lib/useBackdropDismiss.ts';
function surface(native=false){return {tagName:native?'DIALOG':'DIV',getBoundingClientRect:()=>({left:100,right:500,top:100,bottom:500})} as HTMLElement;}
function event(element:HTMLElement,x=50,y=50,target:EventTarget=element,button=0){return {currentTarget:element,target,button,clientX:x,clientY:y};}
test('native dialog closes only for a complete backdrop gesture, not padding or children',()=>{
 const dialog=surface(true);let closes=0;const h=backdropDismissHandlers(()=>closes++,false,{current:false});
 h.onPointerDown(event(dialog));h.onClick(event(dialog));assert.equal(closes,1);
 h.onPointerDown(event(dialog,150,150));h.onClick(event(dialog,150,150));assert.equal(closes,1);
 h.onPointerDown(event(dialog,150,150,{} as EventTarget));h.onClick(event(dialog));assert.equal(closes,1);
 h.onClick(event(dialog));assert.equal(closes,1);
});
test('overlay content clicks and drag-out gestures do not dismiss; backdrop clicks call close once',()=>{
 const overlay=surface();let closes=0;const h=backdropDismissHandlers(()=>closes++,false,{current:false}),child={} as EventTarget;
 h.onPointerDown(event(overlay,50,50,child));h.onClick(event(overlay));assert.equal(closes,0);
 h.onPointerDown(event(overlay));h.onClick(event(overlay,50,50,child));assert.equal(closes,0);
 h.onPointerDown(event(overlay));h.onClick(event(overlay));assert.equal(closes,1);
});
test('busy, cancelled and secondary-button gestures cannot dismiss',()=>{
 const overlay=surface();let closes=0;const started={current:false};let h=backdropDismissHandlers(()=>closes++,false,started);
 h.onPointerDown(event(overlay));h=backdropDismissHandlers(()=>closes++,true,started);h.onClick(event(overlay));assert.equal(closes,0);
 h=backdropDismissHandlers(()=>closes++,false,started);h.onPointerDown(event(overlay));h.onPointerCancel();h.onClick(event(overlay));assert.equal(closes,0);
 h.onPointerDown(event(overlay,50,50,overlay,2));h.onClick(event(overlay,50,50,overlay,2));assert.equal(closes,0);
 h.onPointerDown(event(overlay));h.onClick(event(overlay));assert.equal(closes,1);
});
