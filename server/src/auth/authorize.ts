import {cachedRequestSession} from './registered-session.ts';
import type { FastifyReply, FastifyRequest } from "fastify";
import { canRole, type Permission } from "./rbac.ts";
import { getAdminUser, resolveAuthConfig, type AuthConfig, type AuthConfigInput, type SessionUser } from "./session.ts";

export function resolveRequestUser(request: FastifyRequest, authInput: AuthConfigInput = {}): SessionUser | null {
  const auth = resolveAuthConfig(authInput);
  if (auth.mode === "local-bypass") {
    return getAdminUser(auth);
  }

  return cachedRequestSession(request)?.user??null;
}

export function requirePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: AuthConfig,
  permission: Permission,
) {
  const user = resolveRequestUser(request, auth);
  if (!user) {
    return reply.code(401).send({ error: "unauthenticated" });
  }

  if (!canRole(user.role, permission)) {
    return reply.code(403).send({ error: "forbidden" });
  }

  return null;
}

