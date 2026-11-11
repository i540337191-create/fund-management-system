export type MarkdownBlock={kind:'paragraph'|'heading'|'code'|'list'|'table';text:string;level?:number;language?:string;ordered?:boolean;rows?:string[][]};
export function markdownBlocks(text:string):MarkdownBlock[]{
 const lines=text.replace(/\r\n/g,'\n').split('\n'),blocks:MarkdownBlock[]=[];let i=0;
 const cells=(line:string)=>line.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
 while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}const fence=line.match(/^\s*```([\w+-]*)\s*$/);if(fence){i++;const body=[];while(i<lines.length&&!/^\s*```\s*$/.test(lines[i]))body.push(lines[i++]);if(i<lines.length)i++;blocks.push({kind:'code',text:body.join('\n'),language:fence[1]});continue;}
 const heading=line.match(/^(#{1,4})\s+(.+)/);if(heading){blocks.push({kind:'heading',text:heading[2],level:heading[1].length});i++;continue;}
 if(i+1<lines.length&&line.includes('|')&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){const rows=[cells(line)];i+=2;while(i<lines.length&&lines[i].includes('|')&&lines[i].trim())rows.push(cells(lines[i++]));blocks.push({kind:'table',text:'',rows});continue;}
 const item=line.match(/^\s*(?:([-*+])|\d+[.)])\s+(.+)/);if(item){const ordered=!item[1],items=[];while(i<lines.length){const m=lines[i].match(/^\s*(?:([-*+])|\d+[.)])\s+(.+)/);if(!m||!m[1]!==ordered)break;items.push(m[2]);i++;}blocks.push({kind:'list',text:items.join('\n'),ordered});continue;}
 const paragraph=[line];i++;while(i<lines.length&&lines[i].trim()&&!/^\s*(?:```|#{1,4}\s|[-*+]\s|\d+[.)]\s)/.test(lines[i])&&!(lines[i].includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]??'')))paragraph.push(lines[i++]);blocks.push({kind:'paragraph',text:paragraph.join('\n')});
 }return blocks;
}
export function safeAssistantLink(href:string){return /^https?:\/\//i.test(href)||/^\/(?!\/)/.test(href)?href:null;}
