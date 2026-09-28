import { buildSeedTables } from '@/lib/domain/seed';
import { parseTables, type RawTables } from '@/lib/domain/schema';

export const ANCHOR = new Date('2026-09-28T12:00:00');
export const TODAY = '2026-09-28';

let cached: RawTables | null = null;
export function seedTables(): RawTables {
  if (!cached) cached = buildSeedTables(ANCHOR);
  return structuredClone(cached);
}
export function seedParsed() {
  return parseTables(seedTables());
}
