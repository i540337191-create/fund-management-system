import {latestPostRecords} from '../lib/postInvestmentView.ts';

export function newestCreatedPostRecords<T extends {id:string;version:number;time:string}>(records:T[]):T[] {
 const created=new Map<string,number>();
 // A revision's time is not its creation time; missing V1 stays unknown and sorts last.
 for(const record of records)if(record.version===1){const time=Date.parse(record.time);if(Number.isFinite(time))created.set(record.id,time);}
 return latestPostRecords(records).sort((a,b)=>{
  const first=created.get(a.id)??-Infinity,second=created.get(b.id)??-Infinity;
  return first===second?(a.id<b.id?-1:a.id>b.id?1:0):first>second?-1:1;
 });
}
