import assert from "node:assert/strict";
import test from "node:test";
import { readServerConfig, validateServerConfig } from "../src/config.ts";

test("local bypass mode permits development defaults", () => {
  assert.doesNotThrow(() =>
    validateServerConfig({
      APP_AUTH_MODE: "local-bypass",
      SESSION_SECRET: "change-me",
      ADMIN_EMAIL: "admin@example.local",
      ADMIN_PASSWORD: "change-me",
    }),
  );
});

test("password mode rejects missing or default production secrets", () => {
  assert.throws(
    () =>
      readServerConfig({
        APP_AUTH_MODE: "password",
        SESSION_SECRET: "change-me",
        ADMIN_EMAIL: "admin@example.local",
        ADMIN_PASSWORD: "change-me",
      }),
    /invalid_server_config/,
  );
});

test("password mode accepts explicit strong production auth config", () => {
  const config = readServerConfig({
    APP_AUTH_MODE: "password",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    ADMIN_EMAIL: "ops@example.com",
    ADMIN_PASSWORD: "correct-horse-battery-staple",
    API_PORT: "9000",
    DATABASE_URL: "postgres://fundapp:fundapp@localhost:5432/fundapp_road_fund",
  });

  assert.equal(config.port, 9000);
  assert.equal(config.databaseUrl, "postgres://fundapp:fundapp@localhost:5432/fundapp_road_fund");
});

test('discrete PostgreSQL configuration preserves special-character credentials',async()=>{
 const {databaseUrlFromEnv}=await import('../src/config.ts');const password='synthetic@:/%#value';
 const url=new URL(databaseUrlFromEnv({PGHOST:'postgres',PGUSER:'fundapp-user',PGPASSWORD:password,PGDATABASE:'delivery_db'})!);
 assert.equal(decodeURIComponent(url.password),password);assert.equal(url.hostname,'postgres');assert.equal(url.pathname,'/delivery_db');
 assert.equal(databaseUrlFromEnv({}),undefined);assert.equal(databaseUrlFromEnv({DATABASE_URL:'postgres://explicit',PGHOST:'ignored'}),'postgres://explicit');
});
