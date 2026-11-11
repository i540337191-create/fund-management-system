import assert from "node:assert/strict";
import test from "node:test";
import { canRole, assertRoleCan } from "../src/auth/rbac.ts";
import { createSessionCookie, readAuthConfig, readSessionCookie } from "../src/auth/session.ts";
import {createTestServer as createServer,registeredCookie} from './auth-fixture.ts';

test("local bypass session returns the admin seed user", async () => {
  const server = createServer({ auth: { mode: "local-bypass" } });

  const response = await server.inject({ method: "GET", url: "/api/session/me" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    user: {
      id: "user-admin",
      name: "管理员",
      email: "admin@example.local",
      role: "admin",
    },
  });
});

test("password mode rejects invalid credentials", async () => {
  const server = createServer({
    auth: {
      mode: "password",
      sessionSecret: "test-secret",
      adminEmail: "admin@example.local",
      adminPassword: "correct-password",
    },
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/session/login",
    payload: { email: "admin@example.local", password: "wrong-password" },
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "invalid_credentials" });
});

test("password mode returns a signed session cookie after successful login", async () => {
  const server = createServer({
    auth: {
      mode: "password",
      sessionSecret: "test-secret",
      adminEmail: "admin@example.local",
      adminPassword: "correct-password",
    },
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/session/login",
    payload: { email: "admin@example.local", password: "correct-password" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.role, "admin");
  assert.match(response.headers["set-cookie"] as string, /fundapp_session=/);
  assert.match(response.headers["set-cookie"] as string, /HttpOnly/);
  assert.match(response.headers["set-cookie"] as string, /SameSite=Lax/);
  assert.match(response.headers["set-cookie"] as string, /Max-Age=28800/);
});

test("password mode can issue a secure session cookie for HTTPS deployments", async () => {
  const server = createServer({
    auth: {
      mode: "password",
      sessionSecret: "test-secret",
      adminEmail: "admin@example.local",
      adminPassword: "correct-password",
      sessionCookieSecure: true,
    },
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/session/login",
    payload: { email: "admin@example.local", password: "correct-password" },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["set-cookie"] as string, /Secure/);
});

test("session reader rejects expired signed cookies", () => {
  const cookie = createSessionCookie(
    {
      id: "user-admin",
      name: "管理员",
      email: "admin@example.local",
      role: "admin",
    },
    "test-secret",
    { maxAgeSeconds: 10, nowSeconds: 1000 },
  );

  assert.equal(readSessionCookie(cookie, "test-secret", { nowSeconds: 1009 })?.sub, "user-admin");
  assert.equal(readSessionCookie(cookie, "test-secret", { nowSeconds: 1010 }), null);
});

test("auth config reads session cookie deployment settings", () => {
  const auth = readAuthConfig({
    SESSION_COOKIE_SECURE: "true",
    SESSION_MAX_AGE_SECONDS: "3600",
  });

  assert.equal(auth.sessionCookieSecure, true);
  assert.equal(auth.sessionMaxAgeSeconds, 3600);
});

test("viewer role is blocked from write permissions", () => {
  assert.equal(canRole("viewer", "capital:write"), false);
  assert.equal(canRole("admin", "capital:write"), true);
  assert.throws(() => assertRoleCan("viewer", "capital:write"), /forbidden/);
});

test("password mode write APIs require a session", async () => {
  const server = createServer({
    auth: {
      mode: "password",
      sessionSecret: "test-secret",
      adminEmail: "admin@example.local",
      adminPassword: "correct-password",
    },
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      projectId: "demo-robotics",
      name: "未登录写入",
      type: "资料补充",
      stage: "投后管理",
      owner: "演示投资经理",
      dueDate: "2026-06-20",
      status: "未开始",
      priority: "高",
      relation: "权限测试",
      note: "无 session 应被拒绝。",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "unauthenticated" });
});

test("password mode blocks viewer from write APIs", async () => {
  const sessionSecret = "test-secret";
  const server = createServer({
    auth: {
      mode: "password",
      sessionSecret,
      adminEmail: "admin@example.local",
      adminPassword: "correct-password",
    },
  });
  const cookie = await registeredCookie(server,
    {
      id: "user-viewer",
      name: "只读用户",
      email: "viewer@example.local",
      role: "viewer",
    },
    sessionSecret,
  );

  const response = await server.inject({
    method: "POST",
    url: "/api/capital-records",
    headers: { cookie },
    payload: {
      company: "演示智能设备有限公司",
      fund: "示例成长一期基金",
      received: "100 万元",
      date: "2026-06-11",
      rule: "年化 2%，按日计费",
      receivable: "1000 元",
      dueDate: "2026-06-20",
      status: "未收",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "forbidden" });

  const projectStage = await server.inject({
    method: "PATCH",
    url: "/api/projects/demo-robotics/stage",
    headers: { cookie },
    payload: { stage: "重点跟进" },
  });
  assert.equal(projectStage.statusCode, 403);
  assert.deepEqual(projectStage.json(), { error: "forbidden" });

  const riskHandle = await server.inject({
    method: "POST",
    url: "/api/risks/handle",
    headers: { cookie },
    payload: { title: "风险测试", result: "只读用户不允许处理。" },
  });
  assert.equal(riskHandle.statusCode, 403);
  assert.deepEqual(riskHandle.json(), { error: "forbidden" });
});
