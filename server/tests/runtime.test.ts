import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { isMainModule } from "../src/runtime/is-main.ts";

test("main module detection accepts node argv relative paths", () => {
  const entry = path.join("dist", "db", "migrate.js");
  const importMetaUrl = pathToFileURL(path.resolve(entry)).href;

  assert.equal(isMainModule(importMetaUrl, entry), true);
});

test("main module detection rejects different entry paths", () => {
  const importMetaUrl = pathToFileURL(path.resolve("dist/db/migrate.js")).href;

  assert.equal(isMainModule(importMetaUrl, "dist/db/seed.js"), false);
});
