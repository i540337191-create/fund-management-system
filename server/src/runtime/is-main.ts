import path from "node:path";
import { fileURLToPath } from "node:url";

export function isMainModule(importMetaUrl: string, argvEntry = process.argv[1]) {
  if (!argvEntry) return false;
  return path.resolve(argvEntry) === fileURLToPath(importMetaUrl);
}
