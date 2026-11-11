import { assertSafeMaterialPath } from "../material-preview/safe-path.ts";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, extname, relative, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import { canRole } from "../auth/rbac.ts";
import { resolveRequestUser } from "../auth/authorize.ts";
import type { AuthConfigInput, SessionUser } from "../auth/session.ts";
import type { LedgerStore, Material } from "../ledger/store.ts";

import { canReadLp, isLpMaterial } from "../ledger/lp-privacy.ts";

const collection = "docs/source-materials/2026-06-10-fund-ops-templates";
type SourceEntry = { id: string; relative_path: string; preview_path?: string; preview_page_image_dir?: string; preview_page_image_manifest_path?: string; preview_page_image_pages?: number; pdf?: { recognized_text_path?: string; local_text_path?: string; recognized_html_path?: string; page_image_manifest_path?: string; page_image_dir?: string; pages?: number } };

export function canReadMaterial(user: SessionUser | null, material: Material) {
  if (isLpMaterial(material) && !canReadLp(user)) return false;
  return Boolean(user && (canRole(user.role, "material:write") || user.role === "admin" ||
    (canRole(user.role, "fund:read") && (material.fundId || material.relationships?.funds.length)) ||
    (canRole(user.role, "project:read") && (material.projectId || material.relationships?.projects.length || material.relationships?.companies.length))));
}

export async function readMaterialSourceIndex(projectRoot: string): Promise<{ materials: SourceEntry[] }> {
  try {
    await assertSafeMaterialPath(projectRoot, resolve(projectRoot, collection, "source-index.json"));
    return JSON.parse(await readFile(resolve(projectRoot, collection, "source-index.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { materials: [] };
    throw error;
  }
}

function matchesEntry(path: string, entry: SourceEntry) {
  const pdf = entry.pdf;
  const files = [entry.relative_path, entry.preview_path, entry.preview_page_image_manifest_path,
    pdf?.recognized_text_path, pdf?.local_text_path, pdf?.recognized_html_path, pdf?.page_image_manifest_path];
  if (files.some((file) => file && path === `${collection}/${file}`)) return true;
  for (const [dir, count] of [[entry.preview_page_image_dir, entry.preview_page_image_pages], [pdf?.page_image_dir, pdf?.pages]] as const) {
    if (!dir || !path.startsWith(`${collection}/${dir}/`)) continue;
    const page = path.slice(`${collection}/${dir}/`.length).match(/^page-(\d+)\.png$/);
    if (page && Number(page[1]) >= 1 && count && Number(page[1]) <= count) return true;
  }
  const html = pdf?.recognized_html_path?.match(/^ocr-results\/([^/]+)\/combined\.html$/);
  const layout = path.match(new RegExp(`^${collection}/layout-cache/([^/]+)/page-(\\d+)\\.json$`));
  return Boolean(html && layout && html[1] === layout[1] && Number(layout[2]) >= 1 && pdf?.pages && Number(layout[2]) <= pdf.pages);
}

export async function resolveMaterialAccess(path: string, root: string, store: LedgerStore, user: SessionUser | null) {
  const normalized = path.split(/[?#]/)[0].replace(/^\//, "");
  if (!normalized.startsWith(`${collection}/`) || normalized.includes("\\") || normalized.split("/").some((part) => part === ".." || part === ".")) return null;
  const index = await readMaterialSourceIndex(root);
  const entry = index.materials.find((item) => matchesEntry(normalized, item));
  if (!entry) return null;
  const materials = await store.listMaterials();
  const material = materials.find((item) => item.sourceMaterialId === entry.id || item.id === entry.id);
  if (!material) return null;
  return { path: normalized, allowed: canReadMaterial(user, material), pageLimit: entry.pdf?.pages ?? entry.preview_page_image_pages ?? 1 };
}

export function registerMaterialFileRoutes(server: FastifyInstance, store: LedgerStore, options: { projectRoot: string; auth?: AuthConfigInput }) {
  server.get("/api/materials/source-index", async (request) => {
    const user = resolveRequestUser(request, options.auth);
    const materials = await store.listMaterials();
    const allowed = new Set(materials.filter((item) => !item.currentVersion && !item.currentVersionId && canReadMaterial(user, item)).flatMap((item) => [item.id, item.sourceMaterialId]));
    const index = await readMaterialSourceIndex(options.projectRoot);
    return { materials: index.materials.filter((item) => allowed.has(item.id)) };
  });

  server.get("/docs/source-materials/*", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    const path = `docs/source-materials/${(request.params as { "*": string })["*"]}`;
    const access = await resolveMaterialAccess(path, options.projectRoot, store, resolveRequestUser(request, options.auth));
    if (!access) return reply.code(404).send({ error: "material_file_not_found" });
    if (!access.allowed) return reply.code(403).send({ error: "forbidden" });
    try {
      await assertSafeMaterialPath(options.projectRoot, resolve(options.projectRoot, access.path));
      const root = await realpath(resolve(options.projectRoot, collection));
      const file = await realpath(resolve(options.projectRoot, access.path));
      const rel = relative(root, file);
      if (rel.startsWith(`..${sep}`) || rel === ".." || rel.startsWith(sep)) return reply.code(404).send({ error: "material_file_not_found" });
      const info = await stat(file);
      if (!info.isFile()) return reply.code(404).send({ error: "material_file_not_found" });
      const type: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".json": "application/json", ".html": "text/html; charset=utf-8", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
      const extension = extname(file).toLowerCase();
      reply.type(type[extension] ?? "application/octet-stream");
      const disposition = [".pdf", ".png", ".txt", ".json", ".html"].includes(extension) ? "inline" : "attachment";
      reply.header("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(basename(file)).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`);
      if (extension === ".html") reply.header("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:");
      reply.header("Accept-Ranges", "bytes");
      const range = request.headers.range;
      if (range) {
        const match = range.match(/^bytes=(\d*)-(\d*)$/);
        const start = match?.[1] ? Number(match[1]) : Math.max(0, info.size - Number(match?.[2]));
        const end = match?.[1] ? (match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1) : info.size - 1;
        if (!match || (!match[1] && !match[2]) || start < 0 || start > end || start >= info.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
          return reply.code(416).header("Content-Range", `bytes */${info.size}`).send();
        }
        reply.code(206).header("Content-Range", `bytes ${start}-${end}/${info.size}`).header("Content-Length", end - start + 1);
        return reply.send(createReadStream(file, { start, end }));
      }
      reply.header("Content-Length", info.size);
      return reply.send(createReadStream(file));
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 403) return reply.code(404).send({ error: "material_file_not_found" });
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return reply.code(404).send({ error: "material_file_not_found" });
      throw error;
    }
  });
}
