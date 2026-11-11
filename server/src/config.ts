import {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_SESSION_SECRET,
  readAuthConfig,
} from "./auth/session.ts";

export type ServerConfig = {
  port: number;
  databaseUrl?: string;
};

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  validateServerConfig(env);

  return {
    port: Number(env.API_PORT ?? 8788),
    databaseUrl: databaseUrlFromEnv(env),
  };
}

export function validateServerConfig(env: NodeJS.ProcessEnv = process.env): void {
  const auth = readAuthConfig(env);
  if (auth.mode !== "password") return;

  const problems: string[] = [];
  if (!env.SESSION_SECRET) {
    problems.push("SESSION_SECRET is required when APP_AUTH_MODE=password");
  } else if (isUnsafeSecret(auth.sessionSecret)) {
    problems.push("SESSION_SECRET must be a strong non-default value");
  }

  if (!env.ADMIN_EMAIL || auth.adminEmail === DEFAULT_ADMIN_EMAIL) {
    problems.push("ADMIN_EMAIL must be set to the production administrator email");
  }

  if (!env.ADMIN_PASSWORD) {
    problems.push("ADMIN_PASSWORD is required when APP_AUTH_MODE=password");
  } else if (isUnsafePassword(auth.adminPassword)) {
    problems.push("ADMIN_PASSWORD must be a strong non-default value");
  }

  if (problems.length > 0) {
    const error = new Error(`invalid_server_config: ${problems.join("; ")}`);
    Object.assign(error, { code: "invalid_server_config", problems });
    throw error;
  }
}

function isUnsafeSecret(value: string) {
  return value === DEFAULT_SESSION_SECRET || value === "change-me" || value.length < 32;
}

function isUnsafePassword(value: string) {
  return value === DEFAULT_ADMIN_PASSWORD || value === "change-me" || value.length < 12;
}

export function databaseUrlFromEnv(env:NodeJS.ProcessEnv=process.env):string|undefined{
  if(env.DATABASE_URL)return env.DATABASE_URL;
  if(!env.PGHOST)return undefined;
  const url=new URL('postgres://localhost');url.hostname=env.PGHOST;url.port=env.PGPORT??'5432';url.username=encodeURIComponent(env.PGUSER??'fundapp');url.password=encodeURIComponent(env.PGPASSWORD??'');url.pathname='/'+encodeURIComponent(env.PGDATABASE??'fundapp_road_fund');return url.href;
}
