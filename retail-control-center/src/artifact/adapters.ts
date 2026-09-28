// Storage for the Claude-artifact edition: the artifact's private `db` document store
// (or memory when this view cannot use it). Same TableAdapter contract as Google Sheets.

import { TABLES, TABLE_NAMES, str, type RawRow, type RawTables, type TableName } from '@/lib/domain/schema';
import { AdapterError, type TableAdapter } from '@/lib/server/adapters/types';

/* Minimal typing of the artifact db surface we use. */
interface DocSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
interface DocRef { get(): Promise<DocSnap>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> }
interface Query { get(): Promise<{ docs: DocSnap[] }>; limit(n: number): Query }
export interface ArtifactDb { doc(path: string): DocRef; collection(path: string): Query & { doc(id?: string): DocRef } }

const CONFIG: Partial<Record<TableName, string>> = { STORES: 'config/stores', AREAS: 'config/areas', OWNERS: 'config/owners', SETTINGS: 'config/settings' };
const HISTORY_CHUNK = 250;
const MAX_DOC = 240_000; // store limit is 256 KiB per document

const seg = (v: string) => v.replace(/[^A-Za-z0-9_\-~:@+]/g, '_').slice(0, 180) || '_';
const empty = (): RawTables => Object.fromEntries(TABLE_NAMES.map((t) => [t, []])) as unknown as RawTables;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'unavailable') {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
      return fn();
    }
    throw e;
  }
}

function fail(e: unknown, what: string): never {
  const code = (e as { code?: string }).code ?? '';
  const msg = (e as { message?: string }).message ?? String(e);
  if (code === 'quota_exceeded') throw new AdapterError(`Storage is full (${msg}). Archive or delete old data.`, e);
  throw new AdapterError(`Could not ${what}: ${msg}`, e);
}

export class ArtifactDbAdapter implements TableAdapter {
  readonly kind = 'browser' as const;
  private data: RawTables = empty();
  private historyChunks: { id: string; rows: RawRow[] }[] = [];
  private taskDocs = new Set<string>();
  private salDocs = new Set<string>();

  constructor(private readonly db: ArtifactDb) {}

  private rows(s: DocSnap): RawRow[] {
    const d = s.exists ? s.data() : undefined;
    return Array.isArray(d?.rows) ? (d!.rows as RawRow[]).map((r) => ({ ...r })) : [];
  }

  async readAll(): Promise<RawTables> {
    try {
      const [stores, areas, owners, settings, tasks, hist, sals] = await Promise.all([
        withRetry(() => this.db.doc(CONFIG.STORES!).get()),
        withRetry(() => this.db.doc(CONFIG.AREAS!).get()),
        withRetry(() => this.db.doc(CONFIG.OWNERS!).get()),
        withRetry(() => this.db.doc(CONFIG.SETTINGS!).get()),
        withRetry(() => this.db.collection('tasks').limit(1000).get()),
        withRetry(() => this.db.collection('history').limit(1000).get()),
        withRetry(() => this.db.collection('sals').limit(1000).get()),
      ]);
      this.taskDocs = new Set(tasks.docs.map((d) => d.id));
      this.historyChunks = hist.docs.map((d) => ({ id: d.id, rows: this.rows(d) })).sort((a, b) => a.id.localeCompare(b.id));
      this.salDocs = new Set(sals.docs.map((d) => d.id));
      this.data = {
        STORES: this.rows(stores),
        AREAS: this.rows(areas),
        OWNERS: this.rows(owners),
        SETTINGS: this.rows(settings),
        TASKS: tasks.docs.flatMap((d) => this.rows(d)),
        TASK_HISTORY: this.historyChunks.flatMap((c) => c.rows.map((r) => ({ ...r }))),
        SAL_HISTORY: sals.docs.map((d) => (d.data()?.row as RawRow) ?? null).filter(Boolean) as RawRow[],
      };
      return structuredClone(this.data);
    } catch (e) {
      if (e instanceof AdapterError) throw e;
      fail(e, 'read the saved program data');
    }
  }

  isEmpty() {
    return !this.data.SETTINGS.length && !this.data.STORES.length && !this.data.TASKS.length;
  }

  async readTable(table: TableName): Promise<RawRow[]> {
    await this.readAll();
    return structuredClone(this.data[table]);
  }

  private async put(path: string, body: Record<string, unknown>) {
    const size = JSON.stringify(body).length;
    if (size > MAX_DOC) throw new AdapterError(`Too much data in one storage document (${path}, ${Math.round(size / 1024)} KB).`);
    try {
      await withRetry(() => this.db.doc(path).set(body));
    } catch (e) {
      fail(e, 'save');
    }
  }

