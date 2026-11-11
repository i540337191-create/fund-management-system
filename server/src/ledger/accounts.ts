import type {SessionUser,AuthConfig} from '../auth/session.ts';
import type {StoredUser} from './workflow.ts';
import type {AuditEvent} from './store.ts';

export type AccountUser=SessionUser&{enabled:boolean;passwordConfigured:boolean;canLogin:boolean;revision:number|null;managedBy:'configuration'|'application'};
export type AuthSession={hash:string;actorId:string;expiresAt:string};
export type AccountReceipt={actorId:string;fingerprint:string;result:unknown};
export type AccountState={users:StoredUser[];sessions:AuthSession[];receipts:Record<string,AccountReceipt>;auditEvents:(AuditEvent&{actorId:string})[]};
export type AccountStore={
  accountTransaction<T>(action:(state:AccountState)=>Promise<T>|T):Promise<T>;
  readAuthSession(hash:string):Promise<{session:AuthSession;user:StoredUser|null}|null>;
};
export function accountUser(user:SessionUser|StoredUser,configuration=false):AccountUser {
  const stored=user as StoredUser;
  const enabled=configuration||stored.enabled!==false,passwordConfigured=configuration||Boolean(stored.passwordHash);
  return {id:user.id,name:user.name,email:user.email,role:user.role,enabled,passwordConfigured,canLogin:enabled&&passwordConfigured,revision:configuration?null:stored.revision??1,managedBy:configuration?'configuration':'application'};
}
export function sessionActor(session:AuthSession,user:StoredUser|null,auth:AuthConfig):SessionUser|null {
  const expires=Date.parse(session.expiresAt);if(!Number.isFinite(expires)||expires<=Date.now())return null;
  if(session.actorId==='user-admin')return {id:'user-admin',name:'管理员',email:auth.adminEmail,role:'admin'};
  if(!user||user.id!==session.actorId||!accountUser(user).canLogin||user.email.toLowerCase()===auth.adminEmail.toLowerCase())return null;
  return {id:user.id,name:user.name,email:user.email,role:user.role};
}
