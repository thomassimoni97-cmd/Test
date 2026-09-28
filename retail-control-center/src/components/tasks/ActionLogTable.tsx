'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns3, Download, Rows3 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fmtDate, fmtTimestamp } from '@/lib/domain/dates';
import { delayDays, isAirport, isBlocked, isClosed, isOverdue, lateCompletionDays, progressOf, riskRank } from '@/lib/domain/metrics';
import { flagOn } from '@/lib/domain/schema';
import type { RiskLevel, Task, TaskPatch } from '@/lib/domain/types';
import { exportCsv, exportXlsx, type ExportRow } from '@/lib/client/export';
import { useModel, type Model } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { AirportMark, BlockerMark, DecisionMark, DelayBadge, ProgressBar, RiskBadge, StatusPill } from '@/components/ui/badges';
import { Button, Empty, Popover, Select, cn } from '@/components/ui/primitives';

type EditKind = 'status' | 'progress' | 'due' | 'owner' | 'risk' | 'priority' | 'decision';

interface Ctx {
  m: Model;
}

interface Col {
  id: string;
  label: string;
  width: number;
  frozen?: boolean;
  optional?: boolean;
  align?: 'right' | 'center';
  sort?: (t: Task, c: Ctx) => string | number;
  render: (t: Task, c: Ctx) => ReactNode;
  text: (t: Task, c: Ctx) => string | number;
  edit?: EditKind;
}

