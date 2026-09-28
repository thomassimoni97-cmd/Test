'use client';
// Drop-in replacement of '@/lib/client/api' for the artifact edition:
// the same calls, served by the Repository running in the page on top of the artifact store.

import { create } from 'zustand';
import { DEFAULT_SETTINGS, serializeArea, serializeSettings } from '@/lib/domain/schema';
import { buildSeedTables, SEED_AREAS } from '@/lib/domain/seed';
import type { Area, HistoryEntry, Owner, SalRecord, Settings, Snapshot, Store, StorePatch, Task, TaskPatch } from '@/lib/domain/types';
import { AdapterError } from '@/lib/server/adapters/types';
import { ConflictError, NotFoundError, Repository, ValidationError } from '@/lib/server/repository';
import { ArtifactDbAdapter, MemoryAdapter, type ArtifactDb } from './adapters';

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() {
    return this.status === 0 || this.status >= 500;
  }
}

let currentUser = '';
export function setApiUser(name: string) {
  currentUser = name;
}
const user = () => currentUser || 'PMO Admin';

/** Where data lives in this view — read by the welcome screen / banner. */
export const useStorage = create<{ mode: 'loading' | 'saved' | 'memory'; empty: boolean }>(() => ({ mode: 'loading', empty: false }));

let repoP: Promise<Repository> | null = null;
let dbAdapter: ArtifactDbAdapter | null = null;

async function init(): Promise<Repository> {
  const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  let db: ArtifactDb | null = null;
  try {
    db = claude?.use ? ((await claude.use('db')) as ArtifactDb | null) : null;
  } catch {
    db = null;
  }
  if (db) {
    const adapter = new ArtifactDbAdapter(db);
    try {
      await adapter.readAll();
      dbAdapter = adapter;
      useStorage.setState({ mode: 'saved', empty: adapter.isEmpty() });
      return new Repository(adapter, 60 * 60 * 1000);
    } catch {
      /* fall through to memory */
    }
  }
  useStorage.setState({ mode: 'memory', empty: false });
  return new Repository(new MemoryAdapter(buildSeedTables()), 60 * 60 * 1000);
}

function repo() {
  if (!repoP) repoP = init();
  return repoP;
}

async function call<T>(fn: (r: Repository) => Promise<T>): Promise<T> {
  const r = await repo();
  try {
    return await fn(r);
  } catch (e) {
    if (e instanceof ValidationError) throw new ApiError(400, e.message, { issues: e.issues });
    if (e instanceof ConflictError) throw new ApiError(409, e.message, { current: e.current });
    if (e instanceof NotFoundError) throw new ApiError(404, e.message);
    if (e instanceof AdapterError) throw new ApiError(503, e.message);
    throw new ApiError(500, (e as Error)?.message ?? 'Unexpected error');
  }
}

export interface TaskResult {
  task: Task;
  history: HistoryEntry[];
  store: Store | null;
}

export const api = {
  snapshot: async (etag?: string, force = false): Promise<Snapshot | null> =>
    call(async (r) => {
      const e = await r.getEtag({ force });
      if (etag && !force && e === etag) return null;
      return r.getSnapshot();
    }),
  createTask: (task: Partial<Task> & { Store_ID: string; Area: string; Task_Title: string }, note?: string) => call((r) => r.createTask(task, user(), note ?? '')) as Promise<TaskResult>,
  updateTask: (id: string, patch: TaskPatch, rev: string, note?: string) => call((r) => r.updateTask(id, patch, rev, user(), note ?? '')) as Promise<TaskResult>,
  archiveTask: (id: string, rev: string) => call((r) => r.archiveTask(id, rev, user())) as Promise<TaskResult>,
  addNote: (id: string, text: string) => call((r) => r.addNote(id, text, user())),
  createStore: (store: Partial<Store> & { Store_ID: string; Store_Name: string }) => call((r) => r.createStore(store, user())),
  updateStore: (id: string, patch: StorePatch, rev: string) => call((r) => r.updateStore(id, patch, rev, user())),
  saveArea: (area: Omit<Area, 'rev'>, isNew: boolean) => call((r) => r.saveArea(area, isNew)),
  reorderAreas: (order: string[]) => call((r) => r.reorderAreas(order)),
  saveOwner: (owner: Omit<Owner, 'rev' | 'Owner_ID'> & { Owner_ID?: string }) => call((r) => r.saveOwner(owner)),
  updateSettings: (settings: Partial<Settings>) => call((r) => r.updateSettings(settings)),
  confirmSal: (body: { storeId: string; salDate: string; baselineTimestamp: string; previousSalDate: string; generationTimestamp: string; generatedMinutes: string; finalMinutes: string; minutesJson: string }) =>
    call((r) => r.confirmSal(body, user())) as Promise<{ sal: SalRecord }>,
  health: () =>
    call(async (r) => {
      const t = Date.now();
      const s = await r.getSnapshot({ force: true });
      return { ok: true, source: 'browser', details: r.adapter.describe(), latencyMs: Date.now() - t, counts: { stores: s.stores.length, tasks: s.tasks.length, history: s.history.length, sals: s.sals.length }, issues: s.issues.length };
    }),
  resetDemo: async () => {
    const snap = await call((r) => r.resetDemo());
    useStorage.setState({ empty: false });
    return snap;
  },
  /** Artifact only: start with an empty program (default areas and settings). */
  startEmpty: async () => {
    await call(async (r) => {
      await r.adapter.replaceTables({
        STORES: [], TASKS: [], TASK_HISTORY: [], OWNERS: [], SAL_HISTORY: [],
        AREAS: SEED_AREAS.map((a) => serializeArea({ ...a, rev: '' })),
        SETTINGS: serializeSettings(DEFAULT_SETTINGS),
      });
      r.invalidate();
    });
    useStorage.setState({ empty: false });
  },
  isPersistent: () => !!dbAdapter,
};
