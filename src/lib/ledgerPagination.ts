export const ledgerPageSize=10;
export function ledgerPageNumbers(total:number,current:number,pageSize=ledgerPageSize){
 const last=Math.max(1,Math.ceil(total/pageSize)),page=Math.max(1,Math.min(current,last));
 const shown=last<=7?Array.from({length:last},(_,i)=>i+1):[1,...Array.from({length:5},(_,i)=>page-2+i).filter(n=>n>1&&n<last),last];
 const result:(number|'gap')[]=[];
 for(const n of shown){const previous=result[result.length-1];if(typeof previous==='number'&&n-previous>1)result.push('gap');result.push(n);}
 return result;
}
