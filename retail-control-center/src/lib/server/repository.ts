// Business operations on top of a TableAdapter: validation, optimistic concurrency, history, derived write-backs.
// Every write goes through a per-process mutex so IDs and versions never collide.

import { isISODate, todayISO } from '@/lib/domain/dates';
import { progressOf } from '@/lib/domain/metrics';
import { buildSalSnapshot, confirmedSals } from '@/lib/domain/minutes/detect';
import { applyStorePatch, applyTaskPatch, archiveTask, blankTask, createdHistory, newId, nextTaskId, noteHistory } from '@/lib/domain/mutations';
import {
  OPENING_DATE_STATUSES,
  PRIORITIES,
  PROGRAM_TYPES,
  RISK_LEVELS,
  TABLES,
  fingerprint,
  parseArea,
  parseOwner,
  parseStore,
  parseTables,
  parseTask,
  revOf,
  serializeArea,
  serializeHistory,
  serializeOwner,
  serializeSal,
  serializeSettings,
  serializeStore,
  serializeTask,
  str,
  type RawTables,
} from '@/lib/domain/schema';
import { buildSeedTables } from '@/lib/domain/seed';
import type { Area, HistoryEntry, Owner, SalRecord, Settings, Snapshot, Store, StorePatch, Task, TaskPatch } from '@/lib/domain/types';
import type { TableAdapter } from './adapters/types';

export class ConflictError extends Error {
  constructor(message: string, readonly current: unknown) {
    super(message);
    this.name = 'ConflictError';
  }
}
export class NotFoundError extends Error {
  name = 'NotFoundError';
}
export class ValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join('; '));
    this.name = 'ValidationError';
  }
}

type Parsed = ReturnType<typeof parseTables>;

export class Repository {
  private cache: { parsed: Parsed; at: number; etag: string; missing: string[] } | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(readonly adapter: TableAdapter, private readonly ttlMs = adapter.kind === 'sheets' ? 8000 : 60 * 60 * 1000) {}

  /** Serializes writes. */
  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private computeEtag(p: Parsed): string {
    return fingerprint([
      p.stores.map((s) => s.rev),
      p.tasks.map((t) => t.rev),
      p.history.length,
      p.history[p.history.length - 1]?.History_ID ?? '',
      p.sals.map((s) => s.SAL_ID + s.Confirmed),
      p.areas.map((a) => a.rev),
      p.owners.map((o) => o.rev),
      JSON.stringify(p.settings),
    ]);
  }

