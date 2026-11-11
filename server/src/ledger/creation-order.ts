export type CreationRecord={id:string;createdAt?:string};
export function creationOrder<T extends CreationRecord>(records:readonly T[]):T[]{
 const key=(r:T)=>{if(!r.createdAt||!Number.isFinite(Date.parse(r.createdAt)))return '';const iso=new Date(r.createdAt).toISOString();const fraction=r.createdAt.match(/\.(\d+)Z$/)?.[1]??iso.slice(20,23);return iso.slice(0,19)+'.'+fraction.padEnd(9,'0');};
 return [...records].sort((a,b)=>{const x=key(a),y=key(b);if(x!==y)return x>y?-1:1;const left=a.id??'',right=b.id??'';return left===right?0:left<right?-1:1;});
}
export function creationMetadata(value:unknown):{createdAt?:string}{const stamp=value instanceof Date?value:typeof value==='string'?new Date(value):null;return stamp&&Number.isFinite(stamp.getTime())?{createdAt:typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,9}Z$/.test(value)?value:stamp.toISOString()}:{};}
