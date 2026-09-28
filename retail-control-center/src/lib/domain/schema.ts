// Sheet structure + tolerant parsing/serialization/validation.
// Adapters deal in RawRow (header → cell). This module turns raw rows into typed entities and back.

import { parseLooseDate } from './dates';
import {
  CORE_STATUS,
  type Area,
  type DataIssue,
  type HistoryEntry,
  type OpeningDateStatus,
  type Owner,
  type Priority,
  type ProgramType,
  type RiskLevel,
  type SalRecord,
  type Settings,
  type StatusDef,
  type StatusTone,
  type Store,
  type Task,
} from './types';

export type CellValue = string | number | boolean | null;
export type RawRow = Record<string, CellValue>;
export type TableName = 'STORES' | 'TASKS' | 'TASK_HISTORY' | 'AREAS' | 'OWNERS' | 'SAL_HISTORY' | 'SETTINGS';
export type RawTables = Record<TableName, RawRow[]>;

export const TABLES: Record<TableName, { key: string; headers: string[] }> = {
  STORES: {
    key: 'Store_ID',
    headers: [
      'Store_ID', 'Store_Name', 'Country', 'City', 'Store_Type', 'Opening_Date', 'Opening_Date_Status',
      'Program_Type', 'Overall_Status', 'Overall_Progress', 'Risk_Level', 'Project_Manager', 'Last_Update', 'Version',
    ],
  },
  TASKS: {
    key: 'Task_ID',
    headers: [
      'Task_ID', 'Store_ID', 'Area', 'Task_Title', 'Description', 'Start_Date', 'Due_Date', 'Owner', 'Secondary_Owner',
      'Status', 'Progress_Percentage', 'Risk_Level', 'Priority', 'Task_Weight', 'Dependency', 'Blocker',
      'Decision_Required', 'Last_Update', 'Last_Updated_By', 'Version', 'Created_At', 'Completed_Date', 'Archived',
    ],
  },
  TASK_HISTORY: {
    key: 'History_ID',
    headers: ['History_ID', 'Task_ID', 'Store_ID', 'Timestamp', 'Field_Changed', 'Previous_Value', 'New_Value', 'Note', 'Updated_By'],
  },
  AREAS: { key: 'Area_ID', headers: ['Area_ID', 'Area_Name', 'Group', 'Order', 'Active'] },
  OWNERS: { key: 'Owner_ID', headers: ['Owner_ID', 'Name', 'Email', 'Function', 'Active'] },
  SAL_HISTORY: {
    key: 'SAL_ID',
    headers: [
      'SAL_ID', 'Store_ID', 'SAL_Date', 'Previous_SAL_Date', 'Baseline_Timestamp', 'Generation_Timestamp',
      'Confirmation_Timestamp', 'Generated_Minutes', 'Final_Minutes', 'Confirmed', 'Created_By', 'Minutes_JSON', 'Snapshot_JSON',
    ],
  },
  SETTINGS: { key: 'Setting_Key', headers: ['Setting_Key', 'Setting_Value', 'Description'] },
};

export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

// ───────────────────────────── primitive coercion ─────────────────────────────

export function str(v: CellValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v).trim();
}

const FALSE_TOKENS = new Set(['', 'false', 'no', 'n', '0', 'none', '-', 'n/a', 'na', 'nessuno', 'no.']);
const TRUE_TOKENS = new Set(['true', 'yes', 'y', '1', 'x', 'si', 'sì', '✓', 'ok']);

export function bool(v: CellValue | undefined, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = str(v).toLowerCase();
  if (!s) return fallback;
  if (TRUE_TOKENS.has(s)) return true;
  if (FALSE_TOKENS.has(s)) return false;
  return fallback;
}

/** Free-text flags (Blocker / Decision_Required): any meaningful text means "yes". */
export function flagOn(v: string | undefined | null): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return !FALSE_TOKENS.has(s);
}

/** Human description of a free-text flag ('' when the flag is only a TRUE token). */
export function flagText(v: string | undefined | null): string {
  if (!flagOn(v)) return '';
  const s = (v ?? '').trim();
  return TRUE_TOKENS.has(s.toLowerCase()) ? '' : s;
}

