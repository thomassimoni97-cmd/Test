// Change Detection Engine — deterministic, pure. Current state + TASK_HISTORY + previous SAL baseline → StructuredMinutes.

import { addDaysISO, daysBetween, tsToISODate } from '../dates';
import { areaStats, countTasks, delayDays, isClosed, isCompleted, isNA, isOpen, isOverdue, needsDecision, isBlocked, progressOf, daysToOpening } from '../metrics';
import { flagOn, flagText } from '../schema';
import { CORE_STATUS, type Area, type HistoryEntry, type ISODate, type SalRecord, type SalSnapshot, type Settings, type Store, type Task, type TaskSnap } from '../types';
import { SIGNAL_RANK, type Baseline, type FieldChange, type MinutesArea, type MinutesItem, type Signal, type StructuredMinutes } from './types';

const SNAP_FIELD: Record<keyof TaskSnap, keyof Task> = {
  t: 'Task_Title',
  a: 'Area',
  s: 'Status',
  p: 'Progress_Percentage',
  d: 'Due_Date',
  o: 'Owner',
  r: 'Risk_Level',
  pr: 'Priority',
  b: 'Blocker',
  dr: 'Decision_Required',
};

export function snapOf(t: Task): TaskSnap {
  return { t: t.Task_Title, a: t.Area, s: t.Status, p: t.Progress_Percentage, d: t.Due_Date, o: t.Owner, r: t.Risk_Level, pr: t.Priority, b: t.Blocker, dr: t.Decision_Required };
}

const MAX_SNAPSHOT_CHARS = 45000; // Google Sheets cell limit is 50k

export function buildSalSnapshot(store: Store, allTasks: Task[], areas: Area[], settings: Settings, today: ISODate): SalSnapshot {
  const tasks = allTasks.filter((t) => t.Store_ID === store.Store_ID && !t.Archived);
  const c = countTasks(tasks, today, settings.Due_Soon_Days);
  const snap: SalSnapshot = {
    kpis: {
      progress: progressOf(tasks, settings.Progress_Method),
      daysToOpening: daysToOpening(store, today),
      open: c.open,
      completed: c.completed,
      blocked: c.blocked,
      overdue: c.overdue,
      dueSoon: c.dueSoon,
      decisions: c.decisions,
    },
    store: { Opening_Date: store.Opening_Date, Opening_Date_Status: store.Opening_Date_Status, Risk_Level: store.Risk_Level, Overall_Status: store.Overall_Status },
    areas: areaStats(tasks, areas, settings, today).map((a) => ({
      id: a.area.Area_ID,
      name: a.area.Area_Name,
      progress: a.progress,
      status: a.status,
      tasks: a.counts.total,
      overdue: a.counts.overdue,
      blocked: a.counts.blocked,
    })),
    tasks: Object.fromEntries(tasks.map((t) => [t.Task_ID, snapOf(t)])),
  };
  if (JSON.stringify(snap).length > MAX_SNAPSHOT_CHARS) delete snap.tasks; // falls back to history-based detection
  return snap;
}

export function parseSnapshot(json: string): SalSnapshot | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as SalSnapshot;
    return s && typeof s === 'object' && s.kpis ? s : null;
  } catch {
    return null;
  }
}

export function confirmedSals(sals: SalRecord[], storeId: string): SalRecord[] {
  return sals
    .filter((s) => s.Store_ID === storeId && s.Confirmed && s.Confirmation_Timestamp)
    .sort((a, b) => a.Confirmation_Timestamp.localeCompare(b.Confirmation_Timestamp));
}

/** Baseline = last confirmed SAL of the store. Null when this is the first SAL. */
export function resolveBaseline(sals: SalRecord[], storeId: string): Baseline | null {
  const list = confirmedSals(sals, storeId);
  const last = list[list.length - 1];
  if (!last) return null;
  return {
    mode: 'diff',
    timestamp: last.Confirmation_Timestamp,
    snapshot: parseSnapshot(last.Snapshot_JSON),
    previousSalDate: last.SAL_Date,
    previousSalId: last.SAL_ID,
    isFirst: false,
  };
}

export function firstSalBaseline(opts: { startDate?: ISODate }): Baseline {
  if (opts.startDate) {
    return { mode: 'diff', timestamp: new Date(`${opts.startDate}T00:00:00`).toISOString(), snapshot: null, previousSalDate: opts.startDate, previousSalId: '', isFirst: true };
  }
  return { mode: 'recap', timestamp: '', snapshot: null, previousSalDate: '', previousSalId: '', isFirst: true };
}

function fieldVal(t: Task, f: keyof Task): string {
  const v = t[f];
  return v === null || v === undefined ? '' : String(v);
}

