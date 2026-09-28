// Pure mutation rules shared by the server repository, the client (optimistic updates) and the seed generator.

import { fmtDate, tsToISODate } from './dates';
import { CORE_STATUS, type HistoryEntry, type Store, type StorePatch, type Task, type TaskPatch } from './types';

let counter = 0;
export function newId(prefix: string, now: Date = new Date()): string {
  counter = (counter + 1) % 1296;
  const rand = Math.floor(Math.random() * 46656).toString(36).padStart(3, '0');
  return `${prefix}-${now.getTime().toString(36)}${counter.toString(36).padStart(2, '0')}${rand}`.toUpperCase();
}

export function nextTaskId(existingIds: Iterable<string>, storeId: string, areaId: string): string {
  const prefix = `${storeId}-${areaId}-`.toUpperCase();
  let max = 0;
  for (const id of existingIds) {
    if (!id.toUpperCase().startsWith(prefix)) continue;
    const n = parseInt(id.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export const TRACKED_TASK_FIELDS: (keyof TaskPatch)[] = [
  'Status', 'Progress_Percentage', 'Due_Date', 'Start_Date', 'Owner', 'Secondary_Owner', 'Risk_Level', 'Priority',
  'Blocker', 'Decision_Required', 'Task_Title', 'Description', 'Area', 'Task_Weight', 'Dependency',
];

export const TRACKED_STORE_FIELDS: (keyof StorePatch)[] = [
  'Opening_Date', 'Opening_Date_Status', 'Risk_Level', 'Overall_Status', 'Project_Manager', 'Store_Name', 'Store_Type',
  'Country', 'City', 'Program_Type',
];

/** Human labels for history fields. */
export const FIELD_LABELS: Record<string, string> = {
  Status: 'Status',
  Progress_Percentage: 'Progress',
  Due_Date: 'Due date',
  Start_Date: 'Start date',
  Owner: 'Owner',
  Secondary_Owner: 'Secondary owner',
  Risk_Level: 'Risk',
  Priority: 'Priority',
  Blocker: 'Blocker',
  Decision_Required: 'Decision required',
  Task_Title: 'Title',
  Description: 'Description',
  Area: 'Area',
  Task_Weight: 'Weight',
  Dependency: 'Dependency',
  Note: 'Note',
  Created: 'Created',
  Archived: 'Archived',
  Opening_Date: 'Opening date',
  Opening_Date_Status: 'Opening date status',
  Overall_Status: 'Store status',
  Project_Manager: 'Project manager',
  Store_Name: 'Store name',
  Store_Type: 'Store type',
  Country: 'Country',
  City: 'City',
  Program_Type: 'Program type',
};

export interface MutationMeta {
  user: string;
  now: Date;
}

function historyRow(task: Pick<Task, 'Task_ID' | 'Store_ID'>, field: string, prev: string, next: string, meta: MutationMeta, note = ''): HistoryEntry {
  return {
    History_ID: newId('H', meta.now),
    Task_ID: task.Task_ID,
    Store_ID: task.Store_ID,
    Timestamp: meta.now.toISOString(),
    Field_Changed: field,
    Previous_Value: prev,
    New_Value: next,
    Note: note,
    Updated_By: meta.user,
  };
}

const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Applies a patch to a task, enforcing the workflow rules, and returns the new task + history rows.
 * Rules: Completed ⇒ progress 100 + Completed_Date; progress 100 ⇒ Completed; progress > 0 on a
 * Not Started task ⇒ In Progress; leaving Completed clears Completed_Date.
 */
export function applyTaskPatch(task: Task, patch: TaskPatch, meta: MutationMeta): { task: Task; history: HistoryEntry[] } {
  const next: Task = { ...task };
  const p: TaskPatch = { ...patch };
  if (p.Progress_Percentage !== undefined) p.Progress_Percentage = Math.max(0, Math.min(100, Math.round(Number(p.Progress_Percentage) || 0)));
  if (p.Task_Weight !== undefined) p.Task_Weight = Number(p.Task_Weight) > 0 ? Number(p.Task_Weight) : 1;

  const targetStatus = p.Status ?? task.Status;
  if (p.Status === CORE_STATUS.completed && p.Progress_Percentage === undefined) p.Progress_Percentage = 100;
  if (p.Progress_Percentage === 100 && p.Status === undefined && targetStatus !== CORE_STATUS.completed && targetStatus !== CORE_STATUS.na) {
    p.Status = CORE_STATUS.completed;
  }
  if (p.Progress_Percentage !== undefined && p.Progress_Percentage > 0 && p.Progress_Percentage < 100 && p.Status === undefined && task.Status === CORE_STATUS.notStarted) {
    p.Status = CORE_STATUS.inProgress;
  }
  if (p.Status && p.Status !== CORE_STATUS.completed && task.Status === CORE_STATUS.completed && p.Progress_Percentage === undefined && task.Progress_Percentage === 100) {
    p.Progress_Percentage = 90;
  }

  const history: HistoryEntry[] = [];
  for (const f of TRACKED_TASK_FIELDS) {
    if (p[f] === undefined) continue;
    const prev = asText(task[f]);
    const val = typeof p[f] === 'string' ? (p[f] as string).trim() : p[f];
    if (asText(val) === prev) continue;
    (next as unknown as Record<string, unknown>)[f] = val;
    history.push(historyRow(task, f, prev, asText(val), meta));
  }
  if (!history.length) return { task, history };

  if (next.Status === CORE_STATUS.completed && task.Status !== CORE_STATUS.completed) next.Completed_Date = tsToISODate(meta.now.toISOString());
  if (next.Status !== CORE_STATUS.completed) next.Completed_Date = '';
  next.Last_Update = meta.now.toISOString();
  next.Last_Updated_By = meta.user;
  next.Version = task.Version + 1;
  return { task: next, history };
}

export function formatNote(text: string, now: Date): string {
  return `[${fmtDate(now.toISOString())}]: ${text.trim()}`;
}

export function noteHistory(task: Pick<Task, 'Task_ID' | 'Store_ID'>, text: string, meta: MutationMeta): HistoryEntry {
  return historyRow(task, 'Note', '', formatNote(text, meta.now), meta, text.trim());
}

export function createdHistory(task: Task, meta: MutationMeta): HistoryEntry {
  return historyRow(task, 'Created', '', task.Task_Title, meta);
}

export function archiveTask(task: Task, meta: MutationMeta, reason = ''): { task: Task; history: HistoryEntry[] } {
  const next: Task = { ...task, Archived: true, Last_Update: meta.now.toISOString(), Last_Updated_By: meta.user, Version: task.Version + 1 };
  return { task: next, history: [historyRow(task, 'Archived', 'FALSE', 'TRUE', meta, reason)] };
}

export function applyStorePatch(store: Store, patch: StorePatch, meta: MutationMeta): { store: Store; history: HistoryEntry[] } {
  const next: Store = { ...store };
  const history: HistoryEntry[] = [];
  for (const f of TRACKED_STORE_FIELDS) {
    if (patch[f] === undefined) continue;
    const prev = asText(store[f]);
    const val = asText(patch[f]).trim();
    if (val === prev) continue;
    (next as unknown as Record<string, unknown>)[f] = val;
    history.push({
      History_ID: newId('H', meta.now),
      Task_ID: '',
      Store_ID: store.Store_ID,
      Timestamp: meta.now.toISOString(),
      Field_Changed: `Store.${f}`,
      Previous_Value: prev,
      New_Value: val,
      Note: '',
      Updated_By: meta.user,
    });
  }
  if (!history.length) return { store, history };
  next.Last_Update = meta.now.toISOString();
  next.Version = store.Version + 1;
  return { store: next, history };
}

export function blankTask(partial: Partial<Task> & Pick<Task, 'Task_ID' | 'Store_ID' | 'Area' | 'Task_Title'>, meta: MutationMeta): Task {
  return {
    Description: '',
    Start_Date: '',
    Due_Date: '',
    Owner: '',
    Secondary_Owner: '',
    Status: CORE_STATUS.notStarted,
    Progress_Percentage: 0,
    Risk_Level: 'Low',
    Priority: 'Medium',
    Task_Weight: 1,
    Dependency: '',
    Blocker: '',
    Decision_Required: '',
    Last_Update: meta.now.toISOString(),
    Last_Updated_By: meta.user,
    Version: 1,
    Created_At: meta.now.toISOString(),
    Completed_Date: '',
    Archived: false,
    rev: '',
    ...partial,
  };
}
