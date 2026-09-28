'use client';

import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo } from 'react';
import { addDaysISO, fmtShort } from '@/lib/domain/dates';
import { countTasks, isAirport, isOpen, needsDecision, progressOf, storeStats } from '@/lib/domain/metrics';
import { flagText } from '@/lib/domain/schema';
import { useFilteredTasks, useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { KpiStrip } from '@/components/overview/KpiStrip';
import { ActionLogTable } from '@/components/tasks/ActionLogTable';
import { FilterBar } from '@/components/tasks/FilterBar';
import { AirportMark, DaysTo, OpeningDate, ProgressBar, RiskBadge } from '@/components/ui/badges';
import { Button, Card, Empty, Kbd, cn } from '@/components/ui/primitives';

export default function AreaPage() {
  return (
    <Suspense>
      <AreaPageInner />
    </Suspense>
  );
}

function AreaPageInner() {
  const { areaId } = useParams<{ areaId: string }>();
  const search = useSearchParams();
  const selectedStore = search.get('store') ?? '';
  const router = useRouter();
  const m = useModel();
  const presentation = useApp((s) => s.presentation);
  const openTask = useApp((s) => s.openTask);
  const openNewTask = useApp((s) => s.openNewTask);
  const programType = useApp((s) => s.filters.programType);
  const area = m.areasById.get(areaId);
  const settings = m.snap.settings;
  const areasWithTasks = useMemo(() => m.snap.areas.filter((a) => a.Active && m.tasks.some((t) => t.Area === a.Area_ID)), [m]);

  const areaTasks = useMemo(() => m.tasks.filter((t) => t.Area === areaId && (!programType || m.storesById.get(t.Store_ID)?.Program_Type === programType)), [m, areaId, programType]);
  const perStore = useMemo(
    () =>
      m.stores
        .map((s) => storeStats(s, areaTasks, settings, m.today))
        .filter((s) => s.tasks.length > 0),
    [m.stores, areaTasks, settings, m.today],
  );
  const c = countTasks(areaTasks, m.today, settings.Due_Soon_Days);
  const avg = perStore.length ? Math.round(perStore.reduce((a, b) => a + b.progress, 0) / perStore.length) : 0;
  const upcoming = useMemo(() => areaTasks.filter((t) => isOpen(t) && t.Due_Date && t.Due_Date >= m.today && t.Due_Date <= addDaysISO(m.today, 30)).sort((a, b) => a.Due_Date.localeCompare(b.Due_Date)), [areaTasks, m.today]);
  const decisions = useMemo(() => areaTasks.filter(needsDecision), [areaTasks]);
  const tableTasks = useFilteredTasks({ area: areaId, store: selectedStore });
  const tableScoped = useMemo(() => tableTasks.filter((t) => !programType || m.storesById.get(t.Store_ID)?.Program_Type === programType), [tableTasks, programType, m.storesById]);

  const idx = areasWithTasks.findIndex((a) => a.Area_ID === areaId);
  const prev = areasWithTasks[(idx - 1 + areasWithTasks.length) % areasWithTasks.length];
  const next = areasWithTasks[(idx + 1) % areasWithTasks.length];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (/input|textarea|select/i.test(el.tagName) || e.metaKey || e.ctrlKey || useApp.getState().drawer) return;
      if (e.key === 'ArrowRight' && next) router.push(`/areas/${next.Area_ID}`);
      if (e.key === 'ArrowLeft' && prev) router.push(`/areas/${prev.Area_ID}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, router]);

  if (!area) return <div className="p-8"><Empty title={`Area “${areaId}” not found`} action={<Link href="/areas"><Button>All areas</Button></Link>} /></div>;

  const setStore = (id: string) => router.replace(id ? `/areas/${areaId}?store=${id}` : `/areas/${areaId}`, { scroll: false });

  return (
    <div className="mx-auto max-w-[1760px] space-y-4 px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Horizontal SAL · one function, all openings</div>
          <h1 className="mt-0.5 font-display text-[2.4rem] font-semibold uppercase leading-none tracking-[0.02em]">{area.Area_Name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {prev && (
            <Link href={`/areas/${prev.Area_ID}`}><Button size="sm" icon={<ChevronLeft className="h-3.5 w-3.5" />}>{prev.Area_Name}</Button></Link>
          )}
          {next && (
            <Link href={`/areas/${next.Area_ID}`}><Button size="sm">{next.Area_Name}<ChevronRight className="h-3.5 w-3.5" /></Button></Link>
          )}
          {presentation && <span className="ml-2 text-2xs text-ink-3"><Kbd>←</Kbd> <Kbd>→</Kbd> areas</span>}
        </div>
      </div>

      <KpiStrip
        items={[
          { label: 'Average completion', value: `${avg}%`, sub: 'Mean of openings' },
          { label: 'Stores impacted', value: perStore.length },
          { label: 'Open tasks', value: c.open },
          { label: 'Completed', value: c.completed, tone: 'green' },
          { label: 'Blocked', value: c.blocked, tone: c.blocked ? 'red' : undefined },
          { label: 'Overdue', value: c.overdue, tone: c.overdue ? 'red' : undefined },
          { label: 'Upcoming (30d)', value: upcoming.length, tone: upcoming.length ? 'amber' : undefined },
          { label: 'Decisions required', value: c.decisions, tone: c.decisions ? 'violet' : undefined },
        ]}
      />

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-7" title="Openings" actions={<span className="text-2xs text-ink-3">Click to filter tasks · {progressOf(areaTasks, settings.Progress_Method)}% overall</span>}>
          {perStore.length === 0 ? (
            <Empty compact title="No tasks for this area" body="No opening has activities in this functional area yet." />
          ) : (
            <ul className="max-h-[420px] divide-y divide-line/70 overflow-y-auto">
              <li className="sticky top-0 z-10 grid grid-cols-[minmax(0,1.2fr)_158px_52px_minmax(0,1fr)_36px_36px_36px_76px] gap-3 bg-paper px-4 py-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-4">
                <span>Opening</span><span>Opening date</span><span className="text-right">Days</span><span>Area completion</span><span className="text-right">Open</span><span className="text-right" title="Blocked">Blk</span><span className="text-right" title="Overdue">Late</span><span>Risk</span>
              </li>
              {perStore.map((s) => {
                const active = selectedStore === s.store.Store_ID;
                return (
                  <li key={s.store.Store_ID}>
                    <button type="button" onClick={() => setStore(active ? '' : s.store.Store_ID)} aria-pressed={active} className={cn('grid w-full grid-cols-[minmax(0,1.2fr)_158px_52px_minmax(0,1fr)_36px_36px_36px_76px] items-center gap-3 px-4 py-2 text-left text-[13px]', active ? 'bg-sand-50 shadow-[inset_3px_0_0_#B08D57]' : 'hover:bg-wash/60')}>
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold" title={s.store.Store_Name}><span className="truncate">{s.store.Store_Name}</span>{s.store.Program_Type === 'New Company' && <span className="text-2xs font-normal text-ink-3">Co.</span>} {isAirport(s.store) && <AirportMark />}</span>
                      <OpeningDate date={s.store.Opening_Date} status={s.store.Opening_Date_Status} withIcon={false} className="text-xs text-ink-2" />
                      <span className="text-right text-xs"><DaysTo days={s.daysToOpening} /></span>
                      <ProgressBar value={s.progress} showLabel />
                      <span className="tnum text-right text-xs text-ink-2" title="Open">{s.counts.open}</span>
                      <span className={cn('tnum text-right text-xs', s.counts.blocked ? 'font-semibold text-st-red' : 'text-ink-4')} title="Blocked">{s.counts.blocked || '–'}</span>
                      <span className={cn('tnum text-right text-xs', s.counts.overdue ? 'font-semibold text-st-red' : 'text-ink-4')} title="Overdue">{s.counts.overdue || '–'}</span>
                      <RiskBadge level={s.store.Risk_Level} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <div className="col-span-12 grid gap-4 xl:col-span-5">
          <Card title="Upcoming deadlines · 30 days">
            {upcoming.length === 0 ? <Empty compact title="No deadlines in the next 30 days" /> : (
              <ul className="max-h-[190px] divide-y divide-line/70 overflow-y-auto">
                {upcoming.slice(0, 20).map((t) => (
                  <li key={t.Task_ID}>
                    <button type="button" onClick={() => openTask(t.Task_ID)} className="grid w-full grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-1.5 text-left text-[13px] hover:bg-wash/60">
                      <span className="tnum text-xs font-semibold">{fmtShort(t.Due_Date)}</span>
                      <span className="truncate"><span className="text-ink-3">{m.storesById.get(t.Store_ID)?.Store_Name} · </span>{t.Task_Title}</span>
                      <span className="text-2xs text-ink-3">{t.Owner}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Decisions required">
            {decisions.length === 0 ? <Empty compact title="No decisions required" /> : (
              <ul className="max-h-[160px] divide-y divide-line/70 overflow-y-auto">
                {decisions.map((t) => (
                  <li key={t.Task_ID}>
                    <button type="button" onClick={() => openTask(t.Task_ID)} className="w-full px-4 py-1.5 text-left hover:bg-wash/60">
                      <p className="truncate text-[13px] font-medium"><span className="text-ink-3">{m.storesById.get(t.Store_ID)?.Store_Name} · </span>{t.Task_Title}</p>
                      {flagText(t.Decision_Required) && <p className="truncate text-xs text-st-violet">{flagText(t.Decision_Required)}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em]">Tasks · {area.Area_Name}{selectedStore && ` · ${m.storesById.get(selectedStore)?.Store_Name}`}</h2>
          {selectedStore && <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setStore('')}>All openings</Button>}
          {!presentation && <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openNewTask({ Area: areaId, Store_ID: selectedStore || undefined })}>New task</Button>}
        </div>
        <FilterBar show={['q', 'owner', 'status', 'risk', 'overdue', 'blocked', 'dueSoon', 'decision']} compact />
        <ActionLogTable tasks={tableScoped} prefKey="area.log" showStore defaultGroup={selectedStore ? 'none' : 'store'} maxHeight="70vh" exportName={`${areaId}-tasks`} defaultHidden={['desc', 'start', 'area']} />
      </section>
    </div>
  );
}
