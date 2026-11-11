export const routeCommittedEvent='fundapp:route-committed';
type Guard={allow:()=>Promise<boolean>;restoreUrl:()=>string};
let guard:Guard|undefined;
export function registerRouteGuard(value:Guard){guard=value;return()=>{if(guard===value)guard=undefined;};}
export async function checkRouteChange(){const current=guard;return {allowed:current?await current.allow():true,restoreUrl:current?.restoreUrl()};}
