// Derived values. Nothing here is ever stored as truth.

import { addDaysISO, daysBetween } from './dates';
import { flagOn } from './schema';
import { CORE_STATUS, type Area, type ISODate, type ProgressMethod, type RiskLevel, type Settings, type Store, type Task } from './types';

export const isCompleted = (t: Pick<Task, 'Status'>) => t.Status === CORE_STATUS.completed;
export const isNA = (t: Pick<Task, 'Status'>) => t.Status === CORE_STATUS.na;
export const isClosed = (t: Pick<Task, 'Status'>) => isCompleted(t) || isNA(t);
export const isOpen = (t: Pick<Task, 'Status'>) => !isClosed(t);
export const hasBlocker = (t: Pick<Task, 'Blocker'>) => flagOn(t.Blocker);
export const isBlocked = (t: Pick<Task, 'Status' | 'Blocker'>) => !isClosed(t) && (t.Status === CORE_STATUS.blocked || hasBlocker(t));
export const needsDecision = (t: Pick<Task, 'Status' | 'Decision_Required'>) => !isClosed(t) && flagOn(t.Decision_Required);

export function isOverdue(t: Pick<Task, 'Status' | 'Due_Date'>, today: ISODate): boolean {
  return !!t.Due_Date && t.Due_Date < today && !isClosed(t);
}

/** Days late for open tasks (null when not overdue). */
export function delayDays(t: Pick<Task, 'Status' | 'Due_Date'>, today: ISODate): number | null {
  return isOverdue(t, today) ? daysBetween(t.Due_Date, today) : null;
}

/** For completed tasks: days completed after due date (null when on time / unknown). */
export function lateCompletionDays(t: Pick<Task, 'Status' | 'Due_Date' | 'Completed_Date'>): number | null {
  if (!isCompleted(t) || !t.Due_Date || !t.Completed_Date) return null;
  const d = daysBetween(t.Due_Date, t.Completed_Date);
  return d > 0 ? d : null;
}

export function isDueSoon(t: Pick<Task, 'Status' | 'Due_Date'>, today: ISODate, days: number): boolean {
  if (!t.Due_Date || isClosed(t)) return false;
  return t.Due_Date >= today && t.Due_Date <= addDaysISO(today, days);
}

export function daysToOpening(store: Pick<Store, 'Opening_Date'>, today: ISODate): number | null {
  return store.Opening_Date ? daysBetween(today, store.Opening_Date) : null;
}

/** Tasks that count towards progress: not archived, not N/A. On Hold is NOT treated as complete. */
export function applicable(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.Archived && !isNA(t));
}

export function taskProgress(t: Task): number {
  return isCompleted(t) ? 100 : Math.max(0, Math.min(100, t.Progress_Percentage || 0));
}

export function progressOf(tasks: Task[], method: ProgressMethod): number {
  const list = applicable(tasks);
  if (!list.length) return 0;
  if (method === 'weighted') {
    const wSum = list.reduce((s, t) => s + (t.Task_Weight > 0 ? t.Task_Weight : 1), 0);
    const pSum = list.reduce((s, t) => s + taskProgress(t) * (t.Task_Weight > 0 ? t.Task_Weight : 1), 0);
    return wSum ? Math.round(pSum / wSum) : 0;
  }
  return Math.round(list.reduce((s, t) => s + taskProgress(t), 0) / list.length);
}

const RISK_RANK: Record<RiskLevel, number> = { Low: 1, Medium: 2, High: 3 };
export const riskRank = (r: RiskLevel | string) => RISK_RANK[r as RiskLevel] ?? 0;
export function maxRisk(levels: RiskLevel[]): RiskLevel | null {
  let best: RiskLevel | null = null;
  for (const l of levels) if (!best || riskRank(l) > riskRank(best)) best = l;
  return best;
}

export interface TaskCounts {
  total: number;
  applicable: number;
  open: number;
  completed: number;
  blocked: number;
  overdue: number;
  dueSoon: number;
  decisions: number;
  highRisk: number;
  onHold: number;
  notStarted: number;
}

