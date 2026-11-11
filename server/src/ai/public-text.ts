// Keep unfinished ASCII tokens until the next separator so split identifiers cannot escape filtering.
export function publicAssistantText(text:string,names:ReadonlyMap<string,string>=new Map()){
 const redact=(value:string)=>value.replace(/[A-Za-z0-9_.:-]+/g,token=>names.get(token)??token.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,'所选对象').replace(/\b(?:user|project|fund|task|material|audit|conversation|action)-[A-Za-z0-9_.:-]+\b/g,'所选对象').replace(/\b(?=[0-9a-f]{64}\b)(?=[0-9a-f]*[a-f])[0-9a-f]{64}\b/gi,'校验信息'));
 // Keep internal navigation targets intact; IDs remain hidden in visible labels.
 const links=/\[([^\]\n]+)\]\((\/(?:projects|companies|funds|tasks|materials|reports|meetings|ai-inbox|settings|capital|monitoring)(?:[/?#][^\s)]*)?)\)/g;
 let result='',offset=0;for(const match of text.matchAll(links)){result+=redact(text.slice(offset,match.index))+`[${redact(match[1])}](${match[2]})`;offset=match.index!+match[0].length;}return result+redact(text.slice(offset));
}
export function publicAssistantStream(names:ReadonlyMap<string,string>=new Map()){
 let pending='';
 return {push(text:string){pending+=text;if(pending.length>120000)throw Error('reply_too_large');const partialLink=pending.search(/\[[^\]\n]*$|\[[^\]\n]*\](?:\([^\)\n]*)?$/),ascii=pending.match(/[A-Za-z0-9_.:-]+$/),cut=partialLink>=0?partialLink:ascii?pending.length-ascii[0].length:pending.length,complete=pending.slice(0,cut);pending=pending.slice(cut);return publicAssistantText(complete,names);},finish(){const text=/^[0-9a-f]{8}-[0-9a-f-]+$/i.test(pending)?'所选对象':publicAssistantText(pending,names);pending='';return text;}};
}
