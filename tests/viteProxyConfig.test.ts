import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("Vite proxies every server-backed business state API", () => {
  const requiredApiPrefixes = [
    "/api/health",
    "/api/record-management",
    "/api/session",
    "/api/users",
    "/api/ai-intake-items",
    "/api/ai",
    "/api/funds",
    "/api/fund-investors",
    "/api/projects",
    "/api/tasks",
    "/api/materials",
    "/api/meetings",
    "/api/reports",
    "/api/risks",
    "/api/capital-records",
    "/api/exit-settlements",
    "/api/asset-history",
    "/api/investment-cashflows",
    "/api/audit-events",
  ];

  for (const prefix of requiredApiPrefixes) {
    assert.match(viteConfig, new RegExp(`"${prefix}"`));
  }
});
