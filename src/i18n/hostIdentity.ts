const hostTag = Symbol.for('fund-management.localized-host-tag');
export function markHostType<T extends object>(type: T, tag: string): T {
  Object.defineProperty(type, hostTag, { value: tag });
  return type;
}
export function hostType(type: unknown): string | undefined {
  return typeof type === 'string' ? type : type && typeof type === 'object' ? (type as Record<symbol, string>)[hostTag] : undefined;
}
