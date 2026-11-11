import type { DataPurpose } from './source-policy.ts';
import { normalizeDataOrigin } from './source-policy.ts';
import { createHash } from 'node:crypto';
import type { AuditEvent, Material, MaterialRelationships, Project } from './store.ts';
export class MaterialWriteError extends Error {
    code: string;
    status: number;
    existingMaterialId?: string;
    constructor(code: string, status = 400, existingMaterialId?: string) { super(code); this.code = code; this.status = status; this.existingMaterialId = existingMaterialId; }
}
export type MaterialVersion = {
    dataPurpose?:DataPurpose;
    id: string;
    materialId: string;
    version: number;
    name: string;
    sizeBytes: number;
    sha256: string;
    mimeType: string;
    uploadedBy: string;
    uploadedById: string;
    createdAt: string;
    blobId: string;
    requestId: string;
    fingerprint: string;
    auditEventId: string;
};
export type UploadMaterialInput = {
    requestId: string;
    name: string;
    type: string;
    projectId?: string;
    fundId?: string;
    companyId?: string;
    materialId?: string;
    expectedVersion?: number;
    legacyVersion?: Omit<MaterialVersion, "materialId" | "version" | "auditEventId">;
    versionId: string;
    sizeBytes: number;
    sha256: string;
    mimeType: string;
    actor: {
        id: string;
        name: string;
    };
};
export type UploadMaterialResult = {
    material: Material;
    version: MaterialVersion;
    auditEvent: AuditEvent;
    created: boolean;
};
export function uploadFingerprint(input: UploadMaterialInput) {
    return createHash('sha256').update(JSON.stringify([input.requestId, input.name, input.type, input.projectId, input.materialId ?? null, input.expectedVersion ?? null, input.sizeBytes, input.sha256, input.mimeType, input.actor.id, input.actor.name,...(input.fundId?[input.fundId]:[]),...(input.companyId?[input.companyId]:[])])).digest('hex');
}
export function projectRelationships(projects: Project[], funds: {
    id: string;
    name: string;
}[]): MaterialRelationships {
    const fundIds = [...new Set(projects.map(p => p.fundId))];
    return {
        projects: projects.map((p, i) => ({
            id: p.id,
            name: p.name,
            relationType: 'linked',
            isPrimary: i === 0
        })),
        funds: fundIds.map((id, i) => ({
            id,
            name: funds.find(f => f.id === id)?.name ?? id,
            relationType: 'linked',
            isPrimary: i === 0
        })),
        companies: [],
        investors: []
    };
}
export function versionPath(materialId: string, versionId: string) { return `api/materials/${materialId}/versions/${versionId}/file`; }
export function applyVersion(material: Material, version: MaterialVersion, type: string) {
    Object.assign(material, {
        name: version.name,
        type,
        uploader: version.uploadedBy,
        time: version.createdAt,
        source: '用户上传',
        status: '待复核',
        quotes: '0',
        originalFilePath: versionPath(material.id, version.id),
        previewFilePath: null,
        recognizedTextPath: null,
        recognizedHtmlPath: null,
        pageImageManifestPath: null,
        pageImageDir: null,
        sizeBytes: version.sizeBytes,
        sha256: version.sha256,
        fileExtension: version.name.split('.').pop()!.toLowerCase(),
        version: version.version,
        currentVersion: version.version,
        currentVersionId: version.id,
        dataOrigin: normalizeDataOrigin(material.dataOrigin)
    });
}
export function materialProjectRelationships(material: Material, projects: Project[], funds: {
    id: string;
    name: string;
}[], preserveLegacy: boolean) {
    const linked = projectRelationships(projects, funds);
    if (preserveLegacy) {
        const existing = [...(material.relationships?.funds ?? [])];
        if (material.fundId && !existing.some(relation => relation.id === material.fundId)) {
            existing.push({
                id: material.fundId,
                name: funds.find(fund => fund.id === material.fundId)?.name ?? material.fundId,
                relationType: 'primary',
                isPrimary: true
            });
        }
        linked.funds = [...existing, ...linked.funds.filter(relation => !existing.some(old => old.id === relation.id)).map(relation => ({ ...relation, isPrimary: !material.fundId && relation.isPrimary }))];
    }
    linked.companies = material.relationships?.companies ?? [];
    linked.investors = material.relationships?.investors ?? [];
    return linked;
}
