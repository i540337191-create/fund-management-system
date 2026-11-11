import test from 'node:test';
import assert from 'node:assert/strict';
import {menuDismissHandlers} from '../src/lib/useMenuDismiss.ts';

test('outside primary pointer closes; menu contents and secondary pointers stay open',()=>{
 const inside={} as Node,outside={} as Node;let closes=0;
 const element={contains:(target:Node)=>target===inside} as HTMLElement;
 const h=menuDismissHandlers(element,()=>closes++);
 h.pointerdown({target:inside,button:0} as unknown as PointerEvent);
 h.pointerdown({target:outside,button:2} as unknown as PointerEvent);
 assert.equal(closes,0);
 h.pointerdown({target:outside,button:0} as unknown as PointerEvent);
 assert.equal(closes,1);
});
test('Escape closes and restores trigger focus without reaching a parent dialog',()=>{
 let closes=0,focused=0,prevented=0,stopped=0;
 const element={querySelector:()=>({focus:()=>focused++})} as unknown as HTMLElement;
 const h=menuDismissHandlers(element,()=>closes++);
 const event=(key:string)=>({key,preventDefault:()=>prevented++,stopPropagation:()=>stopped++}) as unknown as KeyboardEvent;
 h.keydown(event('Enter'));assert.equal(closes,0);
 h.keydown(event('Escape'));
 assert.deepEqual([closes,focused,prevented,stopped],[1,1,1,1]);
});

test('background scroll closes a nonmodal menu, internal scroll preserves it and focus does not move the page',()=>{
 const inside={} as Node,outside={} as Node;let closes=0,options:unknown;
 const element={contains:(target:Node)=>target===inside,querySelector:()=>({focus:(value:unknown)=>{options=value;}})} as unknown as HTMLElement;
 const handlers=menuDismissHandlers(element,()=>closes++);
 handlers.scroll({target:inside} as unknown as Event);assert.equal(closes,0);
 handlers.scroll({target:outside} as unknown as Event);assert.equal(closes,1);assert.deepEqual(options,{preventScroll:true});
});
