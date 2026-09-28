'use client';

import { AlertOctagon, CalendarClock, Clock, Gavel, History } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { addDaysISO, fmtDate, fmtShort } from '@/lib/domain/dates';
import { delayDays, isBlocked, isDueSoon, isOverdue, needsDecision } from '@/lib/domain/metrics';
import { detectChanges, firstSalBaseline, resolveBaseline, summaryFor, type StructuredMinutes } from '@/lib/domain/minutes';
import { flagText } from '@/lib/domain/schema';
import type { Store, Task } from '@/lib/domain/types';
import type { Model } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { DelayBadge, StatusPill } from '@/components/ui/badges';
import { Card, Empty, cn } from '@/components/ui/primitives';

export type FocusTab = 'blockers' | 'overdue' | 'dueSoon' | 'decisions' | 'changes';

/** Changes since the last confirmed SAL (or the last 7 days when no SAL exists yet). */
export function useSinceLastSal(store: Store | undefined, m: Model): StructuredMinutes | null {
  return useMemo(() => {
    if (!store) return null;
    const baseline = resolveBaseline(m.snap.sals, store.Store_ID) ?? firstSalBaseline({ startDate: addDaysISO(m.today, -7) });
    return detectChanges({ store, tasks: m.snap.tasks, history: m.snap.history, areas: m.snap.areas, settings: m.snap.settings, baseline, now: new Date(), today: m.today });
  }, [store, m]);
}

export function SalFocus({ tasks, m, since, className }: { tasks: Task[]; m: Model; since: StructuredMinutes | null; className?: string }) {
  const openTask = useApp((s) => s.openTask);
  const tab = (useApp((s) => s.prefs['sal.focusTab']) as FocusTab | undefined) ?? 'blockers';
  const setPref = useApp((s) => s.setPref);
  const days = m.snap.settings.Due_Soon_Days;

  const lists = useMemo(() => {
    const byDue = (a: Task, b: Task) => (a.Due_Date || '9999').localeCompare(b.Due_Date || '9999');
    return {
      blockers: tasks.filter(isBlocked).sort(byDue),
      overdue: tasks.filter((t) => isOverdue(t, m.today)).sort(byDue),
      dueSoon: tasks.filter((t) => isDueSoon(t, m.today, days)).sort(byDue),
      decisions: tasks.filter(needsDecision).sort(byDue),
    };
  }, [tasks, m.today, days]);
  const changes = since?.areas.flatMap((a) => a.items.map((i) => ({ item: i, area: a.area.Area_Name }))).sort((a, b) => a.item.rank - b.item.rank) ?? [];

  const tabs: { id: FocusTab; label: string; count: number; icon: React.ElementType; tone: string }[] = [
    { id: 'blockers', label: 'Blockers', count: lists.blockers.length, icon: AlertOctagon, tone: 'text-st-red' },
    { id: 'overdue', label: 'Overdue', count: lists.overdue.length, icon: Clock, tone: 'text-st-red' },
    { id: 'dueSoon', label: `Due ≤ ${days}d`, count: lists.dueSoon.length, icon: CalendarClock, tone: 'text-st-amber' },
    { id: 'decisions', label: 'Decisions', count: lists.decisions.length, icon: Gavel, tone: 'text-st-violet' },
    { id: 'changes', label: since?.baseline.isFirst ? 'Last 7 days' : 'Since last SAL', count: changes.length, icon: History, tone: 'text-st-blue' },
  ];

  // keyboard: 1..5 switch focus tabs (useful when presenting)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (/input|textarea|select/i.test(el.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < tabs.length) setPref('sal.focusTab', tabs[i].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPref]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = (t: Task, extra?: React.ReactNode) => {
    const delay = delayDays(t, m.today);
    return (
      <li key={t.Task_ID}>
        <button type="button" onClick={() => openTask(t.Task_ID)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-2 text-left hover:bg-wash/60">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-2xs text-ink-3">
              <span className="font-mono font-semibold text-ink-2">{t.Task_ID}</span>
              <span className="truncate">· {m.areasById.get(t.Area)?.Area_Name ?? t.Area}</span>
            </div>
            <p className="truncate text-[13px] font-medium text-ink">{t.Task_Title}</p>
            {extra && <p className="mt-0.5 line-clamp-2 text-xs">{extra}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusPill status={t.Status} size="sm" />
            <span className="flex items-center gap-1.5 text-2xs text-ink-3">
              <span className="max-w-[120px] truncate">{t.Owner || 'Unassigned'}</span>
              <span className={cn('tnum', delay && 'font-semibold text-st-red')}>{t.Due_Date ? fmtShort(t.Due_Date) : '—'}</span>
              {delay ? <DelayBadge days={delay} /> : null}
            </span>
          </div>
        </button>
      </li>
    );
  };

  const body = () => {
    switch (tab) {
      case 'blockers':
        return lists.blockers.length ? <ul className="divide-y divide-line/70">{lists.blockers.map((t) => row(t, flagText(t.Blocker) && <span className="text-st-red">{flagText(t.Blocker)}</span>))}</ul> : <Empty compact title="No blockers" body="Nothing is currently blocking this opening." />;
      case 'overdue':
        return lists.overdue.length ? <ul className="divide-y divide-line/70">{lists.overdue.map((t) => row(t))}</ul> : <Empty compact title="No overdue activities" body="Every open activity is within its due date." />;
      case 'dueSoon':
        return lists.dueSoon.length ? <ul className="divide-y divide-line/70">{lists.dueSoon.map((t) => row(t))}</ul> : <Empty compact title={`No tasks due within ${days} days`} />;
      case 'decisions':
        return lists.decisions.length ? <ul className="divide-y divide-line/70">{lists.decisions.map((t) => row(t, flagText(t.Decision_Required) && <span className="text-st-violet">{flagText(t.Decision_Required)}</span>))}</ul> : <Empty compact title="No decisions required" />;
      case 'changes':
        return changes.length ? (
          <ul className="divide-y divide-line/70">{changes.map(({ item }) => row(item.task, <span className="text-ink-2">{summaryFor(item)}</span>))}</ul>
        ) : (
          <Empty compact title={since?.baseline.isFirst ? 'No changes in the last 7 days' : 'No changes since the previous SAL'} body={since?.baseline.previousSalDate ? `Previous SAL: ${fmtDate(since.baseline.previousSalDate)}` : undefined} />
        );
    }
  };

  return (
    <Card className={cn('flex flex-col', className)} title="SAL focus" actions={<span className="text-2xs text-ink-3">What needs discussion</span>}>
      <div className="grid grid-cols-5 border-b border-line" role="tablist">
        {tabs.map((t, i) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPref('sal.focusTab', t.id)}
              className={cn('relative flex flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors', active ? 'bg-paper' : 'bg-wash/50 hover:bg-wash', i > 0 && 'border-l border-line')}
              title={`${t.label} (key ${i + 1})`}
            >
              {active && <span className="absolute inset-x-0 top-0 h-[2px] bg-ink" aria-hidden />}
              <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                <Icon className={cn('h-3 w-3', t.count ? t.tone : 'text-ink-4')} /> {t.label}
              </span>
              <span className={cn('tnum text-xl font-semibold leading-none', t.count ? (t.id === 'changes' ? 'text-ink' : t.tone) : 'text-ink-4')}>{t.count}</span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </Card>
  );
}