export function countTasks(tasks: Task[], today: ISODate, dueSoonDays: number): TaskCounts {
  const c: TaskCounts = { total: 0, applicable: 0, open: 0, completed: 0, blocked: 0, overdue: 0, dueSoon: 0, decisions: 0, highRisk: 0, onHold: 0, notStarted: 0 };
  for (const t of tasks) {
    if (t.Archived) continue;
    c.total++;
    if (!isNA(t)) c.applicable++;
    if (isCompleted(t)) c.completed++;
    if (isOpen(t)) c.open++;
    if (isBlocked(t)) c.blocked++;
    if (isOverdue(t, today)) c.overdue++;
    if (isDueSoon(t, today, dueSoonDays)) c.dueSoon++;
    if (needsDecision(t)) c.decisions++;
    if (isOpen(t) && t.Risk_Level === 'High') c.highRisk++;
    if (t.Status === CORE_STATUS.onHold) c.onHold++;
    if (t.Status === CORE_STATUS.notStarted) c.notStarted++;
  }
  return c;
}

/** Aggregated status of a set of tasks (area / store), always with a text label. */
export function aggregateStatus(tasks: Task[]): string {
  const list = applicable(tasks);
  if (!list.length) return CORE_STATUS.na;
  if (list.every(isCompleted)) return CORE_STATUS.completed;
  if (list.some((t) => isBlocked(t))) return CORE_STATUS.blocked;
  if (list.every((t) => t.Status === CORE_STATUS.notStarted)) return CORE_STATUS.notStarted;
  if (list.every((t) => t.Status === CORE_STATUS.onHold || isCompleted(t)) && list.some((t) => t.Status === CORE_STATUS.onHold)) return CORE_STATUS.onHold;
  return CORE_STATUS.inProgress;
}

export interface AreaStat {
  area: Area;
  tasks: Task[];
  progress: number;
  status: string;
  counts: TaskCounts;
  risk: RiskLevel | null;
}

export function areaStats(tasks: Task[], areas: Area[], settings: Settings, today: ISODate, opts: { includeEmpty?: boolean } = {}): AreaStat[] {
  const byArea = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.Archived) continue;
    const list = byArea.get(t.Area) ?? [];
    list.push(t);
    byArea.set(t.Area, list);
  }
  const known = new Set(areas.map((a) => a.Area_ID));
  const orphan: Area[] = [...byArea.keys()].filter((k) => !known.has(k)).map((k, i) => ({ Area_ID: k, Area_Name: k || '(no area)', Group: '', Order: 9000 + i, Active: true, rev: '' }));
  return [...areas, ...orphan]
    .filter((a) => (opts.includeEmpty ? a.Active : true))
    .map((area) => {
      const list = byArea.get(area.Area_ID) ?? [];
      return {
        area,
        tasks: list,
        progress: progressOf(list, settings.Progress_Method),
        status: aggregateStatus(list),
        counts: countTasks(list, today, settings.Due_Soon_Days),
        risk: maxRisk(list.filter(isOpen).map((t) => t.Risk_Level)),
      };
    })
    .filter((s) => opts.includeEmpty || s.tasks.length > 0);
}

export interface StoreStat {
  store: Store;
  tasks: Task[];
  progress: number;
  counts: TaskCounts;
  daysToOpening: number | null;
  programStart: ISODate;
}

export function storeStats(store: Store, allTasks: Task[], settings: Settings, today: ISODate): StoreStat {
  const tasks = allTasks.filter((t) => t.Store_ID === store.Store_ID && !t.Archived);
  const starts = tasks.map((t) => t.Start_Date || t.Due_Date).filter(Boolean).sort();
  return {
    store,
    tasks,
    progress: progressOf(tasks, settings.Progress_Method),
    counts: countTasks(tasks, today, settings.Due_Soon_Days),
    daysToOpening: daysToOpening(store, today),
    programStart: starts[0] ?? '',
  };
}

export function isAirport(store: Pick<Store, 'Store_Type' | 'Store_Name'>): boolean {
  return /airport/i.test(store.Store_Type) || /airport/i.test(store.Store_Name);
}

export function isOpeningDone(store: Pick<Store, 'Overall_Status'>): boolean {
  return /^(opened|completed|closed)$/i.test(store.Overall_Status);
}
