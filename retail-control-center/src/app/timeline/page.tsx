'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { addDays, addMonths, differenceInCalendarDays, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDate } from '@/lib/domain/dates';
import { isAirport, isOverdue, progressOf } from '@/lib/domain/metrics';
import type { Task } from '@/lib/domain/types';
import { useFilteredTasks, useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { FilterBar } from '@/components/tasks/FilterBar';
import { AirportMark, TONE } from '@/components/ui/badges';
import { Card, Empty, Segmented, cn } from '@/components/ui/primitives';

const LABEL_W = 340;
const ROW_H = 30;

type Row = { kind: 'group'; key: string; label: string; tasks: Task[]; opening?: string; openingStatus?: string } | { kind: 'task'; task: Task };

export default function GanttPage() {
  const m = useModel();
  const tasks = useFilteredTasks();
  const openTask = useApp((s) => s.openTask);
  const groupBy = (useApp((s) => s.prefs['gantt.group']) as 'store' | 'area' | undefined) ?? 'store';
  const zoom = (useApp((s) => s.prefs['gantt.zoom']) as 'week' | 'month' | undefined) ?? 'month';
  const setPref = useApp((s) => s.setPref);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const dayW = zoom === 'week' ? 6 : 2.2;

  const dated = useMemo(() => tasks.filter((t) => t.Due_Date || t.Start_Date), [tasks]);
  const { start, end } = useMemo(() => {
    const ds = dated.flatMap((t) => [t.Start_Date || t.Due_Date, t.Due_Date || t.Start_Date]).concat(m.today).sort();
    const opens = m.stores.map((s) => s.Opening_Date).filter(Boolean);
    const lo = ds[0] ?? m.today;
    const hi = [ds[ds.length - 1] ?? m.today, ...opens.filter((o) => dated.some((t) => m.storesById.get(t.Store_ID)?.Opening_Date === o))].sort().pop()!;
    return { start: startOfMonth(addMonths(parseISO(lo), -1)), end: startOfMonth(addMonths(parseISO(hi), 2)) };
  }, [dated, m]);
  const totalDays = differenceInCalendarDays(end, start);
  const width = totalDays * dayW;
  const x = (iso: string) => differenceInCalendarDays(parseISO(iso), start) * dayW;

  const rows = useMemo<Row[]>(() => {
    const groups = new Map<string, Task[]>();
    for (const t of dated) {
      const k = groupBy === 'store' ? t.Store_ID : t.Area;
      groups.set(k, [...(groups.get(k) ?? []), t]);
    }
    const keys = [...groups.keys()].sort((a, b) => {
      if (groupBy === 'store') return (m.storesById.get(a)?.Opening_Date || '9999').localeCompare(m.storesById.get(b)?.Opening_Date || '9999');
      return (m.areasById.get(a)?.Order ?? 9999) - (m.areasById.get(b)?.Order ?? 9999);
    });
    const out: Row[] = [];
    for (const k of keys) {
      const list = groups.get(k)!.sort((a, b) => (a.Start_Date || a.Due_Date).localeCompare(b.Start_Date || b.Due_Date));
      const store = groupBy === 'store' ? m.storesById.get(k) : undefined;
      out.push({ kind: 'group', key: k, label: store?.Store_Name ?? m.areasById.get(k)?.Area_Name ?? k, tasks: list, opening: store?.Opening_Date, openingStatus: store?.Opening_Date_Status });
      if (!collapsed.has(k)) list.forEach((task) => out.push({ kind: 'task', task }));
    }
    return out;
  }, [dated, groupBy, collapsed, m]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: (i) => (rows[i].kind === 'group' ? 34 : ROW_H), overscan: 15 });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, x(m.today) - 200);
  }, [zoom, start]); // eslint-disable-line react-hooks/exhaustive-deps

  const months: Date[] = [];
  for (let d = start; d < end; d = addMonths(d, 1)) months.push(d);
  const weeks: Date[] = [];
  if (zoom === 'week') for (let d = startOfWeek(start, { weekStartsOn: 1 }); d < end; d = addDays(d, 7)) weeks.push(d);
  const todayX = x(m.today);

  return (
    <div className="space-y-3 px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Gantt · start → due date with progress and opening milestones</div>
          <h1 className="mt-0.5 text-[1.6rem] font-semibold tracking-tight">Program Timeline</h1>
        </div>
        <div className="flex items-center gap-2">
          <Segmented size="sm" value={groupBy} onChange={(v) => { setPref('gantt.group', v); setCollapsed(new Set()); }} options={[{ value: 'store', label: 'By store' }, { value: 'area', label: 'By area' }]} />
          <Segmented size="sm" value={zoom} onChange={(v) => setPref('gantt.zoom', v)} options={[{ value: 'month', label: 'Months' }, { value: 'week', label: 'Weeks' }]} />
          <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(rows.filter((r) => r.kind === 'group').map((r) => (r as { key: string }).key)))}>
            {collapsed.size ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      </div>
      <FilterBar show={['q', 'store', 'area', 'owner', 'status', 'risk', 'overdue', 'blocked', 'decision']} />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty title="No dated tasks match the current filters." compact />
        ) : (
          <div ref={scrollRef} className="relative overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            <div style={{ width: LABEL_W + width }} className="relative">
              {/* header */}
              <div className="sticky top-0 z-30 flex h-12 border-b border-line-strong bg-wash">
                <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-line-strong bg-wash px-3 pb-1.5" style={{ width: LABEL_W }}>
                  <span className="eyebrow">{groupBy === 'store' ? 'Opening / task' : 'Area / task'}</span>
                </div>
                <div className="relative" style={{ width }}>
                  {months.map((mo) => (
                    <div key={mo.toISOString()} className="absolute top-0 h-full border-l border-line" style={{ left: x(format(mo, 'yyyy-MM-dd')), width: differenceInCalendarDays(addMonths(mo, 1), mo) * dayW }}>
                      <span className={cn('block px-1.5 pt-1 text-2xs font-semibold text-ink-2', mo.getMonth() === 0 && 'text-ink')}>{format(mo, zoom === 'week' || mo.getMonth() === 0 ? 'MMM yyyy' : 'MMM')}</span>
                    </div>
                  ))}
                  {weeks.map((w) => (
                    <span key={w.toISOString()} className="tnum absolute bottom-0.5 text-[10px] text-ink-4" style={{ left: x(format(w, 'yyyy-MM-dd')) + 2 }}>{format(w, 'd')}</span>
                  ))}
                </div>
              </div>
              {/* guides + today */}
              <div className="pointer-events-none absolute bottom-0 top-12 z-0" style={{ left: LABEL_W, width }}>
                {months.map((mo) => <div key={mo.toISOString()} className={cn('absolute bottom-0 top-0 border-l', mo.getMonth() === 0 ? 'border-line-strong' : 'border-line/50')} style={{ left: x(format(mo, 'yyyy-MM-dd')) }} />)}
                <div className="absolute bottom-0 top-0 z-20 w-px bg-st-red" style={{ left: todayX }} />
              </div>
              <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
                {virt.getVirtualItems().map((vi) => {
                  const r = rows[vi.index];
                  if (r.kind === 'group') {
                    const store = groupBy === 'store' ? m.storesById.get(r.key) : undefined;
                    const isCol = collapsed.has(r.key);
                    return (
                      <div key={`g${r.key}`} className="absolute left-0 flex w-full border-b border-line bg-sand-50/80" style={{ top: vi.start, height: vi.size }}>
                        <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })} className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-line bg-sand-50 px-2 text-left text-[12px] font-semibold uppercase tracking-[0.05em]" style={{ width: LABEL_W }}>
                          {isCol ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          <span className="truncate">{r.label}</span>
                          {store && isAirport(store) && <AirportMark />}
                          <span className="ml-auto shrink-0 text-2xs font-normal normal-case tracking-normal text-ink-3">{r.tasks.length} · {progressOf(r.tasks, m.snap.settings.Progress_Method)}%</span>
                        </button>
                        <div className="relative" style={{ width }}>
                          {r.opening && (
                            <div className="absolute top-1/2 z-10 flex -translate-y-1/2 items-center" style={{ left: x(r.opening) - 7 }} title={`Opening ${fmtDate(r.opening)} (${r.openingStatus})`}>
                              <div className={cn('h-3.5 w-3.5 rotate-45 border-2', r.openingStatus === 'Confirmed' ? 'border-ink bg-ink' : 'border-ink bg-paper')} />
                              <span className="ml-1.5 whitespace-nowrap text-2xs font-semibold text-ink">Opening {fmtDate(r.opening, 'dd MMM yy')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  const t = r.task;
                  const s = t.Start_Date || t.Due_Date;
                  const d = t.Due_Date || t.Start_Date;
                  const left = x(s);
                  const w = Math.max(dayW * 2, x(d) - left + dayW);
                  const tone = TONE[m.statusDefs.get(t.Status)?.tone ?? 'grey'];
                  const late = isOverdue(t, m.today);
                  const st = m.storesById.get(t.Store_ID);
                  return (
                    <div key={t.Task_ID} className="absolute left-0 flex w-full border-b border-line/50 hover:bg-wash/50" style={{ top: vi.start, height: vi.size }}>
                      <button type="button" onClick={() => openTask(t.Task_ID)} className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-paper px-3 text-left text-[12.5px] hover:bg-wash" style={{ width: LABEL_W }}>
                        <span className="w-[92px] shrink-0 font-mono text-[11px] text-ink-3">{t.Task_ID}</span>
                        <span className="truncate text-ink">{t.Task_Title}</span>
                        <span className="ml-auto shrink-0 text-2xs text-ink-4">{groupBy === 'store' ? m.areasById.get(t.Area)?.Area_Name : st?.Store_ID}</span>
                      </button>
                      <div className="relative" style={{ width }}>
                        <button
                          type="button"
                          onClick={() => openTask(t.Task_ID)}
                          className={cn('absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-sm ring-1', tone.bg, late ? 'ring-st-red' : 'ring-black/5')}
                          style={{ left, width: w }}
                          title={`${t.Task_ID} · ${t.Task_Title}\n${fmtDate(s)} → ${fmtDate(d)} · ${t.Status} · ${t.Progress_Percentage}% · ${t.Owner}`}
                        >
                          <span className={cn('block h-full opacity-70', tone.bar)} style={{ width: `${t.Progress_Percentage}%` }} />
                        </button>
                        <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1.5 text-2xs text-ink-3" style={{ left: left + w }}>
                          {t.Progress_Percentage}% · {t.Status}{late ? ' · overdue' : ''}
                        </span>
                        {groupBy === 'area' && st?.Opening_Date && (
                          <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-ink/60" style={{ left: x(st.Opening_Date) }} title={`${st.Store_Name} opening ${fmtDate(st.Opening_Date)}`} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>
      <p className="text-2xs text-ink-3">Bar = start → due date, filled part = progress, colour = status (name shown next to the bar). Red outline = overdue. ◆ = opening milestone. Red line = today.</p>
    </div>
  );
}
