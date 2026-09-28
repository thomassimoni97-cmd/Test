'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { applyStorePatch, applyTaskPatch, noteHistory } from '@/lib/domain/mutations';
import type { Area, HistoryEntry, Owner, SalRecord, Settings, Snapshot, Store, StorePatch, Task, TaskPatch } from '@/lib/domain/types';
import { ApiError, api, setApiUser } from './api';
import { toast } from './toasts';

export type SyncState = 'synced' | 'syncing' | 'pending' | 'error';

export interface TaskFilters {
  q: string;
  store: string;
  country: string;
  area: string;
  owner: string;
  status: string;
  risk: string;
  programType: string;
  year: string;
  overdue: boolean;
  blocked: boolean;
  dueSoon: boolean;
  decision: boolean;
}

export const EMPTY_FILTERS: TaskFilters = { q: '', store: '', country: '', area: '', owner: '', status: '', risk: '', programType: '', year: '', overdue: false, blocked: false, dueSoon: false, decision: false };

interface PendingOp {
  id: number;
  label: string;
  run: () => Promise<void>;
}

export type DrawerState = { kind: 'task'; taskId: string } | { kind: 'new-task'; defaults: Partial<Task> } | { kind: 'store'; storeId: string } | { kind: 'new-store' } | null;

interface AppState {
  snapshot: Snapshot | null;
  loadState: 'loading' | 'ready' | 'error';
  loadError: string;
  sync: SyncState;
  syncError: string;
  lastSync: string | null;
  inflight: number;
  pending: PendingOp[];

  presentation: boolean;
  sidebarCollapsed: boolean;
  drawer: DrawerState;
  searchOpen: boolean;
  userName: string;
  filters: TaskFilters;
  /** per-page view preferences (table/kanban, group-by, hidden columns …) */
  prefs: Record<string, unknown>;

  load: (opts?: { force?: boolean; silent?: boolean }) => Promise<void>;
  setPresentation: (on: boolean) => void;
  toggleSidebar: () => void;
  openTask: (taskId: string) => void;
  openNewTask: (defaults?: Partial<Task>) => void;
  openStore: (storeId: string) => void;
  openNewStore: () => void;
  closeDrawer: () => void;
  setSearchOpen: (open: boolean) => void;
  setUserName: (name: string) => void;
  setFilters: (f: Partial<TaskFilters>) => void;
  clearFilters: () => void;
  setPref: (key: string, value: unknown) => void;

  updateTask: (id: string, patch: TaskPatch, note?: string) => Promise<boolean>;
  addNote: (id: string, text: string) => Promise<boolean>;
  createTask: (task: Partial<Task> & { Store_ID: string; Area: string; Task_Title: string }, note?: string) => Promise<Task | null>;
  archiveTask: (id: string) => Promise<boolean>;
  updateStore: (id: string, patch: StorePatch) => Promise<boolean>;
  createStore: (store: Partial<Store> & { Store_ID: string; Store_Name: string }) => Promise<Store | null>;
  saveArea: (area: Omit<Area, 'rev'>, isNew: boolean) => Promise<boolean>;
  reorderAreas: (order: string[]) => Promise<boolean>;
  saveOwner: (owner: Omit<Owner, 'rev' | 'Owner_ID'> & { Owner_ID?: string }) => Promise<boolean>;
  updateSettings: (s: Partial<Settings>) => Promise<boolean>;
  confirmSal: (body: Parameters<typeof api.confirmSal>[0]) => Promise<SalRecord | null>;
  retryPending: () => Promise<void>;
  resetDemo: () => Promise<void>;
}

let pendingSeq = 0;

