import {clientSessionEpoch,subscribeSessionInvalidation} from './sessionBoundary.ts';
import {schemaDraftSignature} from './customSchemaDraft.ts';
import type {CustomField,CustomObjectType,CustomSchema,CustomSchemaWrite} from './customFields.ts';
export type SchemaSessionDraft={base:CustomSchema|null;draft:CustomField[];pending:CustomSchemaWrite|null;unknown:boolean;blocked:boolean;error:string;notice:string;latest:CustomSchema|null;conflict:boolean};
let owner=clientSessionEpoch();
const drafts=new Map<CustomObjectType,SchemaSessionDraft>();
subscribeSessionInvalidation(()=>{drafts.clear();owner=clientSessionEpoch();});
function current(){if(owner!==clientSessionEpoch()){drafts.clear();owner=clientSessionEpoch();}}
export function readSchemaSessionDraft(kind:CustomObjectType){current();const draft=drafts.get(kind);return draft?structuredClone(draft):null;}
export function saveSchemaSessionDraft(epoch:number,kind:CustomObjectType,draft:SchemaSessionDraft){current();if(epoch!==owner)return;drafts.set(kind,structuredClone(draft));}
export function hasSchemaSessionWork(){current();return [...drafts.values()].some(d=>d.pending||d.base&&schemaDraftSignature(d.base.fields)!==schemaDraftSignature(d.draft));}
// SPA navigation retains drafts in memory; a full page unload cannot retain an uncertain request.
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(hasSchemaSessionWork()){event.preventDefault();event.returnValue='';}});
