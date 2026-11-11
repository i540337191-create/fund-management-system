import {canManageFunds} from './fundMasterTypes.ts';
// Presentation only; the API enforces the same user-approved policy on every response.
export function canViewFullLp(role?:string){return role==='admin'||role==='investment_manager'||role==='finance'||role==='legal';}
// Explicit local demo actions update anonymous fixtures, never the server ledger.
export function canConfirmLpSignature(role?:string,localDemo=false){return localDemo||canManageFunds(role);}
