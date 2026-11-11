import assert from "node:assert/strict";
import test from "node:test";
import { createSessionCookie } from "../src/auth/session.ts";
import { createServer } from "../src/index.ts";

const auth = {
  mode: "password" as const,
  sessionSecret: "session-boundary-test-secret",
  adminEmail: "boundary@example.test",
  adminPassword: "boundary-test-password",
};

const reads = [
  "/api/session/me",
  "/api/funds",
  "/api/funds/fundapp-growth-i",
  "/api/projects",
  "/api/projects/demo-robotics",
  "/api/tasks",
  "/api/materials",
  "/api/materials/text-search?q=基金",
  "/api/ai-intake-items",
  "/api/meetings",
  "/api/reports",
  "/api/capital-records",
  "/api/audit-events",
  "/api/ai/settings",
];

test("password mode blocks anonymous business reads, HEAD requests and AI calls", async (t) => {
  let upstreamCalls = 0;
  const server = createServer({
    auth,
    ai: {
      env: { QWEN_API_KEY: "test-only-key" },
      fetchImpl: async () => {
        upstreamCalls += 1;
        throw new Error("unauthenticated request reached upstream");
      },
    },
  });
  t.after(() => server.close());

  for (const url of reads) {
    const response = await server.inject({ method: "GET", url });
    assert.equal(response.statusCode, 401, url);
    assert.deepEqual(response.json(), { error: "unauthenticated" }, url);
  }
  assert.equal((await server.inject({ method: "HEAD", url: "/api/projects" })).statusCode, 401);
  const response = await server.inject({
    method: "POST",
    url: "/api/ai/chat?next=/api/session/login",
    payload: { prompt: "读取项目资料" },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(upstreamCalls, 0);
});

test("malformed, forged and expired sessions cannot read business data or call AI", async (t) => {
  const server = createServer({ auth });
  t.after(() => server.close());
  const user = { id: "user-admin", name: "管理员", email: auth.adminEmail, role: "admin" as const };
  const expired = createSessionCookie(user, auth.sessionSecret, {
    nowSeconds: Math.floor(Date.now() / 1000) - 60,
    maxAgeSeconds: 10,
  });
  const forged = createSessionCookie(user, "wrong-signing-secret");

  for (const cookie of ["fundapp_session=invalid", forged, expired]) {
    for (const url of ["/api/projects", "/api/ai/settings"]) {
      const response = await server.inject({ method: "GET", url, headers: { cookie } });
      assert.equal(response.statusCode, 401, url);
    }
    const response = await server.inject({
      method: "POST", url: "/api/ai/chat", headers: { cookie }, payload: { prompt: "test" },
    });
    assert.equal(response.statusCode, 401);
  }
});

test("health and login stay public; a real login restores business and AI access", async (t) => {
  const upstreamCalls:string[] = [];
  const server = createServer({
    auth,
    ai: {
      env: { QWEN_API_KEY: "test-only-key" },
      fetchImpl: async (_url,init) => {
        const body=JSON.parse(String(init?.body)),classification=body.messages[0]?.content.startsWith('FUNDAPP_BUSINESS_SCOPE');
        upstreamCalls.push(classification?'classification':'chat');
        return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: classification?JSON.stringify({scope:'business'}):'ok' } }] }) };
      },
    },
  });
  t.after(() => server.close());
  assert.equal((await server.inject({ method: "GET", url: "/api/health?check=1" })).statusCode, 200);
  assert.equal((await server.inject({ method: "HEAD", url: "/api/health" })).statusCode, 200);
  const login = await server.inject({
    method: "POST", url: "/api/session/login", payload: { email: auth.adminEmail, password: auth.adminPassword },
  });
  assert.equal(login.statusCode, 200);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  for (const url of reads.filter((url) => !url.includes("text-search"))) {
    assert.equal((await server.inject({ method: "GET", url, headers: { cookie } })).statusCode, 200, url);
  }
  const chat = await server.inject({ method: "POST", url: "/api/ai/chat", headers: { cookie }, payload: { prompt: "请说明项目报告的办理流程" } });
  assert.equal(chat.statusCode, 200);
  assert.deepEqual(upstreamCalls,['classification','chat']);
});

test("new business routes inherit session protection without individual guards", async (t) => {
  const server = createServer({ auth });
  t.after(() => server.close());
  let handlerCalls = 0;
  server.get("/api/future-business", async () => { handlerCalls += 1; return { confidential: true }; });
  assert.equal((await server.inject({ method: "GET", url: "/api/future-business" })).statusCode, 401);
  assert.equal(handlerCalls, 0);
});
