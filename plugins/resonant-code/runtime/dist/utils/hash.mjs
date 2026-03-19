import { createHash } from 'node:crypto';

export function stableHash(parts           )         {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}
