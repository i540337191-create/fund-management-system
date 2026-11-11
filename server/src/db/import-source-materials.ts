import { createHash } from "node:crypto";
import { join } from "node:path";
import { withDbClient } from "./client.ts";
import { createSourceMaterialImportPlan, type SourceMaterialImportPlan } from "./source-material-import.ts";
import { isMainModule } from "../runtime/is-main.ts";

type QueryResultLike = {
  rows: Record<string, unknown>[];
};

type Queryable = {
  query: (sql: string, values?: unknown[]) => Promise<QueryResultLike>;
};

export type SourceMaterialImportResult = {
  materials: number;
  fundRelations: number;
  investorRelations: number;
  textChunks: number;
  skippedVersioned?: number;
};

export async function importSourceMaterialsToDatabase({
  databaseUrl = process.env.DATABASE_URL,
  projectRoot = join(import.meta.dirname, "../../.."),
}: {
  databaseUrl?: string;
  projectRoot?: string;
} = {}): Promise<SourceMaterialImportResult> {
  const plan = createSourceMaterialImportPlan({ projectRoot });
  return withDbClient((client) => importSourceMaterialPlan(client, plan), databaseUrl);
}

export async function importSourceMaterialPlan(client: Queryable, plan: SourceMaterialImportPlan): Promise<SourceMaterialImportResult> {
  const fundIdsByName = await queryIdsByName(client, "funds", unique(plan.materials.map((material) => material.fundName).filter(Boolean)));
  const userIdsByName = await queryIdsByName(client, "users", unique(plan.materials.map((material) => material.uploader).filter(Boolean)));

  await client.query("begin");
  let skippedVersioned = 0;
  try {
    await client.query("select pg_advisory_xact_lock(hashtext('material-upload'))");
    const versioned = await client.query('select id, source_material_id from materials where current_version_id is not null');
    const protectedIds = new Set(versioned.rows.flatMap(row => [String(row.id), ...(row.source_material_id ? [String(row.source_material_id)] : [])]));
    const originalCount = plan.materials.length;
    plan = {
      ...plan,
      materials: plan.materials.filter(material => !protectedIds.has(material.id) && !protectedIds.has(material.sourceMaterialId)),
      fundRelations: plan.fundRelations.filter(relation => !protectedIds.has(relation.materialId)),
      investorRelations: plan.investorRelations.filter(relation => !protectedIds.has(relation.materialId)),
      textChunks: plan.textChunks.filter(chunk => !protectedIds.has(chunk.materialId)),
    };
    skippedVersioned = originalCount - plan.materials.length;
    for (const material of plan.materials) {
      const fundId = requireResolvedId(fundIdsByName, material.fundName, "fund");
      await client.query(
        `
          insert into materials (
            id, fund_id, project_id, company_id, raw_project_label, name, category, owner_user_id,
            archived_at, path, archive_path, original_file_path, preview_file_path, recognized_text_path,
            recognized_html_path, page_image_manifest_path, page_image_dir,
            source, status, citation_count, primary_scope, source_material_id, file_extension,
            size_bytes, sha256, data_origin
          )
          values ($1,$2,null,null,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
          on conflict (id) do update set
            fund_id = excluded.fund_id,
            raw_project_label = excluded.raw_project_label,
            name = excluded.name,
            category = excluded.category,
            owner_user_id = excluded.owner_user_id,
            archived_at = excluded.archived_at,
            path = excluded.path,
            archive_path = excluded.archive_path,
            original_file_path = excluded.original_file_path,
            preview_file_path = excluded.preview_file_path,
            recognized_text_path = excluded.recognized_text_path,
            recognized_html_path = excluded.recognized_html_path,
            page_image_manifest_path = excluded.page_image_manifest_path,
            page_image_dir = excluded.page_image_dir,
            source = excluded.source,
            status = excluded.status,
            citation_count = excluded.citation_count,
            primary_scope = excluded.primary_scope,
            source_material_id = excluded.source_material_id,
            file_extension = excluded.file_extension,
            size_bytes = excluded.size_bytes,
            sha256 = excluded.sha256,
            data_origin = excluded.data_origin
        `,
        [
          material.id,
          fundId,
          material.fundName,
          material.name,
          material.category,
          userIdsByName.get(material.uploader) ?? null,
          material.archivedAt,
          material.archivePath,
          material.originalFilePath,
          material.previewFilePath,
          material.recognizedTextPath,
          material.recognizedHtmlPath,
          material.pageImageManifestPath,
          material.pageImageDir,
          material.source,
          material.status,
          material.citationCount,
          material.primaryScope,
          material.sourceMaterialId,
          material.fileExtension,
          material.sizeBytes,
          material.sha256,
          material.dataOrigin,
        ],
      );
    }

    for (const relation of plan.fundRelations) {
      await client.query(
        `
          insert into material_fund_relations (material_id, fund_id, relation_type, is_primary)
          values ($1,$2,$3,$4)
          on conflict (material_id, fund_id, relation_type) do update set
            is_primary = excluded.is_primary
        `,
        [relation.materialId, requireResolvedId(fundIdsByName, relation.fundName, "fund"), relation.relationType, relation.isPrimary],
      );
    }

    for (const relation of plan.investorRelations) {
      const fundId = requireResolvedId(fundIdsByName, relation.fundName, "fund");
      const investorId = investorIdFor(fundId, relation.investorName);
      await client.query(
        `
          insert into fund_investors (
            id, fund_id, name, type, commitment_label, paid_in_label,
            suitability_status, sign_status, updated_at, data_origin
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,now(),'source_pdf_ocr')
          on conflict (id) do update set
            name = excluded.name,
            type = excluded.type,
            data_origin = excluded.data_origin,
            updated_at = now()
        `,
        [investorId, fundId, relation.investorName, "机构投资者", "待补充", "待补充", "待复核", "待签署"],
      );
      await client.query(
        `
          insert into material_investor_relations (material_id, investor_id, relation_type, is_primary)
          values ($1,$2,$3,$4)
          on conflict (material_id, investor_id, relation_type) do update set
            is_primary = excluded.is_primary
        `,
        [relation.materialId, investorId, relation.relationType, relation.isPrimary],
      );
    }

    for (const chunk of plan.textChunks) {
      await client.query(
        `
          insert into material_text_chunks (
            id, material_id, page_number, chunk_index, content, recognized_text_path, original_file_path
          )
          values ($1,$2,$3,$4,$5,$6,$7)
          on conflict (material_id, page_number, chunk_index) do update set
            id = excluded.id,
            content = excluded.content,
            recognized_text_path = excluded.recognized_text_path,
            original_file_path = excluded.original_file_path
        `,
        [chunk.id, chunk.materialId, chunk.pageNumber, chunk.chunkIndex, chunk.content, chunk.recognizedTextPath, chunk.originalFilePath],
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  return {
    materials: plan.materials.length,
    fundRelations: plan.fundRelations.length,
    investorRelations: plan.investorRelations.length,
    textChunks: plan.textChunks.length,
    ...(skippedVersioned ? { skippedVersioned } : {}),
  };
}

async function queryIdsByName(client: Queryable, tableName: "funds" | "users", names: string[]) {
  if (!names.length) return new Map<string, string>();

  const result = await client.query(`select id, name from ${tableName} where name = any($1::text[])`, [names]);
  return new Map(result.rows.map((row) => [String(row.name), String(row.id)]));
}

function requireResolvedId(idsByName: Map<string, string>, name: string, target: string) {
  const id = idsByName.get(name);
  if (!id) throw new Error(`unresolved_${target}:${name}`);
  return id;
}

function investorIdFor(fundId: string, investorName: string) {
  return `investor-${hashId(`${fundId}:${investorName}`)}`;
}

function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

if (isMainModule(import.meta.url)) {
  const result = await importSourceMaterialsToDatabase();
  console.log(JSON.stringify(result, null, 2));
}
