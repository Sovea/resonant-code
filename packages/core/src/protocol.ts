import { createHash } from 'node:crypto';

export const PROTOCOL = 'cognitive-adoption' as const;
export const SCHEMA_VERSION = '1' as const;

export function fingerprint(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) =>
    [key, canonical((value as Record<string, unknown>)[key])]));
}

export function requireCondition(value: unknown, code: string, message: string): asserts value {
  if (!value) throw new DomainError(code, message);
}

export class DomainError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