export const useApp = create<AppState>()(
  persist(
    (set, get) => {
      /** Replace/merge helpers on the snapshot */
      const patchSnap = (fn: (s: Snapshot) => Snapshot) => {
        const s = get().snapshot;
        if (s) set({ snapshot: fn(s) });
      };
      const replaceTask = (task: Task) => patchSnap((s) => ({ ...s, tasks: s.tasks.some((t) => t.Task_ID === task.Task_ID) ? s.tasks.map((t) => (t.Task_ID === task.Task_ID ? task : t)) : [...s.tasks, task] }));
      const replaceStore = (store: Store) => patchSnap((s) => ({ ...s, stores: s.stores.some((x) => x.Store_ID === store.Store_ID) ? s.stores.map((x) => (x.Store_ID === store.Store_ID ? store : x)) : [...s.stores, store] }));
      const appendHistory = (h: HistoryEntry[], replaceIds: string[] = []) =>
        patchSnap((s) => ({ ...s, history: [...s.history.filter((x) => !replaceIds.includes(x.History_ID)), ...h] }));

      const begin = () => set({ inflight: get().inflight + 1, sync: 'syncing' });
      const end = (ok: boolean, err = '') => {
        const inflight = Math.max(0, get().inflight - 1);
        const pending = get().pending.length;
        set({
          inflight,
          sync: pending ? (ok ? 'pending' : 'error') : inflight ? 'syncing' : ok ? 'synced' : get().sync === 'error' ? 'error' : 'synced',
          syncError: ok ? get().syncError : err,
          lastSync: ok && !inflight ? new Date().toISOString() : get().lastSync,
        });
      };

      /**
       * Runs a write. Network/server failures keep the optimistic state and queue a retry
       * (never silently lose edits); validation errors and conflicts roll back.
       */
      async function write<T>(label: string, op: () => Promise<T>, onOk: (r: T) => void, rollback: () => void, onConflict?: (e: ApiError) => void): Promise<boolean> {
        begin();
        try {
          const r = await op();
          onOk(r);
          end(true);
          return true;
        } catch (e) {
          const err = e as ApiError;
          if (err instanceof ApiError && err.isNetwork) {
            const id = ++pendingSeq;
            set({ pending: [...get().pending, { id, label, run: async () => {
              const r = await op();
              onOk(r);
            } }] });
            end(false, err.message);
            set({ sync: 'error', syncError: err.message });
            toast.error('Not saved yet', `${label}: ${err.message}`, { label: 'Retry', run: () => get().retryPending() });
            return false;
          }
          rollback();
          end(true);
          if (err instanceof ApiError && err.status === 409) {
            onConflict?.(err);
            toast.warning('Newer version found', `${err.message} The latest values are now shown — please re-apply your change.`);
          } else {
            toast.error('Change rejected', err.message);
          }
          return false;
        }
      }

      return {
        snapshot: null,
        loadState: 'loading',
        loadError: '',
        sync: 'synced',
        syncError: '',
        lastSync: null,
        inflight: 0,
        pending: [],
        presentation: false,
        sidebarCollapsed: false,
        drawer: null,
        searchOpen: false,
        userName: '',
        filters: EMPTY_FILTERS,
        prefs: {},

        async load(opts = {}) {
          const { snapshot, inflight, pending } = get();
          if (opts.silent && (inflight > 0 || pending.length > 0)) return; // never overwrite local unsaved state
          if (!opts.silent) set({ sync: 'syncing' });
          try {
            const next = await api.snapshot(opts.force ? undefined : snapshot?.meta.etag, opts.force);
            if (get().inflight > 0) return;
            set({
              snapshot: next ?? get().snapshot,
              loadState: 'ready',
              loadError: '',
              sync: get().pending.length ? 'error' : 'synced',
              syncError: get().pending.length ? get().syncError : '',
              lastSync: new Date().toISOString(),
            });
          } catch (e) {
            const msg = (e as Error).message;
            if (!get().snapshot) set({ loadState: 'error', loadError: msg, sync: 'error', syncError: msg });
            else set({ sync: 'error', syncError: msg });
          }
        },

        setPresentation: (on) => set({ presentation: on }),
        toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
        openTask: (taskId) => set({ drawer: { kind: 'task', taskId }, searchOpen: false }),
        openNewTask: (defaults = {}) => set({ drawer: { kind: 'new-task', defaults } }),
        openStore: (storeId) => set({ drawer: { kind: 'store', storeId } }),
        openNewStore: () => set({ drawer: { kind: 'new-store' } }),
        closeDrawer: () => set({ drawer: null }),
        setSearchOpen: (open) => set({ searchOpen: open }),
        setUserName: (name) => {
          setApiUser(name);
          set({ userName: name });
        },
        setFilters: (f) => set({ filters: { ...get().filters, ...f } }),
        clearFilters: () => set({ filters: EMPTY_FILTERS }),
        setPref: (key, value) => set({ prefs: { ...get().prefs, [key]: value } }),

        async updateTask(id, patch, note) {
          const s = get().snapshot;
          const prev = s?.tasks.find((t) => t.Task_ID === id);
          if (!s || !prev) return false;
          const now = new Date();
          const user = get().userName || 'PMO Admin';
          const local = applyTaskPatch(prev, patch, { user, now });
          const localNote = note?.trim() ? [noteHistory(prev, note, { user, now })] : [];
          const tempIds = [...local.history, ...localNote].map((h) => h.History_ID);
          replaceTask(local.task);
          appendHistory([...local.history, ...localNote]);
          return write(
            `Update ${id}`,
            () => api.updateTask(id, patch, prev.rev, note),
            (r) => {
              replaceTask(r.task);
              appendHistory(r.history, tempIds);
              if (r.store) replaceStore(r.store);
            },
            () => {
              replaceTask(prev);
              appendHistory([], tempIds);
            },
            (err) => {
              const cur = err.body.current as Task | undefined;
              if (cur) replaceTask(cur);
              appendHistory([], tempIds);
            },
          );
        },

        async addNote(id, text) {
          const s = get().snapshot;
          const task = s?.tasks.find((t) => t.Task_ID === id);
          if (!task || !text.trim()) return false;
          const local = noteHistory(task, text, { user: get().userName || 'PMO Admin', now: new Date() });
          appendHistory([local]);
          return write(
            `Note on ${id}`,
            () => api.addNote(id, text),
            (r) => appendHistory(r.history, [local.History_ID]),
            () => appendHistory([], [local.History_ID]),
          );
        },

        async createTask(task, note) {
          let created: Task | null = null;
          await write(
            'New task',
            () => api.createTask(task, note),
            (r) => {
              created = r.task;
              replaceTask(r.task);
              appendHistory(r.history);
              if (r.store) replaceStore(r.store);
            },
            () => undefined,
          );
          return created;
        },

        async archiveTask(id) {
          const prev = get().snapshot?.tasks.find((t) => t.Task_ID === id);
          if (!prev) return false;
          replaceTask({ ...prev, Archived: true });
          return write(
            `Archive ${id}`,
            () => api.archiveTask(id, prev.rev),
            (r) => {
              replaceTask(r.task);
              appendHistory(r.history);
              if (r.store) replaceStore(r.store);
            },
            () => replaceTask(prev),
            (err) => {
              const cur = err.body.current as Task | undefined;
              if (cur) replaceTask(cur);
            },
          );
        },

        async updateStore(id, patch) {
          const prev = get().snapshot?.stores.find((s) => s.Store_ID === id);
          if (!prev) return false;
          const local = applyStorePatch(prev, patch, { user: get().userName || 'PMO Admin', now: new Date() });
          replaceStore(local.store);
          return write(
            `Update ${prev.Store_Name}`,
            () => api.updateStore(id, patch, prev.rev),
            (r) => {
              replaceStore(r.store);
              appendHistory(r.history);
            },
            () => replaceStore(prev),
            (err) => {
              const cur = err.body.current as Store | undefined;
              if (cur) replaceStore(cur);
            },
          );
        },

        async createStore(store) {
          let created: Store | null = null;
          await write(
            'New opening',
            () => api.createStore(store),
            (r) => {
              created = r.store;
              replaceStore(r.store);
              appendHistory(r.history);
            },
            () => undefined,
          );
          return created;
        },

        async saveArea(area, isNew) {
          return write(
            `Area ${area.Area_Name}`,
            () => api.saveArea(area, isNew),
            (r) => patchSnap((s) => ({ ...s, areas: (isNew ? [...s.areas, r.area] : s.areas.map((a) => (a.Area_ID === r.area.Area_ID ? r.area : a))).sort((a, b) => a.Order - b.Order) })),
            () => undefined,
          );
        },

        async reorderAreas(order) {
          const prev = get().snapshot?.areas ?? [];
          patchSnap((s) => ({ ...s, areas: order.map((id, i) => ({ ...s.areas.find((a) => a.Area_ID === id)!, Order: (i + 1) * 10 })).filter((a) => a.Area_ID) }));
          return write(
            'Area order',
            () => api.reorderAreas(order),
            (r) => patchSnap((s) => ({ ...s, areas: r.areas })),
            () => patchSnap((s) => ({ ...s, areas: prev })),
          );
        },

        async saveOwner(owner) {
          return write(
            `Owner ${owner.Name}`,
            () => api.saveOwner(owner),
            (r) => patchSnap((s) => ({ ...s, owners: s.owners.some((o) => o.Owner_ID === r.owner.Owner_ID) ? s.owners.map((o) => (o.Owner_ID === r.owner.Owner_ID ? r.owner : o)) : [...s.owners, r.owner] })),
            () => undefined,
          );
        },

        async updateSettings(partial) {
          const prev = get().snapshot?.settings;
          if (!prev) return false;
          patchSnap((s) => ({ ...s, settings: { ...s.settings, ...partial } }));
          return write(
            'Settings',
            () => api.updateSettings(partial),
            (r) => patchSnap((s) => ({ ...s, settings: r.settings })),
            () => patchSnap((s) => ({ ...s, settings: prev })),
          );
        },

        async confirmSal(body) {
          let sal: SalRecord | null = null;
          await write(
            'Confirm minutes',
            () => api.confirmSal(body),
            (r) => {
              sal = r.sal;
              patchSnap((s) => ({ ...s, sals: [...s.sals, r.sal] }));
            },
            () => undefined,
          );
          return sal;
        },

        async retryPending() {
          const ops = [...get().pending];
          if (!ops.length) return;
          set({ sync: 'syncing' });
          for (const op of ops) {
            try {
              await op.run();
              set({ pending: get().pending.filter((p) => p.id !== op.id) });
            } catch (e) {
              const err = e as ApiError;
              if (err instanceof ApiError && !err.isNetwork) {
                set({ pending: get().pending.filter((p) => p.id !== op.id) });
                toast.error(`${op.label} rejected`, err.message);
                await get().load({ force: true });
              } else {
                set({ sync: 'error', syncError: err.message });
                return;
              }
            }
          }
          set({ sync: 'synced', syncError: '', lastSync: new Date().toISOString() });
          toast.success('All changes saved');
        },

        async resetDemo() {
          try {
            const snap = await api.resetDemo();
            set({ snapshot: snap, lastSync: new Date().toISOString(), sync: 'synced' });
            toast.success('Demo data restored');
          } catch (e) {
            toast.error('Reset failed', (e as Error).message);
          }
        },
      };
    },
    {
      name: 'gg-roc-session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ filters: s.filters, presentation: s.presentation, sidebarCollapsed: s.sidebarCollapsed, prefs: s.prefs, userName: s.userName }),
      onRehydrateStorage: () => (state) => {
        if (state?.userName) setApiUser(state.userName);
      },
    },
  ),
);
