'use client';

import { addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toISODate } from '@/lib/domain/dates';
import { isOverdue } from '@/lib/domain/metrics';
import type { Task } from '@/lib/domain/types';
import { useFilteredTasks, useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { FilterBar } from '@/components/tasks/FilterBar';
import { TONE, StatusPill } from '@/components/ui/badges';
import { Button, Card, Segmented, cn } from '@/components/ui/primitives';

export default function CalendarPage() {
  const m = useModel();
  const tasks = useFilteredTasks();
  const openTask = useApp((s) => s.openTask);
  const mode = (useApp((s) => s.prefs['calendar.mode']) as 'month' | 'week' | undefined) ?? 'month';
  const setPref = useApp((s) => s.setPref);
  const storeFilter = useApp((s) => s.filters.store);
  const [cursor, setCursor] = useState(() => parseISO(m.today));
  const [expanded, setExpanded] = useState<string | null>(null);

  const days = useMemo(() => {
    if (mode === 'week') return eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) });
    return eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) });
  }, [cursor, mode]);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.Due_Date) continue;
      const l = map.get(t.Due_Date) ?? [];
      l.push(t);
      map.set(t.Due_Date, l);
    }
    return map;
  }, [tasks]);
  const openings = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of m.stores) {
      if (!s.Opening_Date || (storeFilter && s.Store_ID !== storeFilter)) continue;
      map.set(s.Opening_Date, [...(map.get(s.Opening_Date) ?? []), `${s.Store_Name}${s.Opening_Date_Status !== 'Confirmed' ? ` (${s.Opening_Date_Status})` : ''}`]);
    }
    return map;
  }, [m.stores, storeFilter]);

  const step = (dir: 1 | -1) => setCursor((c) => (mode === 'week' ? addWeeks(c, dir) : addMonths(c, dir)));
  const limit = mode === 'week' ? 40 : 4;
  const noDate = tasks.filter((t) => !t.Due_Date).length;

  const chip = (t: Task) => {
    const st = m.storesById.get(t.Store_ID);
    const tone = TONE[m.statusDefs.get(t.Status)?.tone ?? 'grey'];
    const late = isOverdue(t, m.today);
    return (
      <button
        key={t.Task_ID}
        type="button"
        onClick={() => openTask(t.Task_ID)}
        title={`${t.Task_ID} · ${t.Task_Title}\n${st?.Store_Name} · ${m.areasById.get(t.Area)?.Area_Name} · ${t.Status} · ${t.Owner}`}
        className={cn('flex w-full items-center gap-1.5 rounded px-1.5 py-[3px] text-left text-[11.5px] leading-tight hover:ring-1 hover:ring-sand-400', tone.bg, late && 'ring-1 ring-st-red/50')}
      >
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} />
        {mode === 'week' ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{t.Task_Title}</span>
            <span className="block truncate text-2xs text-ink-3">{st?.Store_Name} · {m.areasById.get(t.Area)?.Area_Name} · {t.Status}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-ink"><span className="font-semibold">{t.Store_ID}</span> {t.Task_Title}</span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-3 px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Tasks by due date</div>
          <h1 className="mt-0.5 text-[1.6rem] font-semibold tracking-tight">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCursor(parseISO(m.today))}>Today</Button>
          <div className="flex items-center">
            <Button size="sm" variant="ghost" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="w-40 text-center text-sm font-semibold">{mode === 'week' ? `${format(days[0], 'dd MMM')} – ${format(days[6], 'dd MMM yyyy')}` : format(cursor, 'MMMM yyyy')}</span>
            <Button size="sm" variant="ghost" onClick={() => step(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Segmented size="sm" value={mode} onChange={(v) => setPref('calendar.mode', v)} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} />
        </div>
      </div>
      <FilterBar show={['q', 'store', 'area', 'owner', 'status', 'risk', 'overdue', 'blocked', 'decision']} />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-wash text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
        </div>
        <div className={cn('grid grid-cols-7', mode === 'week' ? 'min-h-[60vh]' : '')}>
          {days.map((d) => {
            const iso = toISODate(d);
            const list = byDay.get(iso) ?? [];
            const isToday = iso === m.today;
            const showAll = expanded === iso;
            const shown = showAll ? list : list.slice(0, limit);
            return (
              <div key={iso} className={cn('min-h-[118px] border-b border-r border-line/70 p-1.5', mode === 'month' && !isSameMonth(d, cursor) && 'bg-wash/40', d.getDay() === 0 || d.getDay() === 6 ? 'bg-ivory' : '')}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn('tnum flex h-6 w-6 items-center justify-center rounded-full text-xs', isToday ? 'bg-ink font-semibold text-ivory' : 'text-ink-2')}>{format(d, 'd')}</span>
                  {list.length > 0 && <span className="text-2xs text-ink-4">{list.length}</span>}
                </div>
                {openings.get(iso)?.map((o) => (
                  <div key={o} className="mb-1 flex items-center gap-1 rounded bg-ink px-1.5 py-[3px] text-2xs font-semibold text-ivory" title="Opening milestone">
                    <Flag className="h-3 w-3" /> <span className="truncate">Opening · {o}</span>
                  </div>
                ))}
                <div className="space-y-1">{shown.map(chip)}</div>
                {list.length > shown.length && (
                  <button type="button" className="mt-1 text-2xs font-medium text-sand-700 hover:underline" onClick={() => setExpanded(iso)}>+{list.length - shown.length} more</button>
                )}
                {showAll && list.length > limit && <button type="button" className="mt-1 text-2xs text-ink-3 hover:underline" onClick={() => setExpanded(null)}>show less</button>}
              </div>
            );
          })}
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-3 text-2xs text-ink-3">
        {m.activeStatuses.map((s) => <StatusPill key={s.name} status={s.name} size="sm" />)}
        <span className="flex items-center gap-1"><span className="h-3 w-5 rounded ring-1 ring-st-red/50" /> overdue</span>
        {noDate > 0 && <span>· {noDate} filtered tasks have no due date</span>}
        <span className="ml-auto">Weeks start on Monday</span>
      </div>
    </div>
  );
}
