export function internalBusinessPath(href:string,origin:string):string|null{
 try{const url=new URL(href,origin);return url.origin===origin&&/^\/(dashboard|projects|companies|funds|capital|tasks|monitoring|materials|ai-inbox|ai-assistant|meetings|reports|settings)(\/|$)/.test(url.pathname)?url.pathname+url.search+url.hash:null;}catch{return null;}
}

export function inPageBusinessPath(href:string,origin:string,target:string|null):string|null{
 if(target&&!['_self','_parent','_top'].includes(target.toLowerCase()))return null;
 return internalBusinessPath(href,origin);
}
