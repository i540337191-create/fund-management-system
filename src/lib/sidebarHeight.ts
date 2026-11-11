export const defaultNavHeight=256,minNavHeight=88;
export function clampNavHeight(value:number,maximum:number){return Math.round(Math.max(minNavHeight,Math.min(value,Math.max(minNavHeight,maximum))));}
export function readNavHeight(key:string,storage?:Pick<Storage,'getItem'>){
 try{const raw=(storage??window.localStorage).getItem(key),value=Number(raw);return raw&&Number.isFinite(value)&&value>=minNavHeight&&value<=10000?Math.round(value):defaultNavHeight;}catch{return defaultNavHeight;}
}
export function saveNavHeight(key:string,value:number,storage?:Pick<Storage,'setItem'>){
 if(!Number.isFinite(value)||value<minNavHeight||value>10000)return;
 try{(storage??window.localStorage).setItem(key,String(Math.round(value)));}catch{/* Private browsing can disable preference storage; resizing still works. */}
}
