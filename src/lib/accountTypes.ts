import type {ApiSessionUser} from './apiClient';
import type {AuditEvent} from './auditTrail';
export type AccountUser=ApiSessionUser&{enabled:boolean;passwordConfigured:boolean;canLogin:boolean;revision:number|null;managedBy:'configuration'|'application'};
export type AccountDirectory={currentUser:ApiSessionUser;users:AccountUser[]};
export type AccountCreate={requestId:string;name:string;email:string;role:ApiSessionUser['role'];password:string};
export type AccountAction=({action:'update';expectedRevision:number;name?:string;role?:ApiSessionUser['role'];enabled?:boolean;password?:string}|{action:'revoke_sessions';expectedRevision:number|null})&{requestId:string};
export type AccountResult={user:AccountUser;sessionInvalidated:boolean;auditEvent:AuditEvent};
export type OwnPasswordChange={requestId:string;expectedRevision:number;currentPassword:string;newPassword:string};
export const accountRoleLabels:Record<ApiSessionUser['role'],string>={admin:'管理员',investment_manager:'投资经理',post_investment:'投后管理',finance:'财务',legal:'法务',viewer:'只读'};
export function accountStatus(user:AccountUser){return !user.enabled?'已停用':!user.passwordConfigured?'未设密码':'可登录';}