/** Folds history entries (ordered) into net per-field changes: first previous → last new. */
function foldHistory(entries: HistoryEntry[]): Map<string, FieldChange> {
  const map = new Map<string, FieldChange>();
  for (const h of entries) {
    if (h.Field_Changed === 'Note' || h.Field_Changed === 'Created') continue;
    const cur = map.get(h.Field_Changed);
    if (cur) cur.to = h.New_Value;
    else map.set(h.Field_Changed, { field: h.Field_Changed, from: h.Previous_Value, to: h.New_Value });
  }
  for (const [k, v] of map) if (v.from === v.to) map.delete(k);
  return map;
}

export interface DetectInput {
  store: Store;
  tasks: Task[];
  history: HistoryEntry[];
  areas: Area[];
  settings: Settings;
  baseline: Baseline;
  now: Date;
  today: ISODate;
  salDate?: ISODate;
}

export function detectChanges(input: DetectInput): StructuredMinutes {
  const { store, baseline, settings, today, now } = input;
  const nowIso = now.toISOString();
  const storeTasks = input.tasks.filter((t) => t.Store_ID === store.Store_ID);
  const liveTasks = storeTasks.filter((t) => !t.Archived);
  const since = baseline.mode === 'diff' ? baseline.timestamp : '';
  const baselineDate = since ? tsToISODate(since) : '';

  const storeHistory = input.history.filter((h) => h.Store_ID === store.Store_ID && (!since || h.Timestamp > since) && h.Timestamp <= nowIso);
  const histByTask = new Map<string, HistoryEntry[]>();
  for (const h of storeHistory) {
    if (!h.Task_ID) continue;
    const l = histByTask.get(h.Task_ID) ?? [];
    l.push(h);
    histByTask.set(h.Task_ID, l);
  }

  const items: MinutesItem[] = [];
  for (const task of storeTasks) {
    const hist = histByTask.get(task.Task_ID) ?? [];
    const notes = hist.filter((h) => h.Field_Changed === 'Note').map((h) => ({ timestamp: h.Timestamp, text: h.Note || h.New_Value.replace(/^\[[^\]]*\]:\s*/, ''), by: h.Updated_By }));

    if (baseline.mode === 'recap') {
      if (task.Archived || isNA(task)) continue;
      const signals: Signal[] = [];
      if (isBlocked(task)) signals.push('newBlocker');
      if (isOverdue(task, today)) signals.push('overdue');
      if (needsDecision(task)) signals.push('newDecision');
      signals.push('recap');
      items.push(makeItem(task, signals, [], notes, today));
      continue;
    }

    let changes: FieldChange[] = [];
    let created = hist.some((h) => h.Field_Changed === 'Created') || (!!task.Created_At && task.Created_At > since);
    const snapTask = baseline.snapshot?.tasks?.[task.Task_ID];
    if (baseline.snapshot?.tasks && snapTask) {
      created = false;
      for (const k of Object.keys(SNAP_FIELD) as (keyof TaskSnap)[]) {
        const f = SNAP_FIELD[k];
        const from = String(snapTask[k] ?? '');
        const to = fieldVal(task, f);
        if (from !== to) changes.push({ field: f, from, to });
      }
    } else if (baseline.snapshot?.tasks && !snapTask && !created) {
      // existed before but not captured (e.g. restored from archive) → use history
      changes = [...foldHistory(hist).values()];
    } else {
      changes = [...foldHistory(hist).values()];
    }
    const archivedChange = changes.find((c) => c.field === 'Archived');
    if (task.Archived && !archivedChange) continue; // archived before baseline
    changes = changes.filter((c) => !['Task_Weight', 'Dependency'].includes(c.field));

    const signals: Signal[] = [];
    const ch = (f: string) => changes.find((c) => c.field === f);
    if (created) signals.push('created');
    if (archivedChange && task.Archived) signals.push('archived');

    const st = ch('Status');
    const becameBlocked = !!st && st.to === CORE_STATUS.blocked && st.from !== CORE_STATUS.blocked;
    const bl = ch('Blocker');
    const blockerAdded = (!!bl && !flagOn(bl.from) && flagOn(bl.to)) || (created && flagOn(task.Blocker));
    const blockerRemoved = !!bl && flagOn(bl.from) && !flagOn(bl.to);
    if ((becameBlocked || blockerAdded) && !isClosed(task)) signals.push('newBlocker');
    const unblocked = !!st && st.from === CORE_STATUS.blocked && st.to !== CORE_STATUS.blocked;
    if ((blockerRemoved || unblocked) && !signals.includes('newBlocker')) signals.push('resolvedBlocker');

    const dr = ch('Decision_Required');
    if (((dr && !flagOn(dr.from) && flagOn(dr.to)) || (created && flagOn(task.Decision_Required))) && !isClosed(task)) signals.push('newDecision');
    if (dr && flagOn(dr.from) && !flagOn(dr.to)) signals.push('resolvedDecision');

    const overdueNow = isOverdue(task, today);
    const newlyOverdue = overdueNow && !!baselineDate && task.Due_Date >= baselineDate;
    if (newlyOverdue) signals.push('overdue');

    if (ch('Due_Date')) signals.push('deadline');
    if (st && st.to === CORE_STATUS.completed) signals.push('completed');
    else if (st && !becameBlocked) signals.push('status');
    if (ch('Owner')) signals.push('owner');
    if (ch('Risk_Level')) signals.push('risk');
    if (ch('Priority')) signals.push('priority');
    if (ch('Progress_Percentage') && !(st && st.to === CORE_STATUS.completed)) signals.push('progress');
    if (notes.length) signals.push('note');
    // edits limited to title/description/area/secondary owner/start date are not minutes material on their own
    if (!signals.length) continue;
    items.push(makeItem(task, signals, changes, notes, today));
  }

  // group by area in configured order
  const areaById = new Map(input.areas.map((a) => [a.Area_ID, a]));
  const byArea = new Map<string, MinutesItem[]>();
  for (const it of items) {
    const l = byArea.get(it.task.Area) ?? [];
    l.push(it);
    byArea.set(it.task.Area, l);
  }
  const areas: MinutesArea[] = [];
  const orderedAreaIds = [...input.areas].sort((a, b) => a.Order - b.Order).map((a) => a.Area_ID);
  for (const id of [...orderedAreaIds, ...[...byArea.keys()].filter((k) => !areaById.has(k))]) {
    const list = byArea.get(id);
    if (!list?.length) continue;
    const area = areaById.get(id) ?? { Area_ID: id, Area_Name: id || 'Other', Group: '', Order: 9999, Active: true, rev: '' };
    list.sort((a, b) => a.rank - b.rank || (a.task.Due_Date || '9999').localeCompare(b.task.Due_Date || '9999') || a.task.Task_ID.localeCompare(b.task.Task_ID));
    areas.push({ area, group: area.Group || area.Area_Name, items: list });
  }

  // store-level changes
  const storeChanges: FieldChange[] = [];
  if (baseline.mode === 'diff') {
    const snapStore = baseline.snapshot?.store;
    if (snapStore) {
      for (const f of ['Opening_Date', 'Opening_Date_Status', 'Risk_Level', 'Overall_Status'] as const) {
        const from = String(snapStore[f] ?? '');
        const to = String(store[f] ?? '');
        if (from !== to) storeChanges.push({ field: f, from, to });
      }
    } else {
      const folded = foldHistory(storeHistory.filter((h) => !h.Task_ID && h.Field_Changed.startsWith('Store.')).map((h) => ({ ...h, Field_Changed: h.Field_Changed.slice(6) })));
      for (const f of ['Opening_Date', 'Opening_Date_Status', 'Risk_Level', 'Overall_Status', 'Project_Manager']) {
        const c = folded.get(f);
        if (c) storeChanges.push(c);
      }
    }
  }

  const horizon = addDaysISO(today, settings.Next_Steps_Horizon_Days);
  const open = liveTasks.filter(isOpen);
  const nextSteps = open
    .filter((t) => t.Due_Date && t.Due_Date <= horizon)
    .sort((a, b) => a.Due_Date.localeCompare(b.Due_Date))
    .slice(0, 30)
    .map((task) => ({ task, overdueDays: delayDays(task, today) }));

  const c = countTasks(liveTasks, today, settings.Due_Soon_Days);
  return {
    store,
    salDate: input.salDate || today,
    generatedAt: nowIso,
    baseline,
    kpis: {
      progress: progressOf(liveTasks, settings.Progress_Method),
      daysToOpening: store.Opening_Date ? daysBetween(today, store.Opening_Date) : null,
      open: c.open,
      completed: c.completed,
      blocked: c.blocked,
      overdue: c.overdue,
      dueSoon: c.dueSoon,
      decisions: c.decisions,
    },
    storeChanges,
    areas,
    nextSteps,
    blockers: open.filter(isBlocked),
    decisions: open.filter(needsDecision),
    counts: {
      changedTasks: items.filter((i) => !i.signals.includes('recap')).length,
      notes: items.reduce((s, i) => s + i.notes.length, 0),
      completed: items.filter((i) => i.signals.includes('completed') && isCompleted(i.task)).length,
      newBlockers: items.filter((i) => i.signals.includes('newBlocker')).length,
      created: items.filter((i) => i.signals.includes('created')).length,
    },
  };
}

function makeItem(task: Task, signals: Signal[], changes: FieldChange[], notes: MinutesItem['notes'], today: ISODate): MinutesItem {
  return {
    task,
    signals,
    rank: Math.min(...signals.map((s) => SIGNAL_RANK[s])),
    changes,
    notes,
    overdueDays: delayDays(task, today),
    blockerText: flagText(task.Blocker),
    decisionText: flagText(task.Decision_Required),
  };
}
