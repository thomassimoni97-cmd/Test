'use client';

import { AlertOctagon, ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { fmtShort } from '@/lib/domain/dates';
import { areaStats, countTasks, isAirport, isOpeningDone, needsDecision, progressOf, riskRank, storeStats } from '@/lib/domain/metrics';
import { flagText } from '@/lib/domain/schema';
import { useFilteredTasks, useModel } from '@/lib/client/model';
import { useApp, EMPTY_FILTERS } from '@/lib/client/store';
import { KpiStrip } from '@/components/overview/KpiStrip';
import { OpeningsTable } from '@/components/overview/OpeningsTable';
import { ProgramTimeline } from '@/components/overview/ProgramTimeline';
import { RecentChanges } from '@/components/store/RecentChanges';
import { FilterBar } from '@/components/tasks/FilterBar';
import { AirportMark, DaysTo, ProgressBar, RiskBadge } from '@/components/ui/badges';
import { Button, Card, Empty, Segmented, cn } from '@/components/ui/primitives';

export default function ProgramOverviewPage() {
  const m = useModel();
  const router = useRouter();
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const view = (useApp((s) => s.prefs['overview.view']) as 'list' | 'timeline' | undefined) ?? 'timeline';
  const setPref = useApp((s) => s.setPref);
  const presentation = useApp((s) => s.presentation);
  const openNewStore = useApp((s) => s.openNewStore);
  const tasks = useFilteredTasks();
  const settings = m.snap.settings;

  const stores = useMemo(
    () =>
      m.stores.filter(
        (s) =>
          (!filters.store || s.Store_ID === filters.store) &&
          (!filters.country || s.Country === filters.country) &&
          (!filters.programType || s.Program_Type === filters.programType) &&
          (!filters.year || s.Opening_Date.startsWith(filters.year)),
      ),
    [m.stores, filters.store, filters.country, filters.programType, filters.year],
  );
  const taskFilterActive = !!(filters.area || filters.owner || filters.status || filters.risk || filters.q || filters.overdue || filters.blocked || filters.dueSoon || filters.decision);
  const stats = useMemo(() => {
    const ids = new Set(stores.map((s) => s.Store_ID));
    const t = tasks.filter((x) => ids.has(x.Store_ID));
    return stores.map((s) => storeStats(s, t, settings, m.today)).filter((s) => !taskFilterActive || s.tasks.length > 0);
  }, [stores, tasks, settings, m.today, taskFilterActive]);
  const scopeTasks = useMemo(() => stats.flatMap((s) => s.tasks), [stats]);
  const c = countTasks(scopeTasks, m.today, settings.Due_Soon_Days);
  const completedOpenings = stats.filter((s) => isOpeningDone(s.store)).length;

  const attention = useMemo(
    () =>
      stats
        .filter((s) => s.store.Risk_Level === 'High' || s.counts.blocked > 0 || s.counts.overdue > 0)
        .sort((a, b) => riskRank(b.store.Risk_Level) - riskRank(a.store.Risk_Level) || b.counts.blocked + b.counts.overdue - (a.counts.blocked + a.counts.overdue))
        .slice(0, 7),
    [stats],
  );
  const areasBehind = useMemo(
    () =>
      areaStats(scopeTasks, m.snap.areas, settings, m.today)
        .filter((a) => a.counts.overdue > 0 || a.counts.blocked > 0)
        .sort((a, b) => b.counts.overdue + b.counts.blocked - (a.counts.overdue + a.counts.blocked) || a.progress - b.progress)
        .slice(0, 6),
    [scopeTasks, m.snap.areas, settings, m.today],
  );
  const decisions = useMemo(() => scopeTasks.filter(needsDecision).sort((a, b) => (a.Due_Date || '9999').localeCompare(b.Due_Date || '9999')), [scopeTasks]);
  const recent = useMemo(() => {
    const ids = new Set(stats.map((s) => s.store.Store_ID));
    return m.snap.history.filter((h) => ids.has(h.Store_ID)).slice(-40).reverse();
  }, [m.snap.history, stats]);

  const jump = (f: Partial<typeof EMPTY_FILTERS>) => {
    setFilters(f);
    router.push('/actions');
  };

  return (
    <div className="mx-auto max-w-[1760px] space-y-4 px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Where are we overall?</div>
          <h1 className="mt-0.5 text-[1.6rem] font-semibold tracking-tight">Program Overview</h1>
        </div>
        <div className="flex items-center gap-2">
          {!presentation && (
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openNewStore}>
              New opening
            </Button>
          )}
        </div>
      </div>
      <FilterBar show={['q', 'year', 'programType', 'store', 'country', 'area', 'owner', 'status', 'risk']} />

      <KpiStrip
        items={[
          { label: 'Total openings', value: stats.length, sub: `${stats.filter((s) => s.store.Program_Type === 'New Company').length} companies · ${stats.filter((s) => s.store.Program_Type !== 'New Company').length} stores` },
          { label: 'Openings completed', value: completedOpenings, tone: completedOpenings ? 'green' : undefined, sub: 'Overall status Opened' },
          { label: 'Openings in progress', value: stats.length - completedOpenings, sub: `${stats.filter((s) => s.store.Opening_Date_Status === 'Confirmed').length} dates confirmed` },
          { label: 'Overall completion', value: `${progressOf(scopeTasks, settings.Progress_Method)}%`, sub: settings.Progress_Method === 'weighted' ? 'Weighted by task weight' : 'Simple average' },
          { label: 'Blocked tasks', value: c.blocked, tone: c.blocked ? 'red' : undefined, onClick: () => jump({ blocked: true }), title: 'Open in Action Log' },
          { label: 'Overdue tasks', value: c.overdue, tone: c.overdue ? 'red' : undefined, onClick: () => jump({ overdue: true }), title: 'Open in Action Log' },
          { label: `Due next ${settings.Due_Soon_Days} days`, value: c.dueSoon, tone: c.dueSoon ? 'amber' : undefined, onClick: () => jump({ dueSoon: true }), title: 'Open in Action Log' },
          { label: 'Decisions required', value: c.decisions, tone: c.decisions ? 'violet' : undefined, onClick: () => jump({ decision: true }), title: 'Open in Action Log' },
        ]}
      />

      <div className="grid grid-cols-12 gap-4">
        <Card
          className="col-span-12 overflow-hidden 2xl:col-span-8"
          title={view === 'timeline' ? 'Program opening timeline' : 'Openings'}
          actions={<Segmented size="sm" value={view} onChange={(v) => setPref('overview.view', v)} options={[{ value: 'timeline', label: 'Timeline' }, { value: 'list', label: 'Opening overview' }]} />}
        >
          {view === 'timeline' ? <ProgramTimeline stats={stats} today={m.today} /> : <OpeningsTable stats={stats} />}
        </Card>

        <div className="col-span-12 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:col-span-4 2xl:grid-cols-1">
          <Card title="Openings needing attention" actions={<span className="text-2xs text-ink-3">High risk · blockers · overdue</span>}>
            {attention.length === 0 ? (
              <Empty compact title="No opening at risk" body="No high-risk opening, no blockers and no overdue activities." />
            ) : (
              <ul className="divide-y divide-line/70">
                {attention.map((s) => (
                  <li key={s.store.Store_ID}>
                    <Link href={`/stores/${s.store.Store_ID}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 hover:bg-wash/60">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
                          {s.store.Store_Name} {isAirport(s.store) && <AirportMark />}
                          {s.store.Program_Type === 'New Company' && <span className="rounded-sm border border-sand-300 px-1 text-[10px] font-semibold uppercase tracking-wide text-sand-700">Company</span>}
                          <span className="text-2xs font-normal text-ink-3">· <DaysTo days={s.daysToOpening} /> to opening</span>
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-2xs">
                          {s.counts.blocked > 0 && <span className="font-semibold text-st-red">{s.counts.blocked} blocked</span>}
                          {s.counts.overdue > 0 && <span className="font-semibold text-st-red">{s.counts.overdue} overdue</span>}
                          {s.counts.decisions > 0 && <span className="font-semibold text-st-violet">{s.counts.decisions} decisions</span>}
                          <span className="text-ink-3">{s.progress}% complete</span>
                        </p>
                      </div>
                      <RiskBadge level={s.store.Risk_Level} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Functional areas behind" actions={<Link href="/areas" className="text-xs text-ink-3 hover:text-ink">All areas →</Link>}>
            {areasBehind.length === 0 ? (
              <Empty compact title="No area behind" body="No overdue or blocked activities in any area." />
            ) : (
              <ul className="divide-y divide-line/70">
                {areasBehind.map((a) => (
                  <li key={a.area.Area_ID}>
                    <Link href={`/areas/${a.area.Area_ID}`} className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-3 px-4 py-2 hover:bg-wash/60">
                      <span className="truncate text-[13px] font-medium">{a.area.Area_Name}</span>
                      <ProgressBar value={a.progress} showLabel height={5} />
                      <span className="flex gap-2 text-2xs">
                        {a.counts.overdue > 0 && <span className="font-semibold text-st-red">{a.counts.overdue} late</span>}
                        {a.counts.blocked > 0 && <span className="inline-flex items-center gap-0.5 font-semibold text-st-red"><AlertOctagon className="h-3 w-3" />{a.counts.blocked}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Decisions required" actions={decisions.length > 0 && <button type="button" onClick={() => jump({ decision: true })} className="text-xs text-ink-3 hover:text-ink">All {decisions.length} →</button>}>
            {decisions.length === 0 ? (
              <Empty compact title="No decisions required" />
            ) : (
              <ul className="divide-y divide-line/70">
                {decisions.slice(0, 6).map((t) => (
                  <li key={t.Task_ID}>
                    <button type="button" onClick={() => useApp.getState().openTask(t.Task_ID)} className="w-full px-4 py-2 text-left hover:bg-wash/60">
                      <p className="flex items-center gap-1.5 text-2xs text-ink-3">
                        <span className="font-semibold text-ink-2">{m.storesById.get(t.Store_ID)?.Store_Name}</span>· {m.areasById.get(t.Area)?.Area_Name} · {t.Owner} {t.Due_Date && <>· due {fmtShort(t.Due_Date)}</>}
                      </p>
                      <p className="truncate text-[13px] font-medium">{t.Task_Title}</p>
                      {flagText(t.Decision_Required) && <p className="truncate text-xs text-st-violet">{flagText(t.Decision_Required)}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title="Recent changes" actions={<Link href="/history" className={cn('inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink')}>History <ArrowRight className="h-3 w-3" /></Link>}>
        <div className="max-h-[380px] overflow-y-auto">
          <RecentChanges entries={recent} m={m} limit={25} dense />
        </div>
      </Card>
    </div>
  );
}
