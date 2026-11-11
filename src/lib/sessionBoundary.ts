let epoch=0;
let context:string|null=null;
export const SESSION_CONTEXT_HEADER='x-fundapp-session-context';
type Reason='unauthenticated'|'context_changed';
const listeners=new Set<(reason:Reason)=>void>();
export function clientSessionEpoch(){return epoch;}
export function clientSessionContext(){return context;}
export function acceptClientSession(nextContext:string|null=null){epoch++;context=nextContext;}
export function establishClientSessionContext(nextContext:string){if(context&&context!==nextContext){invalidateClientSession('context_changed');throw Object.assign(new Error('Session identity changed'),{status:401,code:'session_context_changed'});}context=nextContext;}
export function invalidateClientSession(reason:Reason='unauthenticated'){epoch++;context=null;for(const listener of listeners)listener(reason);}
export function subscribeSessionInvalidation(listener:(reason:Reason)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function sessionContextHeaders(initial:HeadersInit|undefined=undefined,skip=false){const headers=new Headers(initial);if(context&&!skip)headers.set(SESSION_CONTEXT_HEADER,context);return Object.fromEntries(headers.entries());}
export function responseSessionContext(response:{headers?:Pick<Headers,'get'>}){return response.headers?.get(SESSION_CONTEXT_HEADER)??null;}
export function assertSessionEpoch(expected:number){if(expected!==epoch)throw Object.assign(new Error('Session changed while request was pending'),{status:409,code:'client_session_changed'});}
export async function fetchInSession<T extends {status:number;headers?:Pick<Headers,'get'>}>(fetcher:(input:RequestInfo|URL,init?:RequestInit)=>Promise<T>,input:RequestInfo|URL,init:RequestInit={}):Promise<T>{
 const started=epoch,expected=context;
 const origin=typeof window==='undefined'?'http://localhost':window.location.origin;
 const address=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,origin);
 const owned=address.origin===origin&&address.pathname.startsWith('/api/');
 const response=await fetcher(input,owned?{...init,credentials:'include',headers:sessionContextHeaders(init.headers)}:init);
 assertSessionEpoch(started);
 if(!owned)return response;
 const actual=responseSessionContext(response);
 if(expected&&actual&&expected!==actual){invalidateClientSession('context_changed');throw Object.assign(new Error('Session identity changed'),{status:401,code:'session_context_changed'});}
 if(response.status===401){invalidateClientSession(actual&&expected&&actual!==expected?'context_changed':'unauthenticated');throw Object.assign(new Error('Session is no longer valid'),{status:401,code:'unauthenticated'});}
 return response;
}
