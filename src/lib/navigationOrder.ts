export function navigationOrder(available:string[],saved:unknown):string[]{
 const known=new Set(available),order=Array.isArray(saved)?saved.filter((v):v is string=>typeof v==='string'&&known.has(v)):[];
 const result=[...new Set(order)];
 for(const path of available){if(result.includes(path))continue;const anchor=available.slice(available.indexOf(path)+1).find(next=>result.includes(next));if(anchor)result.splice(result.indexOf(anchor),0,path);else result.push(path);}
 return result;
}
export function moveNavigation(order:string[],source:string,target:string){
 if(source===target||!order.includes(source)||!order.includes(target))return order;
 const next=order.filter(path=>path!==source);next.splice(order.indexOf(target),0,source);return next;
}
