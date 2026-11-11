import type {ApiMaterialRecord} from '../lib/materialFilters.ts';
import {createApiMaterialEvidenceLinks} from '../lib/materialPreviewLinks.ts';
export function intakeSourceVersionState(material:ApiMaterialRecord|undefined,sourceVersionId?:string|null){
 if(!sourceVersionId)return 'unbound';
 if(!material?.currentVersionId)return 'unverified';
 return material.currentVersionId===sourceVersionId?'current':'changed';
}
export function inboxSourcePreview(material?:ApiMaterialRecord,sourceVersionId?:string|null){
 if(!material)return undefined;
 const bound=Boolean(sourceVersionId);
 const links=createApiMaterialEvidenceLinks(bound?{...material,originalFilePath:`api/materials/${encodeURIComponent(material.id)}/versions/${encodeURIComponent(sourceVersionId!)}/file`,previewFilePath:null,pageImageDir:null,recognizedTextPath:null,recognizedHtmlPath:null}:material);
 return links.find(link=>link.kind==='original_page_images')??links.find(link=>link.kind==='preview_document')??links.find(link=>link.kind==='recognized_text')??links.find(link=>link.kind==='original_document');
}
