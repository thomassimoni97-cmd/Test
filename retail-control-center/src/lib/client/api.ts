'use client';

import type { Area, HistoryEntry, Owner, SalRecord, Settings, Snapshot, Store, StorePatch, Task, TaskPatch } from '@/lib/domain/types';

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

async function call<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(currentUser ? { 'x-gg-user': encodeURIComponent(currentUser) } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (e) {
    throw new ApiError(0, 'Network unreachable — changes are kept locally until the connection is back.', { cause: String(e) });
  }
  if (res.status === 304) return null as T;
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(res.status, (data.error as string) || `Request failed (${res.status})`, data);
  return data as T;
}

export interface TaskResult {
  task: Task;
  history: HistoryEntry[];
  store: Store | null;
}

export const api = {
  snapshot: async (etag?: string, force = false) => {
    const res = await fetch(`/api/snapshot${force ? '?force=1' : ''}`, { headers: etag ? { 'If-None-Match': `"${etag}"` } : {}, cache: 'no-store' }).catch((e) => {
      throw new ApiError(0, 'Network unreachable', { cause: String(e) });
    });
    if (res.status === 304) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || `Failed to load data (${res.status})`, data);
    return data as Snapshot;
  },
  createTask: (task: Partial<Task> & { Store_ID: string; Area: string; Task_Title: string }, note?: string) => call<TaskResult>('POST', '/api/tasks', { task, note }),
  updateTask: (id: string, patch: TaskPatch, rev: string, note?: string) => call<TaskResult>('PATCH', `/api/tasks/${encodeURIComponent(id)}`, { patch, rev, note }),
  archiveTask: (id: string, rev: string) => call<TaskResult>('DELETE', `/api/tasks/${encodeURIComponent(id)}?rev=${encodeURIComponent(rev)}`),
  addNote: (id: string, text: string) => call<{ history: HistoryEntry[] }>('POST', `/api/tasks/${encodeURIComponent(id)}/notes`, { text }),
  createStore: (store: Partial<Store> & { Store_ID: string; Store_Name: string }) => call<{ store: Store; history: HistoryEntry[] }>('POST', '/api/stores', { store }),
  updateStore: (id: string, patch: StorePatch, rev: string) => call<{ store: Store; history: HistoryEntry[] }>('PATCH', `/api/stores/${encodeURIComponent(id)}`, { patch, rev }),
  saveArea: (area: Omit<Area, 'rev'>, isNew: boolean) => call<{ area: Area }>('POST', '/api/areas', { area, isNew }),
  reorderAreas: (order: string[]) => call<{ areas: Area[] }>('POST', '/api/areas', { order }),
  saveOwner: (owner: Omit<Owner, 'rev' | 'Owner_ID'> & { Owner_ID?: string }) => call<{ owner: Owner }>('POST', '/api/owners', { owner }),
  updateSettings: (settings: Partial<Settings>) => call<{ settings: Settings }>('PUT', '/api/settings', { settings }),
  confirmSal: (body: { storeId: string; salDate: string; baselineTimestamp: string; previousSalDate: string; generationTimestamp: string; generatedMinutes: string; finalMinutes: string; minutesJson: string }) =>
    call<{ sal: SalRecord }>('POST', '/api/sal', body),
  health: () => call<{ ok: boolean; source: string; details: Record<string, string>; latencyMs: number; counts: Record<string, number>; issues: number }>('GET', '/api/health'),
  resetDemo: () => call<Snapshot>('POST', '/api/admin/reset'),
};
