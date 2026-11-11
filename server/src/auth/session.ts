import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { isRole } from "./rbac.ts";
import type { Role } from "./rbac.ts";

export type AuthMode = "local-bypass" | "password";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type AuthConfig = {
  mode: AuthMode;
  sessionSecret: string;
  adminEmail: string;
  adminPassword: string;
  sessionCookieSecure: boolean;
  sessionMaxAgeSeconds: number;
};

export type AuthConfigInput = Partial<AuthConfig>;

export type SessionPayload = {
  v?: 1 | 2;
  sid?: string;
  binding?: string;
  name?: string;
  sub?: string;
  email?: string;
  role?: Role;
  iat: number;
  exp: number;
};

export const DEFAULT_ADMIN_EMAIL = "admin@example.local";
export const DEFAULT_ADMIN_PASSWORD = "fund-management-admin";
export const DEFAULT_SESSION_SECRET = "dev-session-secret";
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 28800;
const SESSION_COOKIE_NAME = "fundapp_session";

type CreateSessionCookieOptions = {
  secure?: boolean;
  maxAgeSeconds?: number;
  nowSeconds?: number;
  sessionId?: string;
  bootstrapBinding?: string;
};

type ReadSessionCookieOptions = {
  nowSeconds?: number;
};

export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  return {
    mode: env.APP_AUTH_MODE === "password" ? "password" : "local-bypass",
    sessionSecret: env.SESSION_SECRET || DEFAULT_SESSION_SECRET,
    adminEmail: env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL,
    adminPassword: env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,
    sessionCookieSecure: env.SESSION_COOKIE_SECURE === "true",
    sessionMaxAgeSeconds: readPositiveInteger(env.SESSION_MAX_AGE_SECONDS, DEFAULT_SESSION_MAX_AGE_SECONDS),
  };
}

export function resolveAuthConfig(input: AuthConfigInput = {}): AuthConfig {
  return { ...readAuthConfig(), ...input };
}

export function getAdminUser(config: AuthConfig = readAuthConfig()): SessionUser {
  return {
    id: "user-admin",
    name: "管理员",
    email: config.adminEmail,
    role: "admin",
  };
}

export function verifyPasswordLogin(
  credentials: { email: string; password: string },
  config: AuthConfig,
): SessionUser | null {
  if (credentials.email !== config.adminEmail || credentials.password !== config.adminPassword) {
    return null;
  }

  return getAdminUser(config);
}

export function createSessionCookie(user: SessionUser, secret: string, options: CreateSessionCookieOptions = {}): string {
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_SESSION_MAX_AGE_SECONDS;
  const issuedAt = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v:1,sid:options.sessionId??randomUUID(),...(options.bootstrapBinding?{binding:options.bootstrapBinding}:{}),
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    iat: issuedAt,
    exp: issuedAt + maxAgeSeconds,
  };
  return encodeSessionCookie(payload,secret,options);
}

export function createRegisteredSessionCookie(sessionId:string,secret:string,options:CreateSessionCookieOptions={}):string {
  const maxAgeSeconds=options.maxAgeSeconds??DEFAULT_SESSION_MAX_AGE_SECONDS,issuedAt=options.nowSeconds??Math.floor(Date.now()/1000);
  const payload:SessionPayload={v:2,sid:sessionId,iat:issuedAt,exp:issuedAt+maxAgeSeconds,...(options.bootstrapBinding?{binding:options.bootstrapBinding}:{})};
  return encodeSessionCookie(payload,secret,options);
}
function encodeSessionCookie(payload:SessionPayload,secret:string,options:CreateSessionCookieOptions){
  const encodedPayload=Buffer.from(JSON.stringify(payload),'utf8').toString('base64url'),signature=signPayload(encodedPayload,secret),secureAttribute=options.secure?'; Secure':'';
  return `${SESSION_COOKIE_NAME}=${encodedPayload}.${signature}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${options.maxAgeSeconds??DEFAULT_SESSION_MAX_AGE_SECONDS}${secureAttribute}`;
}

export function clearSessionCookie(secure = false): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function readSessionCookie(
  cookieHeader: string | undefined,
  secret: string,
  options: ReadSessionCookieOptions = {},
): SessionPayload | null {
  const rawToken = readCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (!rawToken) {
    return null;
  }

  const [encodedPayload, signature] = rawToken.split(".");
  if (!encodedPayload || !signature || !isValidSignature(encodedPayload, signature, secret)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if(!isValidTimestamp(parsed.iat)||!isValidTimestamp(parsed.exp))return null;
    if(parsed.v===2){
      if(typeof parsed.sid!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(parsed.sid)||Object.keys(parsed).some(k=>!['v','sid','iat','exp','binding'].includes(k))||(parsed.binding!==undefined&&(typeof parsed.binding!=='string'||!/^[a-f0-9]{64}$/.test(parsed.binding))))return null;
    }else if(!parsed.sub||!parsed.email||!isRole(parsed.role))return null;

    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (parsed.exp <= nowSeconds) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...cookieValueParts] = part.trim().split("=");
    if (cookieName === name) {
      return cookieValueParts.join("=");
    }
  }

  return null;
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function isValidSignature(encodedPayload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(signPayload(encodedPayload, secret));
  const actual = Buffer.from(signature);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
