import type { Colors } from 'picocolors/types';

export type JsonObject = Record<string, unknown>;

export function heading(value: string, colors: Colors): string {
  return colors.bold(colors.cyan(value));
}

export function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function statusLine(status: string, colors: Colors): string {
  return `${colors.bold('Status:')} ${statusValue(status, colors)}`;
}

export function statusValue(status: string, colors: Colors): string {
  if (
    [
      'created',
      'initialized',
      'ok',
      'ready',
      'supported',
      'prepared',
      'observations-collected',
      'observations-reused',
      'assessment-recorded',
      'valid',
    ].includes(status)
  ) {
    return colors.green(status);
  }
  if (status === 'rejected') return colors.red(status);
  if (
    [
      'blocked',
      'needs-attention',
      'stale',
    ].includes(status)
  ) {
    return colors.yellow(status);
  }
  return status;
}