  private async load(force = false) {
    if (!force && this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache;
    const raw = await this.adapter.readAll();
    const missing = ((raw as RawTables & { __missing?: string[] }).__missing ?? []) as string[];
    const parsed = parseTables(raw);
    for (const m of missing) parsed.issues.unshift({ table: m, rowKey: '—', severity: 'error', message: `Tab "${m}" is missing in the spreadsheet` });
    this.cache = { parsed, at: Date.now(), etag: this.computeEtag(parsed), missing };
    return this.cache;
  }

  private touchCache(mut: (p: Parsed) => void) {
    if (!this.cache) return;
    mut(this.cache.parsed);
    this.cache.etag = this.computeEtag(this.cache.parsed);
  }

  invalidate() {
    this.cache = null;
  }

  async getSnapshot(opts: { force?: boolean } = {}): Promise<Snapshot> {
    const c = await this.load(opts.force);
    const p = c.parsed;
    return {
      stores: p.stores,
      tasks: p.tasks,
      history: p.history,
      areas: p.areas,
      owners: p.owners,
      sals: p.sals,
      settings: p.settings,
      issues: p.issues,
      meta: { source: this.adapter.kind, fetchedAt: new Date(c.at).toISOString(), etag: c.etag },
    };
  }

  async getEtag(opts: { force?: boolean } = {}) {
    return (await this.load(opts.force)).etag;
  }

  // ───────────────────────────── validation ─────────────────────────────

  private validateTaskPatch(patch: TaskPatch, p: Parsed): string[] {
    const errs: string[] = [];
    const statuses = p.settings.Statuses.filter((s) => s.active).map((s) => s.name);
    if (patch.Status !== undefined && !statuses.includes(patch.Status)) errs.push(`Invalid status "${patch.Status}"`);
    if (patch.Risk_Level !== undefined && !RISK_LEVELS.includes(patch.Risk_Level)) errs.push(`Invalid risk "${patch.Risk_Level}"`);
    if (patch.Priority !== undefined && !PRIORITIES.includes(patch.Priority)) errs.push(`Invalid priority "${patch.Priority}"`);
    for (const f of ['Start_Date', 'Due_Date'] as const) {
      const v = patch[f];
      if (v !== undefined && v !== '' && !isISODate(v)) errs.push(`${f} must be a valid date`);
    }
    if (patch.Progress_Percentage !== undefined) {
      const n = Number(patch.Progress_Percentage);
      if (!Number.isFinite(n) || n < 0 || n > 100) errs.push('Progress must be between 0 and 100');
    }
    if (patch.Task_Weight !== undefined) {
      const n = Number(patch.Task_Weight);
      if (!Number.isFinite(n) || n <= 0 || n > 100) errs.push('Weight must be a number between 0 and 100');
    }
    if (patch.Area !== undefined && !p.areas.some((a) => a.Area_ID === patch.Area)) errs.push(`Unknown area "${patch.Area}"`);
    const owners = new Set(p.owners.map((o) => o.Name.toLowerCase()));
    for (const f of ['Owner', 'Secondary_Owner'] as const) {
      const v = patch[f];
      if (v && owners.size && !owners.has(v.toLowerCase())) errs.push(`Unknown ${f === 'Owner' ? 'owner' : 'secondary owner'} "${v}"`);
    }
    if (patch.Task_Title !== undefined && !patch.Task_Title.trim()) errs.push('Title is required');
    return errs;
  }

  private validateStorePatch(patch: StorePatch): string[] {
    const errs: string[] = [];
    if (patch.Opening_Date !== undefined && patch.Opening_Date !== '' && !isISODate(patch.Opening_Date)) errs.push('Opening date must be a valid date');
    if (patch.Opening_Date_Status !== undefined && !OPENING_DATE_STATUSES.includes(patch.Opening_Date_Status)) errs.push('Invalid opening date status');
    if (patch.Program_Type !== undefined && !PROGRAM_TYPES.includes(patch.Program_Type)) errs.push('Invalid program type');
    if (patch.Risk_Level !== undefined && !RISK_LEVELS.includes(patch.Risk_Level)) errs.push('Invalid risk');
    if (patch.Store_Name !== undefined && !patch.Store_Name.trim()) errs.push('Store name is required');
    return errs;
  }

  // ───────────────────────────── fresh reads for concurrency ─────────────────────────────

  private async freshTask(id: string, p: Parsed): Promise<Task> {
    const rows = await this.adapter.readTable('TASKS');
    const row = rows.find((r) => str(r.Task_ID) === id);
    if (!row) throw new NotFoundError(`Task ${id} not found`);
    const t = parseTask(row, { issues: [] }, p.settings.Statuses.map((s) => s.name));
    if (!t) throw new NotFoundError(`Task ${id} not found`);
    return t;
  }

  private async freshStore(id: string): Promise<Store> {
    const rows = await this.adapter.readTable('STORES');
    const row = rows.find((r) => str(r.Store_ID) === id);
    const s = row ? parseStore(row, { issues: [] }) : null;
    if (!s) throw new NotFoundError(`Store ${id} not found`);
    return s;
  }

  private withRev<T extends Task | Store>(e: T, table: 'TASKS' | 'STORES'): T {
    const row = table === 'TASKS' ? serializeTask(e as Task) : serializeStore(e as Store);
    return { ...e, rev: revOf(table, row) };
  }

  /** Keeps STORES.Overall_Progress (convenience copy for Sheet readers) aligned. Returns the store if it changed. */
  private async syncStoreProgress(storeId: string, p: Parsed): Promise<Store | null> {
    const store = p.stores.find((s) => s.Store_ID === storeId);
    if (!store) return null;
    const value = progressOf(p.tasks.filter((t) => t.Store_ID === storeId), p.settings.Progress_Method);
    if (value === store.Overall_Progress) return null;
    const next = this.withRev({ ...store, Overall_Progress: value }, 'STORES');
    await this.adapter.updateRow('STORES', storeId, { Overall_Progress: value });
    this.touchCache((c) => {
      c.stores = c.stores.map((s) => (s.Store_ID === storeId ? next : s));
    });
    return next;
  }

  // ───────────────────────────── tasks ─────────────────────────────

  createTask(input: Partial<Task> & { Store_ID: string; Area: string; Task_Title: string }, user: string, note = '') {
    return this.lock(async () => {
      const { parsed: p } = await this.load(true);
      const errs = this.validateTaskPatch(input as TaskPatch, p);
      if (!p.stores.some((s) => s.Store_ID === input.Store_ID)) errs.push(`Unknown store "${input.Store_ID}"`);
      if (!input.Task_Title?.trim()) errs.push('Title is required');
      if (errs.length) throw new ValidationError(errs);
      const now = new Date();
      const meta = { user, now };
      const id = nextTaskId(p.tasks.map((t) => t.Task_ID), input.Store_ID, input.Area);
      let task = blankTask({ ...pickTaskFields(input), Task_ID: id, Store_ID: input.Store_ID, Area: input.Area, Task_Title: input.Task_Title.trim() }, meta);
      if (task.Status === 'Completed') task = { ...task, Progress_Percentage: 100, Completed_Date: todayISO(now) };
      task = this.withRev(task, 'TASKS');
      const history: HistoryEntry[] = [createdHistory(task, meta)];
      if (note.trim()) history.push(noteHistory(task, note, { user, now: new Date(now.getTime() + 1) }));
      await this.adapter.appendRows('TASKS', [serializeTask(task)]);
      await this.adapter.appendRows('TASK_HISTORY', history.map(serializeHistory));
      this.touchCache((c) => {
        c.tasks.push(task);
        c.history.push(...history);
      });
      const store = await this.syncStoreProgress(task.Store_ID, this.cache!.parsed);
      return { task, history, store };
    });
  }

  updateTask(id: string, patch: TaskPatch, rev: string, user: string, note = '') {
    return this.lock(async () => {
      const { parsed: p } = await this.load();
      const errs = this.validateTaskPatch(patch, p);
      if (errs.length) throw new ValidationError(errs);
      const current = await this.freshTask(id, p);
      if (rev && current.rev !== rev) {
        this.invalidate();
        throw new ConflictError(`Task ${id} was changed by someone else (or directly in Google Sheets) since you loaded it.`, current);
      }
      const now = new Date();
      const res = applyTaskPatch(current, patch, { user, now });
      const history = [...res.history];
      if (note.trim()) history.push(noteHistory(res.task, note, { user, now: new Date(now.getTime() + 1) }));
      if (!history.length) return { task: current, history: [], store: null };
      const task = this.withRev(res.task, 'TASKS');
      if (res.history.length) await this.adapter.updateRow('TASKS', id, serializeTask(task));
      await this.adapter.appendRows('TASK_HISTORY', history.map(serializeHistory));
      this.touchCache((c) => {
        c.tasks = c.tasks.map((t) => (t.Task_ID === id ? task : t));
        c.history.push(...history);
      });
      const store = await this.syncStoreProgress(task.Store_ID, this.cache!.parsed);
      return { task, history, store };
    });
  }

  addNote(id: string, text: string, user: string) {
    return this.lock(async () => {
      if (!text.trim()) throw new ValidationError(['Note text is required']);
      const { parsed: p } = await this.load();
      const task = p.tasks.find((t) => t.Task_ID === id) ?? (await this.freshTask(id, p));
      const h = noteHistory(task, text, { user, now: new Date() });
      await this.adapter.appendRows('TASK_HISTORY', [serializeHistory(h)]);
      this.touchCache((c) => c.history.push(h));
      return { history: [h] };
    });
  }

  archiveTask(id: string, rev: string, user: string, reason = '') {
    return this.lock(async () => {
      const { parsed: p } = await this.load();
      const current = await this.freshTask(id, p);
      if (rev && current.rev !== rev) {
        this.invalidate();
        throw new ConflictError(`Task ${id} was changed since you loaded it.`, current);
      }
      const res = archiveTask(current, { user, now: new Date() }, reason);
      const task = this.withRev(res.task, 'TASKS');
      await this.adapter.updateRow('TASKS', id, serializeTask(task));
      await this.adapter.appendRows('TASK_HISTORY', res.history.map(serializeHistory));
      this.touchCache((c) => {
        c.tasks = c.tasks.map((t) => (t.Task_ID === id ? task : t));
        c.history.push(...res.history);
      });
      const store = await this.syncStoreProgress(task.Store_ID, this.cache!.parsed);
      return { task, history: res.history, store };
    });
  }

  // ───────────────────────────── stores ─────────────────────────────

  createStore(input: Partial<Store> & { Store_ID: string; Store_Name: string }, user: string) {
    return this.lock(async () => {
      const { parsed: p } = await this.load(true);
      const id = input.Store_ID.trim().toUpperCase();
      const errs = this.validateStorePatch(input as StorePatch);
      if (!/^[A-Z0-9]{2,8}$/.test(id)) errs.push('Store ID must be 2–8 letters/digits (e.g. AMS)');
      if (p.stores.some((s) => s.Store_ID === id)) errs.push(`Store ID "${id}" already exists`);
      if (errs.length) throw new ValidationError(errs);
      const now = new Date().toISOString();
      const store = this.withRev(
        {
          Store_ID: id,
          Store_Name: input.Store_Name.trim(),
          Country: input.Country ?? '',
          City: input.City ?? '',
          Store_Type: input.Store_Type ?? 'Standard Store',
          Opening_Date: input.Opening_Date ?? '',
          Opening_Date_Status: input.Opening_Date_Status ?? 'TBD',
          Program_Type: input.Program_Type ?? 'New Store',
          Overall_Status: input.Overall_Status ?? 'Planning',
          Overall_Progress: 0,
          Risk_Level: input.Risk_Level ?? 'Low',
          Project_Manager: input.Project_Manager ?? '',
          Last_Update: now,
          Version: 1,
          rev: '',
        },
        'STORES',
      );
      const h: HistoryEntry = { History_ID: newId('H'), Task_ID: '', Store_ID: id, Timestamp: now, Field_Changed: 'Store.Created', Previous_Value: '', New_Value: store.Store_Name, Note: '', Updated_By: user };
      await this.adapter.appendRows('STORES', [serializeStore(store)]);
      await this.adapter.appendRows('TASK_HISTORY', [serializeHistory(h)]);
      this.touchCache((c) => {
        c.stores.push(store);
        c.history.push(h);
      });
      return { store, history: [h] };
    });
  }

  updateStore(id: string, patch: StorePatch, rev: string, user: string) {
    return this.lock(async () => {
      const errs = this.validateStorePatch(patch);
      if (errs.length) throw new ValidationError(errs);
      const current = await this.freshStore(id);
      if (rev && current.rev !== rev) {
        this.invalidate();
        throw new ConflictError(`Store ${id} was changed since you loaded it.`, current);
      }
      const res = applyStorePatch(current, patch, { user, now: new Date() });
      if (!res.history.length) return { store: current, history: [] };
      const store = this.withRev(res.store, 'STORES');
      await this.adapter.updateRow('STORES', id, serializeStore(store));
      await this.adapter.appendRows('TASK_HISTORY', res.history.map(serializeHistory));
      this.touchCache((c) => {
        c.stores = c.stores.map((s) => (s.Store_ID === id ? store : s));
        c.history.push(...res.history);
      });
      return { store, history: res.history };
    });
  }

  // ───────────────────────────── configuration ─────────────────────────────

  saveArea(input: Omit<Area, 'rev'>, isNew: boolean) {
    return this.lock(async () => {
      const { parsed: p } = await this.load(true);
      const id = input.Area_ID.trim().toUpperCase();
      const errs: string[] = [];
      if (!/^[A-Z0-9]{1,6}$/.test(id)) errs.push('Area code must be 1–6 letters/digits (used in Task IDs)');
      if (!input.Area_Name.trim()) errs.push('Area name is required');
      const exists = p.areas.some((a) => a.Area_ID === id);
      if (isNew && exists) errs.push(`Area code "${id}" already exists`);
      if (!isNew && !exists) errs.push(`Area "${id}" not found`);
      if (errs.length) throw new ValidationError(errs);
      const row = serializeArea({ ...input, Area_ID: id, Area_Name: input.Area_Name.trim(), rev: '' });
      if (isNew) await this.adapter.appendRows('AREAS', [row]);
      else await this.adapter.updateRow('AREAS', id, row);
      const area = parseArea(row)!;
      this.touchCache((c) => {
        c.areas = (isNew ? [...c.areas, area] : c.areas.map((a) => (a.Area_ID === id ? area : a))).sort((a, b) => a.Order - b.Order);
      });
      return { area };
    });
  }

  reorderAreas(order: string[]) {
    return this.lock(async () => {
      const { parsed: p } = await this.load(true);
      const updated: Area[] = [];
      for (const [i, id] of order.entries()) {
        const a = p.areas.find((x) => x.Area_ID === id);
        if (!a) continue;
        const next = { ...a, Order: (i + 1) * 10 };
        if (next.Order !== a.Order) await this.adapter.updateRow('AREAS', id, { Order: next.Order });
        updated.push(parseArea(serializeArea(next))!);
      }
      this.touchCache((c) => {
        c.areas = c.areas.map((a) => updated.find((u) => u.Area_ID === a.Area_ID) ?? a).sort((a, b) => a.Order - b.Order);
      });
      return { areas: this.cache?.parsed.areas ?? updated };
    });
  }

  saveOwner(input: Omit<Owner, 'rev' | 'Owner_ID'> & { Owner_ID?: string }) {
    return this.lock(async () => {
      const { parsed: p } = await this.load(true);
      const errs: string[] = [];
      if (!input.Name.trim()) errs.push('Name is required');
      if (input.Email && !/^[^@\s]+@[^@\s]+$/.test(input.Email)) errs.push('Invalid email');
      const isNew = !input.Owner_ID;
      if (isNew && p.owners.some((o) => o.Name.toLowerCase() === input.Name.trim().toLowerCase())) errs.push(`"${input.Name}" already exists`);
      if (errs.length) throw new ValidationError(errs);
      const maxN = p.owners.reduce((m, o) => Math.max(m, parseInt(o.Owner_ID.replace(/\D/g, ''), 10) || 0), 0);
      const id = input.Owner_ID || `OWN-${String(maxN + 1).padStart(3, '0')}`;
      const row = serializeOwner({ ...input, Owner_ID: id, Name: input.Name.trim(), rev: '' });
      if (isNew) await this.adapter.appendRows('OWNERS', [row]);
      else await this.adapter.updateRow('OWNERS', id, row);
      const owner = parseOwner(row)!;
      this.touchCache((c) => {
        c.owners = isNew ? [...c.owners, owner] : c.owners.map((o) => (o.Owner_ID === id ? owner : o));
      });
      return { owner };
    });
  }

  updateSettings(partial: Partial<Settings>) {
    return this.lock(async () => {
      const { parsed: p } = await this.load(true);
      const next: Settings = { ...p.settings, ...partial, Risk_Guidance: { ...p.settings.Risk_Guidance, ...(partial.Risk_Guidance ?? {}) } };
      const errs: string[] = [];
      if (!['simple', 'weighted'].includes(next.Progress_Method)) errs.push('Invalid progress method');
      if (!(next.Due_Soon_Days >= 1 && next.Due_Soon_Days <= 120)) errs.push('Due soon threshold must be 1–120 days');
      if (!(next.Next_Steps_Horizon_Days >= 1 && next.Next_Steps_Horizon_Days <= 365)) errs.push('Next steps horizon must be 1–365 days');
      if (!(next.Refresh_Interval_Seconds >= 15 && next.Refresh_Interval_Seconds <= 3600)) errs.push('Refresh interval must be 15–3600 s');
      const names = next.Statuses.map((s) => s.name.trim().toLowerCase());
      if (names.some((n) => !n) || new Set(names).size !== names.length) errs.push('Status names must be unique and not empty');
      if (errs.length) throw new ValidationError(errs);
      await this.adapter.replaceTables({ SETTINGS: serializeSettings(next) });
      this.touchCache((c) => {
        c.settings = next;
      });
      return { settings: next };
    });
  }

  // ───────────────────────────── SAL ─────────────────────────────

  confirmSal(
    input: { storeId: string; salDate: string; baselineTimestamp: string; previousSalDate: string; generationTimestamp: string; generatedMinutes: string; finalMinutes: string; minutesJson: string },
    user: string,
  ) {
    return this.lock(async () => {
      const { parsed: p } = await this.load(true);
      const store = p.stores.find((s) => s.Store_ID === input.storeId);
      if (!store) throw new NotFoundError(`Store ${input.storeId} not found`);
      if (!isISODate(input.salDate)) throw new ValidationError(['SAL date must be a valid date']);
      if (!input.finalMinutes.trim()) throw new ValidationError(['Minutes are empty']);
      const prev = confirmedSals(p.sals, store.Store_ID).pop();
      if (prev && input.baselineTimestamp && prev.Confirmation_Timestamp > input.baselineTimestamp) {
        throw new ConflictError('Another SAL was confirmed for this store after this preview was generated. Regenerate the minutes.', prev);
      }
      const now = new Date();
      const snapshot = buildSalSnapshot(store, p.tasks, p.areas, p.settings, input.salDate);
      const sal: SalRecord = {
        SAL_ID: `SAL-${store.Store_ID}-${input.salDate.replace(/-/g, '')}-${now.getTime().toString(36).slice(-4).toUpperCase()}`,
        Store_ID: store.Store_ID,
        SAL_Date: input.salDate,
        Previous_SAL_Date: input.previousSalDate || prev?.SAL_Date || '',
        Baseline_Timestamp: input.baselineTimestamp,
        Generation_Timestamp: input.generationTimestamp || now.toISOString(),
        Confirmation_Timestamp: now.toISOString(),
        Generated_Minutes: input.generatedMinutes,
        Final_Minutes: input.finalMinutes,
        Confirmed: true,
        Created_By: user,
        Minutes_JSON: input.minutesJson.length > 49000 ? '' : input.minutesJson,
        Snapshot_JSON: JSON.stringify(snapshot),
      };
      await this.adapter.appendRows('SAL_HISTORY', [serializeSal(sal)]);
      this.touchCache((c) => c.sals.push(sal));
      return { sal };
    });
  }

  // ───────────────────────────── admin ─────────────────────────────

  resetDemo() {
    return this.lock(async () => {
      await this.adapter.replaceTables(buildSeedTables());
      this.invalidate();
      return this.getSnapshot({ force: true });
    });
  }

  headers() {
    return TABLES;
  }
}

function pickTaskFields(input: Partial<Task>): Partial<Task> {
  const allowed: (keyof Task)[] = ['Description', 'Start_Date', 'Due_Date', 'Owner', 'Secondary_Owner', 'Status', 'Progress_Percentage', 'Risk_Level', 'Priority', 'Task_Weight', 'Dependency', 'Blocker', 'Decision_Required'];
  const out: Partial<Task> = {};
  for (const k of allowed) if (input[k] !== undefined) (out as Record<string, unknown>)[k] = input[k];
  return out;
}
