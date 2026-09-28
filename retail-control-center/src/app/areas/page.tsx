'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { areaStats, isAirport, isBlocked, isOverdue, progressOf } from '@/lib/domain/metrics';
import { useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { AirportMark, ProgressBar } from '@/components/ui/badges';
import { Card, Segmented, cn } from '@/components/ui/primitives';

function heat(p: number) {
  if (p >= 100) return 'bg-st-greenBg text-st-green';
  if (p >= 75) return 'bg-sand-200 text-ink';
  if (p >= 50) return 'bg-sand-100 text-ink';
  if (p >= 25) return 'bg-sand-50 text-ink-2';
  return 'bg-paper text-ink-2';
}

export default function FunctionalAreasPage() {
  const m = useModel();
  const router = useRouter();
  const view = (useApp((s) => s.prefs['areas.view']) as 'matrix' | 'summary' | undefined) ?? 'matrix';
  const setPref = useApp((s) => s.setPref);
  const programType = useApp((s) => s.filters.programType);
  const setFilters = useApp((s) => s.setFilters);
  const settings = m.snap.settings;

  const stores = useMemo(() => m.stores.filter((s) => !programType || s.Program_Type === programType), [m.stores, programType]);
  const storeIds = useMemo(() => new Set(stores.map((s) => s.Store_ID)), [stores]);
  const tasks = useMemo(() => m.tasks.filter((t) => storeIds.has(t.Store_ID)), [m.tasks, storeIds]);
  const stats = useMemo(() => areaStats(tasks, m.snap.areas, settings, m.today), [tasks, m.snap.areas, settings, m.today]);

  const cell = useMemo(() => {
    const map = new Map<string, { p: number; n: number; late: number; blocked: number }>();
    const groups = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const k = `${t.Area}|${t.Store_ID}`;
      const l = groups.get(k) ?? [];
      l.push(t);
      groups.set(k, l);
    }
    for (const [k, l] of groups) map.set(k, { p: progressOf(l, settings.Progress_Method), n: l.length, late: l.filter((t) => isOverdue(t, m.today)).length, blocked: l.filter(isBlocked).length });
    return map;
  }, [tasks, settings.Progress_Method, m.today]);

  const avgAcrossStores = (areaId: string) => {
    const vals = stores.map((s) => cell.get(`${areaId}|${s.Store_ID}`)).filter(Boolean) as { p: number }[];
    return vals.length ? Math.round(vals.reduce((a, b) => a + b.p, 0) / vals.length) : 0;
  };

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">How is each function progressing across all openings?</div>
          <h1 className="mt-0.5 text-[1.6rem] font-semibold tracking-tight">Functional Areas</h1>
        </div>
        <div className="flex items-center gap-2">
          <Segmented size="sm" value={programType || 'all'} onChange={(v) => setFilters({ programType: v === 'all' ? '' : v })} options={[{ value: 'all', label: 'All' }, { value: 'New Company', label: 'New Companies' }, { value: 'New Store', label: 'New Stores' }]} />
          <Segmented size="sm" value={view} onChange={(v) => setPref('areas.view', v)} options={[{ value: 'matrix', label: 'Matrix' }, { value: 'summary', label: 'Summary' }]} />
        </div>
      </div>

      {view === 'matrix' ? (
        <Card title="Completion by area and opening" actions={<span className="text-2xs text-ink-3">Click a row for the horizontal SAL, a cell for Store + Area tasks</span>}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[230px] border-b border-line-strong bg-wash px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">Area</th>
                  <th className="border-b border-line-strong bg-wash px-2 py-2 text-right text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">Avg</th>
                  {stores.map((s) => (
                    <th key={s.Store_ID} className="h-[112px] min-w-[52px] border-b border-l border-line-strong bg-wash px-1 align-bottom">
                      <Link href={`/stores/${s.Store_ID}`} className="mx-auto flex w-5 items-end justify-center whitespace-nowrap pb-1 text-2xs font-semibold text-ink-2 [writing-mode:vertical-rl] rotate-180 hover:text-ink" title={s.Store_Name}>
                        {s.Store_Name}
                        {s.Program_Type === 'New Company' ? ' (Co.)' : ''}
                        {isAirport(s) && <AirportMark className="mt-1 h-3 w-3 rotate-45" />}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((a) => (
                  <tr key={a.area.Area_ID} className="group">
                    <td className="sticky left-0 z-10 border-b border-line bg-paper px-3 py-1.5 group-hover:bg-wash">
                      <Link href={`/areas/${a.area.Area_ID}`} className="flex items-center justify-between gap-2 whitespace-nowrap font-medium text-ink hover:underline">
                        {a.area.Area_Name}
                        {a.counts.overdue + a.counts.blocked > 0 && <span className="whitespace-nowrap rounded bg-st-redBg px-1 text-2xs text-st-red">{a.counts.overdue + a.counts.blocked} {a.counts.overdue + a.counts.blocked === 1 ? 'issue' : 'issues'}</span>}
                      </Link>
                    </td>
                    <td className="tnum border-b border-line px-2 text-right font-semibold">{avgAcrossStores(a.area.Area_ID)}%</td>
                    {stores.map((s) => {
                      const c = cell.get(`${a.area.Area_ID}|${s.Store_ID}`);
                      if (!c) return <td key={s.Store_ID} className="border-b border-l border-line text-center text-ink-4">·</td>;
                      return (
                        <td key={s.Store_ID} className="border-b border-l border-line p-0">
                          <button
                            type="button"
                            onClick={() => router.push(`/areas/${a.area.Area_ID}?store=${s.Store_ID}`)}
                            className={cn('tnum relative flex h-8 w-full items-center justify-center font-semibold hover:ring-2 hover:ring-inset hover:ring-sand-500', heat(c.p), c.p === 0 && 'font-normal text-ink-4')}
                            title={`${a.area.Area_Name} · ${s.Store_Name}: ${c.p}% · ${c.n} tasks${c.late ? ` · ${c.late} overdue` : ''}${c.blocked ? ` · ${c.blocked} blocked` : ''}`}
                          >
                            {c.p}
                            {(c.late > 0 || c.blocked > 0) && <span className="absolute right-0 top-0 h-0 w-0 border-l-[8px] border-t-[8px] border-l-transparent border-t-st-red" aria-label="overdue or blocked" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2 text-2xs text-ink-3">
            <span>Completion %:</span>
            {[['0–24', 'bg-paper ring-1 ring-line'], ['25–49', 'bg-sand-50'], ['50–74', 'bg-sand-100'], ['75–99', 'bg-sand-200'], ['100', 'bg-st-greenBg']].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1"><span className={cn('h-3 w-5 rounded-sm', c)} />{l}</span>
            ))}
            <span className="flex items-center gap-1"><span className="h-0 w-0 border-l-[8px] border-t-[8px] border-l-transparent border-t-st-red" /> overdue or blocked</span>
            <span>· dot = no tasks for that area</span>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_80px_64px_80px_70px_70px_80px_80px] gap-3 border-b border-line-strong bg-wash px-4 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
            <span>Area</span><span>Average completion</span><span className="text-right">Stores</span><span className="text-right">Open</span><span className="text-right">Completed</span><span className="text-right">Blocked</span><span className="text-right">Overdue</span><span className="text-right">Due ≤{settings.Due_Soon_Days}d</span><span className="text-right">Decisions</span>
          </div>
          {stats.map((a) => (
            <Link key={a.area.Area_ID} href={`/areas/${a.area.Area_ID}`} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_80px_64px_80px_70px_70px_80px_80px] items-center gap-3 border-b border-line/60 px-4 py-2 text-[13px] hover:bg-wash/60">
              <span className="font-medium">{a.area.Area_Name}</span>
              <ProgressBar value={avgAcrossStores(a.area.Area_ID)} showLabel />
              <span className="tnum text-right">{new Set(a.tasks.map((t) => t.Store_ID)).size}</span>
              <span className="tnum text-right">{a.counts.open}</span>
              <span className="tnum text-right text-st-green">{a.counts.completed}</span>
              <span className={cn('tnum text-right', a.counts.blocked ? 'font-semibold text-st-red' : 'text-ink-4')}>{a.counts.blocked || '–'}</span>
              <span className={cn('tnum text-right', a.counts.overdue ? 'font-semibold text-st-red' : 'text-ink-4')}>{a.counts.overdue || '–'}</span>
              <span className={cn('tnum text-right', a.counts.dueSoon ? 'text-st-amber' : 'text-ink-4')}>{a.counts.dueSoon || '–'}</span>
              <span className={cn('tnum text-right', a.counts.decisions ? 'font-semibold text-st-violet' : 'text-ink-4')}>{a.counts.decisions || '–'}</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
