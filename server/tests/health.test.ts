import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.ts";

test("health endpoint returns ok", async () => {
  const server = createServer();
  const response = await server.inject({ method: "GET", url: "/api/health" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok,true);
  assert.equal(response.json().service,'fund-management-fund-api');
  assert.ok(['running','idle'].includes(response.json().maintenance.postInvestment.state));
  await server.close();
});
