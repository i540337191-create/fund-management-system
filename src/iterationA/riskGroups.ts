export function riskGroups<T extends {status?:string}>(rows:T[]) {
 const groups=new Map<string,T[]>([['待跟进',[]],['已处理',[]]]);
 for(const row of rows){const label=row.status?.trim()||'状态待核对';if(!groups.has(label))groups.set(label,[]);groups.get(label)!.push(row);}
 return [...groups].map(([label,records])=>({label,records}));
}
