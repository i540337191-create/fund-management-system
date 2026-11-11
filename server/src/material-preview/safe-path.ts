import { lstat, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

// All derivatives share this check: a symlink must not change a registered file's identity.
export async function assertSafeMaterialPath(projectRoot: string, path: string, allowMissing = false) {
  const root = resolve(projectRoot, "docs/source-materials");
  const rel = relative(root, path);
  if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) throw Object.assign(new Error("invalid_source_material_path"), { statusCode: 403 });
  let current = await realpath(root);
  for (const part of rel.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw Object.assign(new Error("invalid_source_material_path"), { statusCode: 403 });
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}
