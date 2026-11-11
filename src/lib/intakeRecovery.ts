export type IntakeRecovery={token:string;draftId?:string;updatedAt:string;input:{fields:Record<string,string>;customValues?:Record<string,unknown>;materialFields:Record<string,unknown>;stage?:string;formState?:Record<string,unknown>}};
export const intakeRecoveryPrefix='fundapp:business-intake:';
export function readIntakeRecovery(storage:Storage,prefix:string):IntakeRecovery[]{
 const result:IntakeRecovery[]=[];for(let index=0;index<storage.length;index++){const key=storage.key(index);if(!key?.startsWith(prefix))continue;try{const entry=JSON.parse(storage.getItem(key)??'null');if(entry&&typeof entry.token==='string'&&typeof entry.updatedAt==='string'&&entry.input?.fields&&typeof entry.input.fields==='object'&&!Array.isArray(entry.input.fields)&&Object.values(entry.input.fields).every(v=>typeof v==='string')&&JSON.stringify(entry).length<=150000)result.push(entry);}catch{/* Invalid local backups never replace a form. */}}
 return result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
