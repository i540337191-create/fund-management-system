import assert from 'node:assert/strict';
import test from 'node:test';
import { importSourceMaterialPlan } from '../src/db/import-source-materials.ts';
import type { SourceMaterialImportPlan, SourceMaterialImportMaterial } from '../src/db/source-material-import.ts';
function plan(): SourceMaterialImportPlan {
    const material = (id: string): SourceMaterialImportMaterial => ({
        id,
        fundName: '原基金',
        name: 'historical.pdf',
        category: '法务资料',
        uploader: '历史人员',
        archivedAt: '2026-06-10',
        source: '真实物料',
        status: '待复核',
        citationCount: 1,
        archivePath: '基金档案',
        originalFilePath: 'docs/source/original.pdf',
        previewFilePath: 'old-preview.pdf',
        recognizedTextPath: 'old.txt',
        recognizedHtmlPath: 'old.html',
        pageImageManifestPath: null,
        pageImageDir: null,
        sourceMaterialId: `source-${id}`,
        fileExtension: 'pdf',
        sizeBytes: 10,
        sha256: 'a'.repeat(64),
        primaryScope: 'fund',
        dataOrigin: 'source_pdf_ocr'
    });
    return {
        collectionPath: 'docs/source',
        materials: [material('adopted'), material('untouched')],
        projectRelations: [],
        companyRelations: [],
        fundRelations: ['adopted', 'untouched'].map(materialId => ({
            materialId,
            fundName: '原基金',
            relationType: 'primary',
            isPrimary: true
        })),
        investorRelations: ['adopted', 'untouched'].map(materialId => ({
            materialId,
            fundName: '原基金',
            investorName: materialId + 'LP',
            relationType: 'subject',
            isPrimary: false
        })),
        textChunks: ['adopted', 'source-adopted', 'untouched'].map((materialId, i) => ({
            id: 'chunk-' + i,
            materialId,
            pageNumber: 1,
            chunkIndex: 1,
            content: 'historical text',
            recognizedTextPath: 'old.txt',
            originalFilePath: 'old.pdf'
        }))
    };
}
function databaseDouble(versioned: boolean) {
    const current = {
        id: 'adopted',
        source_material_id: 'source-adopted',
        current_version_id: 'private-v2',
        original_file_path: 'api/materials/adopted/versions/private-v2/file',
        project_id: 'linked-project',
        recognized_html_path: null
    };
    const before = structuredClone(current);
    const chunks: string[] = [];
    const writes: {
        sql: string;
        values: unknown[];
    }[] = [];
    const calls: string[] = [];
    const client = { query: async (sql: string, values: unknown[] = []) => {
            const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
            calls.push(q);
            if (q === 'select id, name from funds where name = any($1::text[])')
                return { rows: [{ id: 'fund-original', name: '原基金' }] };
            if (q === 'select id, name from users where name = any($1::text[])')
                return { rows: [{ id: 'user-original', name: '历史人员' }] };
            if (q === 'select id, source_material_id from materials where current_version_id is not null')
                return { rows: versioned ? [current] : [] };
            if (q === 'begin' || q === 'commit' || q === 'rollback' || q.includes('pg_advisory_xact_lock'))
                return { rows: [] };
            writes.push({ sql: q, values });
            if (q.startsWith('insert into materials') && values[0] === 'adopted')
                Object.assign(current, { original_file_path: values[8], recognized_html_path: values[11] });
            if (q.startsWith('insert into material_text_chunks'))
                chunks.push(String(values[1]));
            return { rows: [] };
        } };
    return {
        client,
        current,
        before,
        chunks,
        writes,
        calls
    };
}
test('SQL double: reimport skips adopted metadata, relation writes and historical chunks under upload lock', async () => {
    const db = databaseDouble(true);
    const result = await importSourceMaterialPlan(db.client, plan());
    assert.deepEqual(result, {
        materials: 1,
        fundRelations: 1,
        investorRelations: 1,
        textChunks: 1,
        skippedVersioned: 1
    });
    assert.deepEqual(db.current, db.before);
    assert.deepEqual(db.chunks, ['untouched']);
    assert.equal(db.writes.some(write => write.values.includes('adopted') || write.values.includes('source-adopted')), false);
    const begin = db.calls.indexOf('begin');
    assert.deepEqual(db.calls.slice(begin, begin + 3), ['begin', "select pg_advisory_xact_lock(hashtext('material-upload'))", 'select id, source_material_id from materials where current_version_id is not null']);
    assert.equal(db.calls.at(-1), 'commit');
});
test('SQL double: source imports without adopted rows retain original result shape and counts', async () => {
    const db = databaseDouble(false);
    const result = await importSourceMaterialPlan(db.client, plan());
    assert.deepEqual(result, {
        materials: 2,
        fundRelations: 2,
        investorRelations: 2,
        textChunks: 3
    });
    assert.equal(Object.hasOwn(result, 'skippedVersioned'), false);
});
