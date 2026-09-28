// Core domain types. Pure data — shared by server, client and scripts.

/** ISO calendar date `YYYY-MM-DD`, or '' when not set. */
export type ISODate = string;
/** ISO timestamp (UTC), or '' when not set. */
export type ISOTimestamp = string;

export type RiskLevel = 'Low' | 'Medium' | 'High';
export type Priority = 'Low' | 'Medium' | 'High';
export type OpeningDateStatus = 'Confirmed' | 'Tentative' | 'TBD';
export type ProgramType = 'New Company' | 'New Store';

/** Status names are configurable; these are the core ones the rules depend on. */
export const CORE_STATUS = {
  notStarted: 'Not Started',
  inProgress: 'In Progress',
  onHold: 'On Hold',
  blocked: 'Blocked',
  completed: 'Completed',
  na: 'N/A',
} as const;

export type StatusTone = 'grey' | 'blue' | 'amber' | 'red' | 'green' | 'neutral' | 'violet' | 'teal';

export interface StatusDef {
  name: string;
  tone: StatusTone;
  active: boolean;
  core: boolean;
}

export interface Store {
  Store_ID: string;
  Store_Name: string;
  Country: string;
  City: string;
  Store_Type: string;
  Opening_Date: ISODate;
  Opening_Date_Status: OpeningDateStatus;
  Program_Type: ProgramType;
  Overall_Status: string;
  Overall_Progress: number;
  Risk_Level: RiskLevel;
  Project_Manager: string;
  Last_Update: ISOTimestamp;
  Version: number;
  /** server fingerprint of the row as loaded (optimistic concurrency) */
  rev: string;
}

export interface Task {
  Task_ID: string;
  Store_ID: string;
  Area: string; // Area_ID
  Task_Title: string;
  Description: string;
  Start_Date: ISODate;
  Due_Date: ISODate;
  Owner: string;
  Secondary_Owner: string;
  Status: string;
  Progress_Percentage: number;
  Risk_Level: RiskLevel;
  Priority: Priority;
  Task_Weight: number;
  Dependency: string;
  /** free text; non-empty (and not a "false" token) means the task has a blocker */
  Blocker: string;
  /** free text; non-empty (and not a "false" token) means a decision is required */
  Decision_Required: string;
  Last_Update: ISOTimestamp;
  Last_Updated_By: string;
  Version: number;
  /** extensions (documented in DATA_MODEL.md) */
  Created_At: ISOTimestamp;
  Completed_Date: ISODate;
  Archived: boolean;
  rev: string;
}

export interface HistoryEntry {
  History_ID: string;
  Task_ID: string; // '' for store-level changes
  Store_ID: string;
  Timestamp: ISOTimestamp;
  Field_Changed: string;
  Previous_Value: string;
  New_Value: string;
  Note: string;
  Updated_By: string;
}

export interface Area {
  Area_ID: string;
  Area_Name: string;
  Group: string;
  Order: number;
  Active: boolean;
  rev: string;
}

export interface Owner {
  Owner_ID: string;
  Name: string;
  Email: string;
  Function: string;
  Active: boolean;
  rev: string;
}

export interface SalRecord {
  SAL_ID: string;
  Store_ID: string;
  SAL_Date: ISODate;
  Previous_SAL_Date: ISODate;
  Baseline_Timestamp: ISOTimestamp;
  Generation_Timestamp: ISOTimestamp;
  Confirmation_Timestamp: ISOTimestamp;
  Generated_Minutes: string;
  Final_Minutes: string;
  Confirmed: boolean;
  Created_By: string;
  /** extensions */
  Minutes_JSON: string;
  Snapshot_JSON: string;
}

export type ProgressMethod = 'simple' | 'weighted';

export interface Settings {
  Program_Name: string;
  Program_Year: string;
  Progress_Method: ProgressMethod;
  Due_Soon_Days: number;
  Statuses: StatusDef[];
  Risk_Guidance: Record<RiskLevel, string>;
  Next_Steps_Horizon_Days: number;
  Refresh_Interval_Seconds: number;
  Minutes_Template: string;
}

export interface DataIssue {
  table: string;
  rowKey: string;
  field?: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface Snapshot {
  stores: Store[];
  tasks: Task[];
  history: HistoryEntry[];
  areas: Area[];
  owners: Owner[];
  sals: SalRecord[];
  settings: Settings;
  issues: DataIssue[];
  meta: {
    source: 'sheets' | 'local' | 'browser';
    fetchedAt: ISOTimestamp;
    etag: string;
  };
}

/** Editable task fields (everything except identity + system fields). */
export type TaskPatch = Partial<
  Pick<
    Task,
    | 'Area'
    | 'Task_Title'
    | 'Description'
    | 'Start_Date'
    | 'Due_Date'
    | 'Owner'
    | 'Secondary_Owner'
    | 'Status'
    | 'Progress_Percentage'
    | 'Risk_Level'
    | 'Priority'
    | 'Task_Weight'
    | 'Dependency'
    | 'Blocker'
    | 'Decision_Required'
  >
>;

export type StorePatch = Partial<
  Pick<
    Store,
    | 'Store_Name'
    | 'Country'
    | 'City'
    | 'Store_Type'
    | 'Opening_Date'
    | 'Opening_Date_Status'
    | 'Program_Type'
    | 'Overall_Status'
    | 'Risk_Level'
    | 'Project_Manager'
  >
>;

/** Compact per-task state stored in SAL snapshots (baseline for the next SAL). */
export interface TaskSnap {
  t: string; // title
  a: string; // area
  s: string; // status
  p: number; // progress
  d: ISODate; // due
  o: string; // owner
  r: RiskLevel;
  pr: Priority;
  b: string; // blocker
  dr: string; // decision required
}

export interface SalSnapshot {
  kpis: {
    progress: number;
    daysToOpening: number | null;
    open: number;
    completed: number;
    blocked: number;
    overdue: number;
    dueSoon: number;
    decisions: number;
  };
  store: { Opening_Date: ISODate; Opening_Date_Status: string; Risk_Level: string; Overall_Status: string };
  areas: { id: string; name: string; progress: number; status: string; tasks: number; overdue: number; blocked: number }[];
  tasks?: Record<string, TaskSnap>;
}