const COLS: Col[] = [
  {
    id: 'id', label: 'ID Task', width: 112, frozen: true,
    sort: (t) => t.Task_ID, text: (t) => t.Task_ID,
    render: (t) => <span className="tnum font-mono text-[11.5px] font-semibold text-ink-2">{t.Task_ID}</span>,
  },
  {
    id: 'area', label: 'Area', width: 128, frozen: true,
    sort: (t, c) => c.m.areasById.get(t.Area)?.Order ?? 9999, text: (t, c) => c.m.areasById.get(t.Area)?.Area_Name ?? t.Area,
    render: (t, c) => <span className="truncate text-ink-2">{c.m.areasById.get(t.Area)?.Area_Name ?? t.Area}</span>,
  },
  {
    id: 'title', label: 'Task Title', width: 310, frozen: true,
    sort: (t) => t.Task_Title.toLowerCase(), text: (t) => t.Task_Title,
    render: (t) => (
      <span className="flex min-w-0 items-center gap-1.5">
        {isBlocked(t) && <BlockerMark className="shrink-0" />}
        {flagOn(t.Decision_Required) && !isClosed(t) && <DecisionMark className="shrink-0" />}
        <span className={cn('truncate font-medium', isClosed(t) ? 'text-ink-3' : 'text-ink')} title={t.Task_Title}>{t.Task_Title}</span>
      </span>
    ),
  },
  {
    id: 'store', label: 'Store', width: 150, optional: true,
    sort: (t, c) => c.m.storesById.get(t.Store_ID)?.Store_Name ?? '', text: (t, c) => c.m.storesById.get(t.Store_ID)?.Store_Name ?? t.Store_ID,
    render: (t, c) => {
      const s = c.m.storesById.get(t.Store_ID);
      return <span className="flex items-center gap-1 truncate text-ink-2">{s?.Store_Name ?? t.Store_ID} {s && isAirport(s) && <AirportMark />}</span>;
    },
  },
  { id: 'desc', label: 'Description', width: 220, sort: (t) => t.Description, text: (t) => t.Description, render: (t) => <span className="truncate text-ink-3" title={t.Description}>{t.Description || '—'}</span> },
  { id: 'start', label: 'Start Date', width: 90, sort: (t) => t.Start_Date || '9999', text: (t) => t.Start_Date, render: (t) => <span className="tnum text-ink-2">{fmtDate(t.Start_Date, 'dd MMM yy')}</span> },
  {
    id: 'due', label: 'Due Date', width: 96, edit: 'due', sort: (t) => t.Due_Date || '9999', text: (t) => t.Due_Date,
    render: (t, c) => <span className={cn('tnum', isOverdue(t, c.m.today) ? 'font-semibold text-st-red' : 'text-ink-2')}>{fmtDate(t.Due_Date, 'dd MMM yy')}</span>,
  },
  { id: 'owner', label: 'Owner', width: 136, edit: 'owner', sort: (t) => t.Owner, text: (t) => t.Owner, render: (t) => <span className="truncate text-ink">{t.Owner || <span className="text-ink-4">Unassigned</span>}</span> },
  { id: 'owner2', label: 'Secondary Owner', width: 140, optional: true, sort: (t) => t.Secondary_Owner, text: (t) => t.Secondary_Owner, render: (t) => <span className="truncate text-ink-2">{t.Secondary_Owner || '—'}</span> },
  {
    id: 'delay', label: 'Delay', width: 70, align: 'center',
    sort: (t, c) => delayDays(t, c.m.today) ?? -1, text: (t, c) => (delayDays(t, c.m.today) ? `+${delayDays(t, c.m.today)}d` : ''),
    render: (t, c) => <DelayBadge days={delayDays(t, c.m.today)} late={lateCompletionDays(t)} />,
  },
  { id: 'status', label: 'Status', width: 122, edit: 'status', sort: (t) => t.Status, text: (t) => t.Status, render: (t) => <StatusPill status={t.Status} size="sm" /> },
  {
    id: 'progress', label: '%', width: 108, edit: 'progress', sort: (t) => t.Progress_Percentage, text: (t) => t.Progress_Percentage,
    render: (t) => <ProgressBar value={t.Progress_Percentage} showLabel height={5} className="w-full" />,
  },
  { id: 'risk', label: 'Risk', width: 86, edit: 'risk', sort: (t) => riskRank(t.Risk_Level), text: (t) => t.Risk_Level, render: (t) => <RiskBadge level={t.Risk_Level} /> },
  { id: 'priority', label: 'Priority', width: 84, edit: 'priority', optional: true, sort: (t) => riskRank(t.Priority), text: (t) => t.Priority, render: (t) => <span className="text-ink-2">{t.Priority}</span> },
  {
    id: 'decision', label: 'Decision', width: 84, edit: 'decision', align: 'center', optional: true,
    sort: (t) => (flagOn(t.Decision_Required) ? 1 : 0), text: (t) => t.Decision_Required,
    render: (t) => (flagOn(t.Decision_Required) ? <span className="inline-flex items-center gap-1 text-xs font-medium text-st-violet"><DecisionMark /> Yes</span> : <span className="text-xs text-ink-4">No</span>),
  },
  { id: 'blocker', label: 'Blocker', width: 220, optional: true, sort: (t) => t.Blocker, text: (t) => t.Blocker, render: (t) => <span className="truncate text-st-red" title={t.Blocker}>{flagOn(t.Blocker) ? t.Blocker : ''}</span> },
  { id: 'dependency', label: 'Dependency', width: 130, optional: true, sort: (t) => t.Dependency, text: (t) => t.Dependency, render: (t) => <span className="truncate font-mono text-[11px] text-ink-3">{t.Dependency}</span> },
  { id: 'weight', label: 'Weight', width: 70, optional: true, align: 'right', sort: (t) => t.Task_Weight, text: (t) => t.Task_Weight, render: (t) => <span className="tnum text-ink-2">{t.Task_Weight}</span> },
  {
    id: 'updated', label: 'Last Update', width: 112, sort: (t) => t.Last_Update, text: (t) => t.Last_Update,
    render: (t) => <span className="tnum text-xs text-ink-3" title={`${fmtTimestamp(t.Last_Update)} · ${t.Last_Updated_By}`}>{fmtTimestamp(t.Last_Update, 'dd MMM, HH:mm')}</span>,
  },
];

const DEFAULT_HIDDEN = COLS.filter((c) => c.optional).map((c) => c.id);
type GroupBy = 'none' | 'area' | 'store' | 'owner' | 'status' | 'risk';

