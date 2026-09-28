'use client';

import { useMemo } from 'react';
import { todayISO } from '@/lib/domain/dates';
import { isBlocked, isDueSoon, isOverdue, needsDecision, storeStats, type StoreStat } from '@/lib/domain/metrics';
import type { Area, HistoryEntry, Owner, Snapshot, StatusDef, Store, Task } from '@/lib/domain/types';
import { useApp, type TaskFilters } from './store';

export interface Model {
  snap: Snapshot;
  today: string;
  tasks: Task[]; // non-archived
  storesById: Map<string, Store>;
  areasById: Map<string, Area>;
  activeAreas: Area[];
  ownersByName: Map<string, Owner>;
  activeOwners: Owner[];
  tasksByStore: Map<string, Task[]>;
  historyByTask: Map<string, HistoryEntry[]>; // newest first
  statusDefs: Map<string, StatusDef>;
  activeStatuses: StatusDef[];
  storeStats: Map<string, StoreStat>;
  stores: Store[]; // sorted by opening date
}

export function buildModel(snap: Snapshot, today = todayISO()): Model {
  const tasks = snap.tasks.filter((t) => !t.Archived);
  const tasksByStore = new Map<string, Task[]>();
  for (const t of tasks) {
    const l = tasksByStore.get(t.Store_ID) ?? [];
    l.push(t);
    tasksByStore.set(t.Store_ID, l);
  }
  const historyByTask = new Map<string, HistoryEntry[]>();
  for (let i = snap.history.length - 1; i >= 0; i--) {
    const h = snap.history[i];
    if (!h.Task_ID) continue;
    const l = historyByTask.get(h.Task_ID) ?? [];
    l.push(h);
    historyByTask.set(h.Task_ID, l);
  }
  const stores = [...snap.stores].sort((a, b) => (a.Opening_Date || '9999').localeCompare(b.Opening_Date || '9999'));
  const stats = new Map<string, StoreStat>();
  for (const s of stores) stats.set(s.Store_ID, storeStats(s, tasksByStore.get(s.Store_ID) ?? [], snap.settings, today));
  return {
    snap,
    today,
    tasks,
    storesById: new Map(snap.stores.map((s) => [s.Store_ID, s])),
    areasById: new Map(snap.areas.map((a) => [a.Area_ID, a])),
    activeAreas: snap.areas.filter((a) => a.Active),
    ownersByName: new Map(snap.owners.map((o) => [o.Name, o])),
    activeOwners: snap.owners.filter((o) => o.Active).sort((a, b) => a.Name.localeCompare(b.Name)),
    tasksByStore,
    historyByTask,
    statusDefs: new Map(snap.settings.Statuses.map((s) => [s.name, s])),
    activeStatuses: snap.settings.Statuses.filter((s) => s.active),
    storeStats: stats,
    stores,
  };
}

export function useModel(): Model {
  const snap = useApp((s) => s.snapshot)!;
  const today = todayISO();
  return useMemo(() => buildModel(snap, today), [snap, today]);
}

export function taskMatches(t: Task, f: Partial<TaskFilters>, m: Model, notesIndex?: Map<string, string>): boolean {
  const store = m.storesById.get(t.Store_ID);
  if (f.store && t.Store_ID !== f.store) return false;
  if (f.area && t.Area !== f.area) return false;
  if (f.owner && t.Owner !== f.owner && t.Secondary_Owner !== f.owner) return false;
  if (f.status && t.Status !== f.status) return false;
  if (f.risk && t.Risk_Level !== f.risk) return false;
  if (f.country && store?.Country !== f.country) return false;
  if (f.programType && store?.Program_Type !== f.programType) return false;
  if (f.year && !(store?.Opening_Date ?? '').startsWith(f.year)) return false;
  if (f.overdue && !isOverdue(t, m.today)) return false;
  if (f.blocked && !isBlocked(t)) return false;
  if (f.dueSoon && !isDueSoon(t, m.today, m.snap.settings.Due_Soon_Days)) return false;
  if (f.decision && !needsDecision(t)) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = `${t.Task_ID} ${t.Task_Title} ${t.Description} ${t.Owner} ${t.Secondary_Owner} ${store?.Store_Name ?? ''} ${store?.Country ?? ''} ${t.Blocker} ${t.Decision_Required} ${notesIndex?.get(t.Task_ID) ?? ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function useNotesIndex(m: Model): Map<string, string> {
  return useMemo(() => {
    const idx = new Map<string, string>();
    for (const h of m.snap.history) if (h.Field_Changed === 'Note' && h.Task_ID) idx.set(h.Task_ID, `${idx.get(h.Task_ID) ?? ''} ${h.Note || h.New_Value}`);
    return idx;
  }, [m.snap.history]);
}

export function useFilteredTasks(extra: Partial<TaskFilters> = {}, opts: { ignoreGlobal?: boolean } = {}): Task[] {
  const m = useModel();
  const filters = useApp((s) => s.filters);
  const notes = useNotesIndex(m);
  const f = opts.ignoreGlobal ? extra : { ...filters, ...extra };
  const key = JSON.stringify(f);
  return useMemo(() => m.tasks.filter((t) => taskMatches(t, f, m, notes)), [m, notes, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function activeFilterCount(f: TaskFilters): number {
  return Object.entries(f).filter(([, v]) => (typeof v === 'boolean' ? v : !!v)).length;
}
