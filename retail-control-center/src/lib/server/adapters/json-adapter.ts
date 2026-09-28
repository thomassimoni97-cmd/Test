// Local JSON-file adapter: zero-setup demo mode and offline development.
// Same contract as the Google Sheets adapter (rows are header → cell maps).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { TABLES, TABLE_NAMES, type RawRow, type RawTables, type TableName } from '@/lib/domain/schema';
import { buildSeedTables } from '@/lib/domain/seed';
import type { TableAdapter } from './types';

export class JsonFileAdapter implements TableAdapter {
  readonly kind = 'local' as const;
  private data: RawTables | null = null;
  private loading: Promise<RawTables> | null = null;

  constructor(private readonly file: string, private readonly seed: () => RawTables = () => buildSeedTables()) {}

  private async load(): Promise<RawTables> {
    if (this.data) return this.data;
    if (!this.loading) {
      this.loading = (async () => {
        try {
          const txt = await fs.readFile(this.file, 'utf8');
          const parsed = JSON.parse(txt) as Partial<RawTables>;
          const full = Object.fromEntries(TABLE_NAMES.map((t) => [t, parsed[t] ?? []])) as RawTables;
          this.data = full;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
          this.data = this.seed();
          await this.persist();
        }
        return this.data!;
      })().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async persist() {
    if (!this.data) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.data), 'utf8');
    await fs.rename(tmp, this.file);
  }

  async readAll(): Promise<RawTables> {
    const d = await this.load();
    return structuredClone(d);
  }

  async readTable(table: TableName): Promise<RawRow[]> {
    const d = await this.load();
    return structuredClone(d[table]);
  }

  async updateRow(table: TableName, key: string, row: RawRow): Promise<void> {
    const d = await this.load();
    const keyField = TABLES[table].key;
    const idx = d[table].findIndex((r) => String(r[keyField] ?? '').trim() === key);
    if (idx < 0) throw new Error(`${table}: row "${key}" not found`);
    d[table][idx] = { ...d[table][idx], ...row };
    await this.persist();
  }

  async appendRows(table: TableName, rows: RawRow[]): Promise<void> {
    if (!rows.length) return;
    const d = await this.load();
    d[table].push(...structuredClone(rows));
    await this.persist();
  }

  async replaceTables(tables: Partial<RawTables>): Promise<void> {
    const d = await this.load();
    for (const [k, v] of Object.entries(tables)) d[k as TableName] = structuredClone(v!);
    await this.persist();
  }

  /** Test helper: replace everything in memory. */
  async reset(tables: RawTables) {
    this.data = structuredClone(tables);
    await this.persist();
  }

  describe() {
    return { mode: 'Local demo file', file: this.file };
  }
}