type Row = { kind: 'group'; key: string; label: string; tasks: Task[] } | { kind: 'task'; task: Task };

export function ActionLogTable({
  tasks,
  prefKey = 'actionlog',
  showStore = false,
  maxHeight = 'calc(100vh - 230px)',
  exportName = 'action-log',
  toolbarExtra,
  defaultGroup = 'none',
  emptyText = 'No tasks match the current filters.',
  defaultHidden,
}: {
  tasks: Task[];
  prefKey?: string;
  showStore?: boolean;
  maxHeight?: string;
  exportName?: string;
  toolbarExtra?: ReactNode;
  defaultGroup?: GroupBy;
  emptyText?: string;
  /** columns hidden until the user changes the column selection (per prefKey) */
  defaultHidden?: string[];
}) {
  const m = useModel();
  const prefs = useApp((s) => s.prefs);
  const setPref = useApp((s) => s.setPref);
  const presentation = useApp((s) => s.presentation);
  const openTask = useApp((s) => s.openTask);
  const drawer = useApp((s) => s.drawer);
  const update = useApp((s) => s.updateTask);
  const readOnly = presentation;

  const hidden = (prefs[`${prefKey}.hidden`] as string[] | undefined) ?? [...(showStore ? DEFAULT_HIDDEN.filter((c) => c !== 'store') : DEFAULT_HIDDEN), ...(defaultHidden ?? [])];
  const widthsPref = prefs[`${prefKey}.widths`] as Record<string, number> | undefined;
  const widths = useMemo(() => widthsPref ?? {}, [widthsPref]);
  const sort = (prefs[`${prefKey}.sort`] as { id: string; dir: 1 | -1 } | undefined) ?? { id: 'due', dir: 1 };
  const group = (prefs[`${prefKey}.group`] as GroupBy | undefined) ?? defaultGroup;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; col: string } | null>(null);

  // column widths are defined for a 14px root; scale them with the root font (presentation mode / large screens)
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 14;
    setScale(fs / 14);
  }, [presentation]);
  const cols = COLS.filter((c) => !hidden.includes(c.id));
  const widthOf = (c: Col) => Math.round((widths[c.id] ?? c.width) * scale);
  const ctx: Ctx = { m };

  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.id === sort.id) ?? COLS[0];
    const key = col.sort ?? col.text;
    return [...tasks].sort((a, b) => {
      const va = key(a, ctx);
      const vb = key(b, ctx);
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return r * sort.dir || a.Task_ID.localeCompare(b.Task_ID);
    });
  }, [tasks, sort.id, sort.dir, m]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo<Row[]>(() => {
    if (group === 'none') return sorted.map((task) => ({ kind: 'task', task }));
    const keyOf = (t: Task): [string, string, number | string] => {
      switch (group) {
        case 'area': {
          const a = m.areasById.get(t.Area);
          return [t.Area, a?.Area_Name ?? t.Area, a?.Order ?? 9999];
        }
        case 'store': {
          const s = m.storesById.get(t.Store_ID);
          return [t.Store_ID, s?.Store_Name ?? t.Store_ID, s?.Opening_Date || '9999'];
        }
        case 'owner':
          return [t.Owner || '—', t.Owner || 'Unassigned', t.Owner || 'zzz'];
        case 'status':
          return [t.Status, t.Status, m.snap.settings.Statuses.findIndex((s) => s.name === t.Status)];
        case 'risk':
          return [t.Risk_Level, `${t.Risk_Level} risk`, -riskRank(t.Risk_Level)];
        default:
          return ['', '', 0];
      }
    };
    const groups = new Map<string, { label: string; order: number | string; tasks: Task[] }>();
    for (const t of sorted) {
      const [k, label, order] = keyOf(t);
      const g = groups.get(k) ?? { label, order, tasks: [] };
      g.tasks.push(t);
      groups.set(k, g);
    }
    const out: Row[] = [];
    [...groups.entries()]
      .sort((a, b) => (a[1].order < b[1].order ? -1 : a[1].order > b[1].order ? 1 : 0))
      .forEach(([key, g]) => {
        out.push({ kind: 'group', key, label: g.label, tasks: g.tasks });
        if (!collapsed.has(key)) g.tasks.forEach((task) => out.push({ kind: 'task', task }));
      });
    return out;
  }, [sorted, group, collapsed, m]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowH = Math.round((presentation ? 38 : 36) * scale);
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: (i) => (rows[i].kind === 'group' ? Math.round(34 * scale) : rowH), overscan: 12 });
  useEffect(() => virt.measure(), [rowH, virt]);

  const totalWidth = cols.reduce((s, c) => s + widthOf(c), 0);
  const frozenOffsets = useMemo(() => {
    const out: Record<string, number> = {};
    let x = 0;
    for (const c of cols) {
      if (c.frozen) {
        out[c.id] = x;
        x += widthOf(c);
      }
    }
    return out;
  }, [cols, widths, scale]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastFrozen = [...cols].reverse().find((c) => c.frozen)?.id;

  const setSort = (id: string) => setPref(`${prefKey}.sort`, sort.id === id ? { id, dir: sort.dir === 1 ? -1 : 1 } : { id, dir: 1 });

  const startResize = useCallback(
    (e: React.PointerEvent, c: Col) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = widths[c.id] ?? c.width;
      const onMove = (ev: PointerEvent) => setPref(`${prefKey}.widths`, { ...(useApp.getState().prefs[`${prefKey}.widths`] as Record<string, number> | undefined), [c.id]: Math.max(60, startW + (ev.clientX - startX) / scale) });
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [widths, prefKey, setPref, scale],
  );

  const doExport = (kind: 'csv' | 'xlsx') => {
    const exportCols = COLS.filter((c) => !hidden.includes(c.id) || c.id === 'store');
    const header = ['Store_ID', ...exportCols.map((c) => c.label)];
    const data: ExportRow[] = sorted.map((t) => {
      const r: ExportRow = { Store_ID: t.Store_ID };
      for (const c of exportCols) r[c.label] = c.text(t, ctx);
      return r;
    });
    const name = `${exportName}-${m.today}.${kind}`;
    if (kind === 'csv') exportCsv(data, header, name);
    else exportXlsx(data, header, name);
  };

  const commit = (t: Task, patch: TaskPatch) => {
    setEditing(null);
    update(t.Task_ID, patch);
  };

  const cellEditor = (t: Task, c: Col) => {
    const common = 'h-7 w-full text-xs';
    switch (c.edit) {
      case 'status':
        return (
          <Select autoFocus className={common} defaultValue={t.Status} onChange={(e) => commit(t, { Status: e.target.value })} onBlur={() => setEditing(null)}>
            {m.activeStatuses.map((s) => <option key={s.name}>{s.name}</option>)}
          </Select>
        );
      case 'owner':
        return (
          <Select autoFocus className={common} defaultValue={t.Owner} onChange={(e) => commit(t, { Owner: e.target.value })} onBlur={() => setEditing(null)}>
            <option value="">— Unassigned —</option>
            {m.activeOwners.map((o) => <option key={o.Owner_ID} value={o.Name}>{o.Name}</option>)}
          </Select>
        );
      case 'risk':
      case 'priority':
        return (
          <Select autoFocus className={common} defaultValue={c.edit === 'risk' ? t.Risk_Level : t.Priority} onChange={(e) => commit(t, c.edit === 'risk' ? { Risk_Level: e.target.value as RiskLevel } : { Priority: e.target.value as RiskLevel })} onBlur={() => setEditing(null)}>
            {['Low', 'Medium', 'High'].map((r) => <option key={r}>{r}</option>)}
          </Select>
        );
      case 'due':
        return (
          <input
            type="date"
            autoFocus
            defaultValue={t.Due_Date}
            className="h-7 w-full rounded border border-sand-500 bg-paper px-1 text-xs"
            onBlur={(e) => (e.target.value !== t.Due_Date ? commit(t, { Due_Date: e.target.value }) : setEditing(null))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(null);
            }}
          />
        );
      case 'progress':
        return (
          <input
            type="number"
            min={0}
            max={100}
            step={5}
            autoFocus
            defaultValue={t.Progress_Percentage}
            className="tnum h-7 w-full rounded border border-sand-500 bg-paper px-1.5 text-right text-xs"
            onBlur={(e) => {
              const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
              if (v !== t.Progress_Percentage) commit(t, { Progress_Percentage: v });
              else setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(null);
            }}
          />
        );
      default:
        return null;
    }
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {toolbarExtra}
      <div className="ml-auto flex items-center gap-2">
        <span className="tnum text-xs text-ink-3">
          {tasks.length} task{tasks.length === 1 ? '' : 's'}
          {tasks.length > 0 && <> · {progressOf(tasks, m.snap.settings.Progress_Method)}% complete</>}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          <Rows3 className="h-3.5 w-3.5" />
          <Select className="h-7 text-xs" value={group} onChange={(e) => setPref(`${prefKey}.group`, e.target.value)} aria-label="Group by">
            <option value="none">No grouping</option>
            <option value="area">Group by area</option>
            <option value="store">Group by store</option>
            <option value="owner">Group by owner</option>
            <option value="status">Group by status</option>
            <option value="risk">Group by risk</option>
          </Select>
        </label>
        <Popover
          align="right"
          trigger={(_, toggle) => <Button size="sm" icon={<Columns3 className="h-3.5 w-3.5" />} onClick={toggle}>Columns</Button>}
        >
          {() => (
            <div className="max-h-80 w-56 overflow-y-auto p-1">
              <p className="eyebrow px-2 py-1">Visible columns</p>
              {COLS.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-wash">
                  <input
                    type="checkbox"
                    className="accent-[#231D19]"
                    disabled={c.frozen}
                    checked={!hidden.includes(c.id)}
                    onChange={(e) => setPref(`${prefKey}.hidden`, e.target.checked ? hidden.filter((h) => h !== c.id) : [...hidden, c.id])}
                  />
                  {c.label} {c.frozen && <span className="ml-auto text-2xs text-ink-4">frozen</span>}
                </label>
              ))}
              <button type="button" className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-ink-3 hover:bg-wash" onClick={() => { setPref(`${prefKey}.hidden`, undefined); setPref(`${prefKey}.widths`, undefined); }}>
                Reset columns & widths
              </button>
            </div>
          )}
        </Popover>
        <Popover align="right" trigger={(_, toggle) => <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={toggle}>Export</Button>}>
          {(close) => (
            <div className="w-56 p-1">
              <button type="button" className="w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-wash" onClick={() => { doExport('xlsx'); close(); }}>Excel (.xlsx) — filtered view</button>
              <button type="button" className="w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-wash" onClick={() => { doExport('csv'); close(); }}>CSV — filtered view</button>
            </div>
          )}
        </Popover>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="no-print">{toolbar}</div>
      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {tasks.length === 0 ? (
          <Empty title={emptyText} body="Adjust or clear the filters, or add a new task." compact />
        ) : (
          <div ref={scrollRef} className="relative overflow-auto" style={{ maxHeight }}>
            <div style={{ width: totalWidth, minWidth: '100%' }}>
              {/* header */}
              <div className="sticky top-0 z-20 flex border-b border-line-strong bg-wash text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3" role="row">
                {cols.map((c) => (
                  <div
                    key={c.id}
                    role="columnheader"
                    className={cn('group relative flex h-9 shrink-0 select-none items-center px-2.5', c.frozen && 'sticky z-10 bg-wash', c.id === lastFrozen && 'border-r border-line-strong', c.align === 'right' && 'justify-end', c.align === 'center' && 'justify-center')}
                    style={{ width: widthOf(c), left: c.frozen ? frozenOffsets[c.id] : undefined }}
                  >
                    <button type="button" className="flex items-center gap-1 truncate hover:text-ink" onClick={() => setSort(c.id)} title="Sort">
                      {c.label}
                      {sort.id === c.id && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                    <span onPointerDown={(e) => startResize(e, c)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:bg-sand-300 group-hover:opacity-100" aria-hidden />
                  </div>
                ))}
              </div>
              {/* body */}
              <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
                {virt.getVirtualItems().map((vi) => {
                  const row = rows[vi.index];
                  if (row.kind === 'group') {
                    const isCol = collapsed.has(row.key);
                    const prog = progressOf(row.tasks, m.snap.settings.Progress_Method);
                    const overdue = row.tasks.filter((t) => isOverdue(t, m.today)).length;
                    const blocked = row.tasks.filter(isBlocked).length;
                    return (
                      <div key={`g-${row.key}`} className="absolute left-0 flex w-full items-center border-b border-line bg-sand-50" style={{ top: vi.start, height: vi.size }}>
                        <button
                          type="button"
                          className="sticky left-0 flex h-full items-center gap-2 px-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink"
                          onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(row.key)) n.delete(row.key); else n.add(row.key); return n; })}
                        >
                          {isCol ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {row.label}
                          <span className="font-normal normal-case tracking-normal text-ink-3">· {row.tasks.length} tasks · {prog}%</span>
                          {overdue > 0 && <span className="rounded bg-st-redBg px-1.5 text-2xs normal-case tracking-normal text-st-red">{overdue} overdue</span>}
                          {blocked > 0 && <span className="rounded bg-st-redBg px-1.5 text-2xs normal-case tracking-normal text-st-red">{blocked} blocked</span>}
                        </button>
                      </div>
                    );
                  }
                  const t = row.task;
                  const overdue = isOverdue(t, m.today);
                  const selected = drawer?.kind === 'task' && drawer.taskId === t.Task_ID;
                  return (
                    <div
                      key={t.Task_ID}
                      role="row"
                      tabIndex={0}
                      onClick={() => openTask(t.Task_ID)}
                      onKeyDown={(e) => e.key === 'Enter' && openTask(t.Task_ID)}
                      className={cn('group/row absolute left-0 flex w-full cursor-pointer border-b border-line/70 text-[13px] hover:bg-sand-50/60', selected && 'bg-sand-50')}
                      style={{ top: vi.start, height: vi.size }}
                    >
                      {cols.map((c, i) => {
                        const isEditing = editing?.id === t.Task_ID && editing.col === c.id;
                        const editable = !readOnly && !!c.edit;
                        return (
                          <div
                            key={c.id}
                            role="cell"
                            className={cn(
                              'flex shrink-0 items-center overflow-hidden px-2.5',
                              c.frozen && cn('sticky z-10 bg-paper group-hover/row:bg-[#FBF8F2]', selected && 'bg-sand-50'),
                              c.id === lastFrozen && 'border-r border-line',
                              c.align === 'right' && 'justify-end',
                              c.align === 'center' && 'justify-center',
                              editable && !isEditing && 'hover:outline hover:outline-1 hover:-outline-offset-2 hover:outline-sand-300',
                              i === 0 && overdue && 'shadow-[inset_3px_0_0_#AE3527]',
                            )}
                            style={{ width: widthOf(c), left: c.frozen ? frozenOffsets[c.id] : undefined }}
                            onClick={(e) => {
                              if (!editable) return;
                              e.stopPropagation();
                              if (c.edit === 'decision') update(t.Task_ID, { Decision_Required: flagOn(t.Decision_Required) ? '' : 'TRUE' });
                              else setEditing({ id: t.Task_ID, col: c.id });
                            }}
                            title={editable && c.edit !== 'decision' ? 'Click to edit' : undefined}
                          >
                            {isEditing ? cellEditor(t, c) : c.render(t, ctx)}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