export function num(v: CellValue | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim().replace('%', '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Progress: accepts 68, "68%", 0.68 (a percent-formatted cell). */
export function parseProgress(v: CellValue | undefined): { value: number; ok: boolean } {
  const n = num(v);
  if (n === null) return { value: 0, ok: str(v) === '' };
  let p = n;
  if (typeof v === 'number' && p > 0 && p < 1) p = p * 100;
  if (p < 0 || p > 100) return { value: Math.max(0, Math.min(100, Math.round(p))), ok: false };
  return { value: Math.round(p), ok: true };
}

// FNV-1a — tiny, isomorphic fingerprint used for optimistic concurrency.
export function fingerprint(values: unknown): string {
  const s = JSON.stringify(values);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function rowRev(row: RawRow, headers: string[]): string {
  return fingerprint(headers.map((h) => str(row[h])));
}

function normalizeEnum<T extends string>(v: string, allowed: readonly T[]): T | null {
  const s = v.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === s) ?? null;
}

export const RISK_LEVELS: RiskLevel[] = ['Low', 'Medium', 'High'];
export const PRIORITIES: Priority[] = ['Low', 'Medium', 'High'];
export const OPENING_DATE_STATUSES: OpeningDateStatus[] = ['Confirmed', 'Tentative', 'TBD'];
export const PROGRAM_TYPES: ProgramType[] = ['New Company', 'New Store'];
export const STORE_TYPES = ['Standard Store', 'Airport Store', 'Company Opening'];
export const STORE_OVERALL_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Opened', 'Cancelled'];

// ───────────────────────────── settings ─────────────────────────────

export const DEFAULT_STATUSES: StatusDef[] = [
  { name: CORE_STATUS.notStarted, tone: 'grey', active: true, core: true },
  { name: CORE_STATUS.inProgress, tone: 'blue', active: true, core: true },
  { name: CORE_STATUS.onHold, tone: 'amber', active: true, core: true },
  { name: CORE_STATUS.blocked, tone: 'red', active: true, core: true },
  { name: CORE_STATUS.completed, tone: 'green', active: true, core: true },
  { name: CORE_STATUS.na, tone: 'neutral', active: true, core: true },
];

export const DEFAULT_SETTINGS: Settings = {
  Program_Name: 'Retail Opening Program',
  Program_Year: '2026–2027',
  Progress_Method: 'simple',
  Due_Soon_Days: 14,
  Statuses: DEFAULT_STATUSES,
  Risk_Guidance: {
    Low: 'On track. No blocker affecting the opening date.',
    Medium: 'Attention needed. Delays or open decisions that can still be absorbed.',
    High: 'Opening date or scope at risk. Escalation or decision required.',
  },
  Next_Steps_Horizon_Days: 21,
  Refresh_Interval_Seconds: 60,
  Minutes_Template: 'standard',
};

const TONES: StatusTone[] = ['grey', 'blue', 'amber', 'red', 'green', 'neutral', 'violet', 'teal'];

export function serializeStatuses(list: StatusDef[]): string {
  return list.map((s) => `${s.name}:${s.tone}${s.active ? '' : ':inactive'}`).join(', ');
}

export function parseStatuses(raw: string): StatusDef[] {
  const out: StatusDef[] = [];
  for (const part of raw.split(',')) {
    const [nameRaw, toneRaw, flag] = part.split(':').map((x) => x.trim());
    if (!nameRaw) continue;
    const core = DEFAULT_STATUSES.find((d) => d.name.toLowerCase() === nameRaw.toLowerCase());
    const tone = (TONES as string[]).includes(toneRaw ?? '') ? (toneRaw as StatusTone) : core?.tone ?? 'grey';
    if (out.some((o) => o.name.toLowerCase() === nameRaw.toLowerCase())) continue;
    out.push({ name: core?.name ?? nameRaw, tone, active: core ? true : flag !== 'inactive', core: !!core });
  }
  for (const d of DEFAULT_STATUSES) if (!out.some((o) => o.name === d.name)) out.push({ ...d });
  return out;
}

export const SETTING_DESCRIPTIONS: Record<string, string> = {
  Program_Name: 'Program name shown in the top bar',
  Program_Year: 'Current program / year label',
  Progress_Method: 'simple | weighted (uses Task_Weight)',
  Due_Soon_Days: 'Days ahead considered "due soon"',
  Statuses: 'Comma separated Name:tone[:inactive]. Core statuses cannot be removed.',
  Risk_Guidance_Low: 'Guidance text for Low risk',
  Risk_Guidance_Medium: 'Guidance text for Medium risk',
  Risk_Guidance_High: 'Guidance text for High risk',
  Next_Steps_Horizon_Days: 'Minutes: open actions due within N days are listed as next steps',
  Refresh_Interval_Seconds: 'Automatic refresh interval of the web app',
  Minutes_Template: 'Meeting minutes template id',
};

export function parseSettings(rows: RawRow[], issues: DataIssue[]): Settings {
  const map = new Map<string, string>();
  for (const r of rows) {
    const k = str(r.Setting_Key);
    if (k) map.set(k, str(r.Setting_Value));
  }
  const s: Settings = structuredClone(DEFAULT_SETTINGS);
  if (map.get('Program_Name')) s.Program_Name = map.get('Program_Name')!;
  if (map.get('Program_Year')) s.Program_Year = map.get('Program_Year')!;
  const pm = (map.get('Progress_Method') ?? '').toLowerCase();
  if (pm === 'simple' || pm === 'weighted') s.Progress_Method = pm;
  else if (pm) issues.push({ table: 'SETTINGS', rowKey: 'Progress_Method', severity: 'warning', message: `Unknown progress method "${pm}", using simple average` });
  const ds = num(map.get('Due_Soon_Days') ?? null);
  if (ds !== null && ds >= 1 && ds <= 120) s.Due_Soon_Days = Math.round(ds);
  const nh = num(map.get('Next_Steps_Horizon_Days') ?? null);
  if (nh !== null && nh >= 1 && nh <= 365) s.Next_Steps_Horizon_Days = Math.round(nh);
  const ri = num(map.get('Refresh_Interval_Seconds') ?? null);
  if (ri !== null && ri >= 15 && ri <= 3600) s.Refresh_Interval_Seconds = Math.round(ri);
  if (map.get('Statuses')) s.Statuses = parseStatuses(map.get('Statuses')!);
  for (const lvl of RISK_LEVELS) {
    const g = map.get(`Risk_Guidance_${lvl}`);
    if (g) s.Risk_Guidance[lvl] = g;
  }
  if (map.get('Minutes_Template')) s.Minutes_Template = map.get('Minutes_Template')!;
  return s;
}

export function serializeSettings(s: Settings): RawRow[] {
  const kv: [string, string | number][] = [
    ['Program_Name', s.Program_Name],
    ['Program_Year', s.Program_Year],
    ['Progress_Method', s.Progress_Method],
    ['Due_Soon_Days', s.Due_Soon_Days],
    ['Statuses', serializeStatuses(s.Statuses)],
    ['Risk_Guidance_Low', s.Risk_Guidance.Low],
    ['Risk_Guidance_Medium', s.Risk_Guidance.Medium],
    ['Risk_Guidance_High', s.Risk_Guidance.High],
    ['Next_Steps_Horizon_Days', s.Next_Steps_Horizon_Days],
    ['Refresh_Interval_Seconds', s.Refresh_Interval_Seconds],
    ['Minutes_Template', s.Minutes_Template],
  ];
  return kv.map(([k, v]) => ({ Setting_Key: k, Setting_Value: v, Description: SETTING_DESCRIPTIONS[k] ?? '' }));
}

// ───────────────────────────── entities ─────────────────────────────

type Ctx = { issues: DataIssue[] };

function dateField(row: RawRow, field: string, table: string, key: string, ctx: Ctx): string {
  const { value, ok } = parseLooseDate(row[field]);
  if (!ok) ctx.issues.push({ table, rowKey: key, field, severity: 'warning', message: `Invalid date "${str(row[field])}" ignored` });
  return value;
}

function tsField(row: RawRow, field: string): string {
  const v = row[field];
  if (typeof v === 'number') {
    const { value } = parseLooseDate(v);
    return value ? `${value}T00:00:00.000Z` : '';
  }
  const s = str(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  const { value } = parseLooseDate(s);
  return value ? `${value}T00:00:00.000Z` : '';
}

export function parseStore(row: RawRow, ctx: Ctx): Store | null {
  const id = str(row.Store_ID);
  if (!id) return null;
  const T = 'STORES';
  const risk = normalizeEnum(str(row.Risk_Level), RISK_LEVELS);
  if (str(row.Risk_Level) && !risk) ctx.issues.push({ table: T, rowKey: id, field: 'Risk_Level', severity: 'warning', message: `Invalid risk "${str(row.Risk_Level)}"` });
  const ods = normalizeEnum(str(row.Opening_Date_Status), OPENING_DATE_STATUSES);
  const pt = normalizeEnum(str(row.Program_Type), PROGRAM_TYPES);
  if (!pt) ctx.issues.push({ table: T, rowKey: id, field: 'Program_Type', severity: 'warning', message: `Program type "${str(row.Program_Type)}" not recognised — treated as New Store` });
  const opening = dateField(row, 'Opening_Date', T, id, ctx);
  return {
    Store_ID: id,
    Store_Name: str(row.Store_Name) || id,
    Country: str(row.Country),
    City: str(row.City),
    Store_Type: str(row.Store_Type) || (pt === 'New Company' ? 'Company Opening' : 'Standard Store'),
    Opening_Date: opening,
    Opening_Date_Status: ods ?? (opening ? 'Tentative' : 'TBD'),
    Program_Type: pt ?? 'New Store',
    Overall_Status: str(row.Overall_Status) || 'In Progress',
    Overall_Progress: parseProgress(row.Overall_Progress).value,
    Risk_Level: risk ?? 'Low',
    Project_Manager: str(row.Project_Manager),
    Last_Update: tsField(row, 'Last_Update'),
    Version: Math.max(0, Math.round(num(row.Version) ?? 0)),
    rev: rowRev(row, TABLES.STORES.headers),
  };
}

export function parseTask(row: RawRow, ctx: Ctx, statusNames: string[]): Task | null {
  const id = str(row.Task_ID);
  if (!id) return null;
  const T = 'TASKS';
  const statusRaw = str(row.Status);
  let status = statusNames.find((s) => s.toLowerCase() === statusRaw.toLowerCase()) ?? '';
  if (!status) {
    status = statusRaw || CORE_STATUS.notStarted;
    if (statusRaw) ctx.issues.push({ table: T, rowKey: id, field: 'Status', severity: 'warning', message: `Unknown status "${statusRaw}"` });
  }
  const prog = parseProgress(row.Progress_Percentage);
  if (!prog.ok) ctx.issues.push({ table: T, rowKey: id, field: 'Progress_Percentage', severity: 'warning', message: `Progress "${str(row.Progress_Percentage)}" outside 0–100 — clamped` });
  const riskRaw = str(row.Risk_Level);
  const risk = normalizeEnum(riskRaw, RISK_LEVELS);
  if (riskRaw && !risk) ctx.issues.push({ table: T, rowKey: id, field: 'Risk_Level', severity: 'warning', message: `Invalid risk "${riskRaw}" — treated as Low` });
  const prRaw = str(row.Priority);
  const pr = normalizeEnum(prRaw, PRIORITIES);
  if (prRaw && !pr) ctx.issues.push({ table: T, rowKey: id, field: 'Priority', severity: 'warning', message: `Invalid priority "${prRaw}"` });
  const w = num(row.Task_Weight);
  if (str(row.Task_Weight) && (w === null || w <= 0 || w > 100)) ctx.issues.push({ table: T, rowKey: id, field: 'Task_Weight', severity: 'warning', message: `Invalid weight "${str(row.Task_Weight)}" — using 1` });
  const start = dateField(row, 'Start_Date', T, id, ctx);
  const due = dateField(row, 'Due_Date', T, id, ctx);
  if (start && due && start > due) ctx.issues.push({ table: T, rowKey: id, field: 'Start_Date', severity: 'warning', message: 'Start date is after due date' });
  return {
    Task_ID: id,
    Store_ID: str(row.Store_ID),
    Area: str(row.Area),
    Task_Title: str(row.Task_Title) || '(untitled task)',
    Description: str(row.Description),
    Start_Date: start,
    Due_Date: due,
    Owner: str(row.Owner),
    Secondary_Owner: str(row.Secondary_Owner),
    Status: status,
    Progress_Percentage: status === CORE_STATUS.completed ? 100 : prog.value,
    Risk_Level: risk ?? 'Low',
    Priority: pr ?? 'Medium',
    Task_Weight: w !== null && w > 0 && w <= 100 ? w : 1,
    Dependency: str(row.Dependency),
    Blocker: str(row.Blocker),
    Decision_Required: str(row.Decision_Required),
    Last_Update: tsField(row, 'Last_Update'),
    Last_Updated_By: str(row.Last_Updated_By),
    Version: Math.max(0, Math.round(num(row.Version) ?? 0)),
    Created_At: tsField(row, 'Created_At'),
    Completed_Date: dateField(row, 'Completed_Date', T, id, ctx),
    Archived: bool(row.Archived),
    rev: rowRev(row, TABLES.TASKS.headers),
  };
}

export function parseHistory(row: RawRow): HistoryEntry | null {
  const id = str(row.History_ID);
  const ts = tsField(row, 'Timestamp');
  if (!id || !ts) return null;
  return {
    History_ID: id,
    Task_ID: str(row.Task_ID),
    Store_ID: str(row.Store_ID),
    Timestamp: ts,
    Field_Changed: str(row.Field_Changed),
    Previous_Value: str(row.Previous_Value),
    New_Value: str(row.New_Value),
    Note: str(row.Note),
    Updated_By: str(row.Updated_By),
  };
}

export function parseArea(row: RawRow): Area | null {
  const id = str(row.Area_ID);
  if (!id) return null;
  return {
    Area_ID: id,
    Area_Name: str(row.Area_Name) || id,
    Group: str(row.Group),
    Order: num(row.Order) ?? 999,
    Active: bool(row.Active, true),
    rev: rowRev(row, TABLES.AREAS.headers),
  };
}

export function parseOwner(row: RawRow): Owner | null {
  const name = str(row.Name);
  const id = str(row.Owner_ID) || name;
  if (!id || !name) return null;
  return {
    Owner_ID: id,
    Name: name,
    Email: str(row.Email),
    Function: str(row.Function),
    Active: bool(row.Active, true),
    rev: rowRev(row, TABLES.OWNERS.headers),
  };
}

export function parseSal(row: RawRow): SalRecord | null {
  const id = str(row.SAL_ID);
  if (!id) return null;
  return {
    SAL_ID: id,
    Store_ID: str(row.Store_ID),
    SAL_Date: parseLooseDate(row.SAL_Date).value,
    Previous_SAL_Date: parseLooseDate(row.Previous_SAL_Date).value,
    Baseline_Timestamp: tsField(row, 'Baseline_Timestamp'),
    Generation_Timestamp: tsField(row, 'Generation_Timestamp'),
    Confirmation_Timestamp: tsField(row, 'Confirmation_Timestamp'),
    Generated_Minutes: str(row.Generated_Minutes),
    Final_Minutes: str(row.Final_Minutes),
    Confirmed: bool(row.Confirmed),
    Created_By: str(row.Created_By),
    Minutes_JSON: str(row.Minutes_JSON),
    Snapshot_JSON: str(row.Snapshot_JSON),
  };
}

/** Parses all tables into typed entities, collecting data-quality issues instead of throwing. */
export function parseTables(raw: RawTables) {
  const issues: DataIssue[] = [];
  const ctx: Ctx = { issues };
  const settings = parseSettings(raw.SETTINGS ?? [], issues);
  const statusNames = settings.Statuses.map((s) => s.name);

  const dedupe = <T,>(rows: RawRow[], table: string, keyField: string, parse: (r: RawRow) => T | null, keyOf: (t: T) => string) => {
    const seen = new Set<string>();
    const out: T[] = [];
    rows.forEach((r, i) => {
      const hasContent = Object.values(r).some((v) => str(v) !== '');
      if (!hasContent) return;
      const e = parse(r);
      if (!e) {
        issues.push({ table, rowKey: `row ${i + 2}`, field: keyField, severity: 'error', message: `Row without ${keyField} skipped` });
        return;
      }
      const k = keyOf(e);
      if (seen.has(k)) {
        issues.push({ table, rowKey: k, field: keyField, severity: 'error', message: `Duplicate ${keyField} "${k}" — only the first row is used` });
        return;
      }
      seen.add(k);
      out.push(e);
    });
    return out;
  };

  const areas = dedupe(raw.AREAS ?? [], 'AREAS', 'Area_ID', parseArea, (a) => a.Area_ID).sort((a, b) => a.Order - b.Order);
  const owners = dedupe(raw.OWNERS ?? [], 'OWNERS', 'Owner_ID', parseOwner, (o) => o.Owner_ID);
  const stores = dedupe(raw.STORES ?? [], 'STORES', 'Store_ID', (r) => parseStore(r, ctx), (s) => s.Store_ID);
  const tasks = dedupe(raw.TASKS ?? [], 'TASKS', 'Task_ID', (r) => parseTask(r, ctx, statusNames), (t) => t.Task_ID);
  const history = dedupe(raw.TASK_HISTORY ?? [], 'TASK_HISTORY', 'History_ID', parseHistory, (h) => h.History_ID);
  const sals = dedupe(raw.SAL_HISTORY ?? [], 'SAL_HISTORY', 'SAL_ID', parseSal, (s) => s.SAL_ID);

  // referential checks
  const storeIds = new Set(stores.map((s) => s.Store_ID));
  const areaIds = new Set(areas.map((a) => a.Area_ID));
  const ownerNames = new Set(owners.map((o) => o.Name.toLowerCase()));
  for (const t of tasks) {
    if (!storeIds.has(t.Store_ID)) issues.push({ table: 'TASKS', rowKey: t.Task_ID, field: 'Store_ID', severity: 'error', message: `Unknown store "${t.Store_ID}"` });
    if (!areaIds.has(t.Area)) issues.push({ table: 'TASKS', rowKey: t.Task_ID, field: 'Area', severity: 'warning', message: `Unknown area "${t.Area}"` });
    if (owners.length && t.Owner && !ownerNames.has(t.Owner.toLowerCase())) issues.push({ table: 'TASKS', rowKey: t.Task_ID, field: 'Owner', severity: 'warning', message: `Owner "${t.Owner}" not in OWNERS` });
    if (owners.length && t.Secondary_Owner && !ownerNames.has(t.Secondary_Owner.toLowerCase())) issues.push({ table: 'TASKS', rowKey: t.Task_ID, field: 'Secondary_Owner', severity: 'warning', message: `Secondary owner "${t.Secondary_Owner}" not in OWNERS` });
  }
  history.sort((a, b) => (a.Timestamp < b.Timestamp ? -1 : a.Timestamp > b.Timestamp ? 1 : 0));
  sals.sort((a, b) => (a.Confirmation_Timestamp || a.Generation_Timestamp).localeCompare(b.Confirmation_Timestamp || b.Generation_Timestamp));

  return { stores, tasks, history, areas, owners, sals, settings, issues };
}

// ───────────────────────────── serialization ─────────────────────────────

export function serializeStore(s: Store): RawRow {
  return {
    Store_ID: s.Store_ID, Store_Name: s.Store_Name, Country: s.Country, City: s.City, Store_Type: s.Store_Type,
    Opening_Date: s.Opening_Date, Opening_Date_Status: s.Opening_Date_Status, Program_Type: s.Program_Type,
    Overall_Status: s.Overall_Status, Overall_Progress: s.Overall_Progress, Risk_Level: s.Risk_Level,
    Project_Manager: s.Project_Manager, Last_Update: s.Last_Update, Version: s.Version,
  };
}

export function serializeTask(t: Task): RawRow {
  return {
    Task_ID: t.Task_ID, Store_ID: t.Store_ID, Area: t.Area, Task_Title: t.Task_Title, Description: t.Description,
    Start_Date: t.Start_Date, Due_Date: t.Due_Date, Owner: t.Owner, Secondary_Owner: t.Secondary_Owner,
    Status: t.Status, Progress_Percentage: t.Progress_Percentage, Risk_Level: t.Risk_Level, Priority: t.Priority,
    Task_Weight: t.Task_Weight, Dependency: t.Dependency, Blocker: t.Blocker, Decision_Required: t.Decision_Required,
    Last_Update: t.Last_Update, Last_Updated_By: t.Last_Updated_By, Version: t.Version, Created_At: t.Created_At,
    Completed_Date: t.Completed_Date, Archived: t.Archived,
  };
}

export function serializeHistory(h: HistoryEntry): RawRow {
  return { ...h };
}

export function serializeArea(a: Area): RawRow {
  return { Area_ID: a.Area_ID, Area_Name: a.Area_Name, Group: a.Group, Order: a.Order, Active: a.Active };
}

export function serializeOwner(o: Owner): RawRow {
  return { Owner_ID: o.Owner_ID, Name: o.Name, Email: o.Email, Function: o.Function, Active: o.Active };
}

export function serializeSal(s: SalRecord): RawRow {
  return { ...s };
}

/** Recompute the rev a record will have once written (so the client can keep editing without reload). */
export function revOf(table: TableName, row: RawRow): string {
  return rowRev(row, TABLES[table].headers);
}
