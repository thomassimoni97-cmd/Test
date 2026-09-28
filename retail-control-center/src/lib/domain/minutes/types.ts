import type { Area, ISODate, ISOTimestamp, SalSnapshot, Store, Task } from '../types';

/** Where the comparison starts. */
export interface Baseline {
  /** 'diff' = compare with previous SAL / start date; 'recap' = first SAL current-state recap */
  mode: 'diff' | 'recap';
  /** changes strictly after this timestamp are considered ('' in recap mode) */
  timestamp: ISOTimestamp;
  /** task-level snapshot captured at the previous SAL confirmation (if any) */
  snapshot: SalSnapshot | null;
  previousSalDate: ISODate;
  previousSalId: string;
  isFirst: boolean;
}

export type Signal =
  | 'newBlocker'
  | 'overdue'
  | 'newDecision'
  | 'deadline'
  | 'status'
  | 'owner'
  | 'risk'
  | 'priority'
  | 'resolvedBlocker'
  | 'resolvedDecision'
  | 'archived'
  | 'completed'
  | 'note'
  | 'progress'
  | 'created'
  | 'recap';

/** Priority order required by the PMO (lower = more important). */
export const SIGNAL_RANK: Record<Signal, number> = {
  newBlocker: 1,
  overdue: 2,
  newDecision: 3,
  deadline: 4,
  status: 5,
  owner: 5,
  risk: 5,
  priority: 5,
  resolvedBlocker: 5,
  resolvedDecision: 5,
  archived: 5,
  completed: 6,
  note: 7,
  progress: 8,
  created: 9,
  recap: 10,
};

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface MinutesNote {
  timestamp: ISOTimestamp;
  text: string;
  by: string;
}

export interface MinutesItem {
  task: Task;
  signals: Signal[];
  rank: number;
  changes: FieldChange[];
  notes: MinutesNote[];
  overdueDays: number | null;
  blockerText: string;
  decisionText: string;
}

export interface MinutesArea {
  area: Area;
  group: string;
  items: MinutesItem[];
}

/** Structured, template-independent output of the change detection engine. */
export interface StructuredMinutes {
  store: Store;
  salDate: ISODate;
  generatedAt: ISOTimestamp;
  baseline: Baseline;
  kpis: SalSnapshot['kpis'];
  storeChanges: FieldChange[];
  areas: MinutesArea[];
  nextSteps: { task: Task; overdueDays: number | null }[];
  blockers: Task[];
  decisions: Task[];
  counts: { changedTasks: number; notes: number; completed: number; newBlockers: number; created: number };
}

// ───────────── editable document (what the user edits, confirms and copies) ─────────────

export interface MinutesBullet {
  id: string;
  text: string;
  taskId?: string;
}

export interface MinutesGroup {
  id: string;
  subtitle: string;
  bullets: MinutesBullet[];
}

export interface MinutesSection {
  id: string;
  kind: 'store' | 'area' | 'next' | 'blockers' | 'custom';
  title: string;
  numbered: boolean;
  groups: MinutesGroup[];
}

export interface MinutesDoc {
  title: string;
  headerLines: string[];
  sections: MinutesSection[];
  comments: string;
  templateId: string;
}

export interface MinutesTemplate {
  id: string;
  label: string;
  description: string;
  build: (data: StructuredMinutes) => MinutesDoc;
}
