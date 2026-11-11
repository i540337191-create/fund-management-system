export type Role =
  | "admin"
  | "investment_manager"
  | "post_investment"
  | "finance"
  | "legal"
  | "viewer";

export type Permission =
  | "fund:read"
  | "fund:write"
  | "project:read"
  | "project:write"
  | "material:write"
  | "meeting:write"
  | "task:write"
  | "report:read"
  | "report:write"
  | "risk:write"
  | "capital:write"
  | "clause:write"
  | "audit:read";

export const permissions: Record<Role, readonly (Permission | "*")[]> = {
  admin: ["*"],
  investment_manager: ["fund:read", "fund:write", "project:read", "project:write", "task:write", "report:read", "report:write", "risk:write", "audit:read"],
  post_investment: ["material:write", "meeting:write", "task:write"],
  finance: ["capital:write", "fund:read"],
  legal: ["clause:write", "audit:read"],
  viewer: ["fund:read", "project:read", "report:read"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(permissions, value);
}

export function canRole(role: Role, permission: Permission): boolean {
  const rolePermissions = permissions[role];
  return rolePermissions.includes("*") || rolePermissions.includes(permission);
}

export function assertRoleCan(role: Role, permission: Permission): void {
  if (canRole(role, permission)) {
    return;
  }

  const error = new Error("forbidden");
  Object.assign(error, { statusCode: 403, code: "forbidden" });
  throw error;
}