  private async saveTable(table: TableName, only?: Set<string>) {
    if (CONFIG[table]) return this.put(CONFIG[table]!, { rows: this.data[table] });
    if (table === 'TASKS') {
      const groups = new Map<string, RawRow[]>();
      for (const r of this.data.TASKS) {
        const k = seg(str(r.Store_ID));
        groups.set(k, [...(groups.get(k) ?? []), r]);
      }
      for (const [k, rows] of groups) {
        if (only && !only.has(k)) continue;
        await this.put(`tasks/${k}`, { rows });
        this.taskDocs.add(k);
      }
      if (!only) {
        for (const k of [...this.taskDocs]) if (!groups.has(k)) {
          await withRetry(() => this.db.doc(`tasks/${k}`).delete());
          this.taskDocs.delete(k);
        }
      }
    }
  }

  async updateRow(table: TableName, key: string, row: RawRow): Promise<void> {
    const keyField = TABLES[table].key;
    const list = this.data[table];
    const idx = list.findIndex((r) => str(r[keyField]) === key);
    if (idx < 0) throw new AdapterError(`${table}: row "${key}" not found`);
    list[idx] = { ...list[idx], ...row };
    if (table === 'SAL_HISTORY') return this.put(`sals/${seg(key)}`, { row: list[idx] });
    if (table === 'TASK_HISTORY') throw new AdapterError('History is append-only');
    await this.saveTable(table, table === 'TASKS' ? new Set([seg(str(list[idx].Store_ID))]) : undefined);
  }

  async appendRows(table: TableName, rows: RawRow[]): Promise<void> {
    if (!rows.length) return;
    this.data[table].push(...structuredClone(rows));
    if (table === 'TASK_HISTORY') {
      let last = this.historyChunks[this.historyChunks.length - 1];
      for (const r of rows) {
        if (!last || last.rows.length >= HISTORY_CHUNK) {
          last = { id: `c${String(this.historyChunks.length + 1).padStart(5, '0')}`, rows: [] };
          this.historyChunks.push(last);
        }
        last.rows.push(r);
      }
      const touched = new Set(this.historyChunks.slice(-2).map((c) => c.id));
      for (const c of this.historyChunks) if (touched.has(c.id)) await this.put(`history/${c.id}`, { rows: c.rows });
      return;
    }
    if (table === 'SAL_HISTORY') {
      for (const r of rows) {
        const id = seg(str(r.SAL_ID));
        await this.put(`sals/${id}`, { row: r });
        this.salDocs.add(id);
      }
      return;
    }
    await this.saveTable(table, table === 'TASKS' ? new Set(rows.map((r) => seg(str(r.Store_ID)))) : undefined);
  }

  async replaceTables(tables: Partial<RawTables>): Promise<void> {
    for (const [name, rows] of Object.entries(tables) as [TableName, RawRow[]][]) {
      this.data[name] = structuredClone(rows);
      if (name === 'TASK_HISTORY') {
        const chunks: { id: string; rows: RawRow[] }[] = [];
        for (let i = 0; i < rows.length; i += HISTORY_CHUNK) chunks.push({ id: `c${String(chunks.length + 1).padStart(5, '0')}`, rows: rows.slice(i, i + HISTORY_CHUNK) });
        for (const c of chunks) await this.put(`history/${c.id}`, { rows: c.rows });
        for (const old of this.historyChunks) if (!chunks.some((c) => c.id === old.id)) await withRetry(() => this.db.doc(`history/${old.id}`).delete());
        this.historyChunks = chunks;
      } else if (name === 'SAL_HISTORY') {
        const ids = new Set<string>();
        for (const r of rows) {
          const id = seg(str(r.SAL_ID));
          ids.add(id);
          await this.put(`sals/${id}`, { row: r });
        }
        for (const old of [...this.salDocs]) if (!ids.has(old)) await withRetry(() => this.db.doc(`sals/${old}`).delete());
        this.salDocs = ids;
      } else {
        await this.saveTable(name);
      }
    }
  }

  describe() {
    return { mode: 'Saved in this Claude artifact (private document store)' };
  }
}

/** Used when this view cannot reach the artifact store (preview, thumbnail): nothing is persisted. */
export class MemoryAdapter implements TableAdapter {
  readonly kind = 'browser' as const;
  constructor(private data: RawTables) {}
  async readAll() {
    return structuredClone(this.data);
  }
  async readTable(t: TableName) {
    return structuredClone(this.data[t]);
  }
  async updateRow(t: TableName, key: string, row: RawRow) {
    const k = TABLES[t].key;
    const i = this.data[t].findIndex((r) => str(r[k]) === key);
    if (i < 0) throw new AdapterError(`${t}: row "${key}" not found`);
    this.data[t][i] = { ...this.data[t][i], ...row };
  }
  async appendRows(t: TableName, rows: RawRow[]) {
    this.data[t].push(...structuredClone(rows));
  }
  async replaceTables(tables: Partial<RawTables>) {
    for (const [k, v] of Object.entries(tables)) this.data[k as TableName] = structuredClone(v!);
  }
  describe() {
    return { mode: 'Temporary (this view cannot save — changes are lost on reload)' };
  }
}
