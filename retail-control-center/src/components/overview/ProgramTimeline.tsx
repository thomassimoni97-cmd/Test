'use client';

import { addMonths, differenceInCalendarDays, format, parseISO, startOfMonth } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { fmtDate } from '@/lib/domain/dates';
import { isAirport, type StoreStat } from '@/lib/domain/metrics';
import type { Store } from '@/lib/domain/types';
import { AirportMark, RiskBadge } from '@/components/ui/badges';
import { Empty, cn } from '@/components/ui/primitives';

const MONTH_W = 46;
const ROW_H = 38;
const LABEL_W = 236;

/**
 * High-level program timeline inspired by the Retail Program slides:
 * years / quarters / months on the x-axis, openings grouped by New Companies / New Stores,
 * planned activity bar (with progress), opening milestone (confirmed ◆ / tentative ◇ / TBD hatched), today marker.
 */
export function ProgramTimeline({ stats, today }: { stats: StoreStat[]; today: string }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { start, months, groups } = useMemo(() => {
    const dates = stats.flatMap((s) => [s.programStart, s.store.Opening_Date]).filter(Boolean).sort();
    const min = dates[0] && dates[0] < today ? dates[0] : today;
    const max = dates[dates.length - 1] && dates[dates.length - 1] > today ? dates[dates.length - 1] : today;
    const start = startOfMonth(addMonths(parseISO(min), -1));
    const end = startOfMonth(addMonths(parseISO(max), 2));
    const months: Date[] = [];
    for (let d = start; d < end; d = addMonths(d, 1)) months.push(d);
    const groups: { label: string; rows: StoreStat[] }[] = [
      { label: 'New Companies', rows: stats.filter((s) => s.store.Program_Type === 'New Company') },
      { label: 'New Stores', rows: stats.filter((s) => s.store.Program_Type !== 'New Company') },
    ].filter((g) => g.rows.length);
    return { start, months, groups };
  }, [stats, today]);

  const x = (iso: string) => {
    const d = parseISO(iso);
    let i = months.findIndex((m, k) => d >= m && (k === months.length - 1 || d < months[k + 1]));
    if (i < 0) i = d < start ? 0 : months.length - 1;
    const m0 = months[i];
    const dim = differenceInCalendarDays(addMonths(m0, 1), m0);
    return i * MONTH_W + (differenceInCalendarDays(d, m0) / dim) * MONTH_W;
  };
  const width = months.length * MONTH_W;
  const todayX = x(today);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, todayX - 3 * MONTH_W);
  }, [todayX]);

  if (!stats.length) return <Empty title="No openings match the current filters." compact />;

  // header rows: years, quarters, months
  const years: { label: string; from: number; span: number }[] = [];
  const quarters: { label: string; from: number; span: number }[] = [];
  months.forEach((m, i) => {
    const y = format(m, 'yyyy');
    const q = `Q${Math.floor(m.getMonth() / 3) + 1}`;
    if (years[years.length - 1]?.label === y) years[years.length - 1].span++;
    else years.push({ label: y, from: i, span: 1 });
    const qk = `${y}-${q}`;
    if (quarters[quarters.length - 1]?.label === qk) quarters[quarters.length - 1].span++;
    else quarters.push({ label: qk, from: i, span: 1 });
  });

  const bar = (s: StoreStat) => {
    const st: Store = s.store;
    if (!st.Opening_Date) return null;
    const from = s.programStart && s.programStart < st.Opening_Date ? s.programStart : st.Opening_Date;
    const left = x(from);
    const right = x(st.Opening_Date);
    const w = Math.max(4, right - left);
    const status = st.Opening_Date_Status;
    return (
      <>
        <div
          className={cn('absolute top-1/2 h-3.5 -translate-y-1/2 overflow-hidden rounded-sm', status === 'Confirmed' ? 'bg-sand-200' : 'hatch bg-sand-100')}
          style={{ left, width: w }}
          title={`Activities ${fmtDate(from)} → opening ${fmtDate(st.Opening_Date)} · ${s.progress}% complete`}
        >
          <div className="h-full bg-sand-500/90" style={{ width: `${s.progress}%` }} />
        </div>
        {/* milestone */}
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: right }} title={`Opening ${fmtDate(st.Opening_Date)} (${status})`}>
          <div className={cn('h-3.5 w-3.5 rotate-45 border-2', status === 'Confirmed' ? 'border-ink bg-ink' : status === 'Tentative' ? 'border-ink bg-paper' : 'border-dashed border-ink-3 bg-paper')} />
        </div>
        <div className="tnum absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-3 text-2xs font-semibold text-ink-2" style={{ left: right }}>
          {format(parseISO(st.Opening_Date), 'dd MMM yy')}
          {status !== 'Confirmed' && <span className="ml-1 font-normal italic text-sand-700">{status}</span>}
          <span className="ml-1.5 font-normal text-ink-3">{s.progress}%</span>
        </div>
      </>
    );
  };

  return (
    <div>
      <div className="flex">
        {/* labels */}
        <div className="shrink-0 border-r border-line" style={{ width: LABEL_W }}>
          <div className="h-[66px] border-b border-line-strong bg-wash px-3 pt-2">
            <span className="eyebrow">Opening</span>
          </div>
          {groups.map((g) => (
            <div key={g.label}>
              <div className="flex h-7 items-center bg-sand-50 px-3 text-2xs font-bold uppercase tracking-[0.14em] text-sand-700">{g.label}</div>
              {g.rows.map((s) => (
                <button
                  key={s.store.Store_ID}
                  type="button"
                  onClick={() => router.push(`/stores/${s.store.Store_ID}`)}
                  className="flex w-full items-center gap-2 border-b border-line/60 px-3 text-left hover:bg-wash/60"
                  style={{ height: ROW_H }}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {s.store.Store_Name} {isAirport(s.store) && <AirportMark className="ml-0.5" />}
                  </span>
                  <RiskBadge level={s.store.Risk_Level} label={false} />
                </button>
              ))}
            </div>
          ))}
        </div>
        {/* grid */}
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ width }} className="relative">
            <div className="h-[66px] border-b border-line-strong bg-wash">
              <div className="relative h-[22px]">
                {years.map((y) => (
                  <div key={y.label} className="absolute top-0 h-full border-l border-line-strong px-2 text-2xs font-bold text-ink" style={{ left: y.from * MONTH_W, width: y.span * MONTH_W }}>
                    <span className="leading-[22px]">{y.label}</span>
                  </div>
                ))}
              </div>
              <div className="relative h-[22px]">
                {quarters.map((q) => (
                  <div key={q.label} className="absolute top-0 h-full border-l border-line px-2 text-2xs font-semibold text-ink-3" style={{ left: q.from * MONTH_W, width: q.span * MONTH_W }}>
                    <span className="leading-[22px]">{q.label.split('-')[1]}</span>
                  </div>
                ))}
              </div>
              <div className="relative h-[22px]">
                {months.map((m, i) => (
                  <div key={i} className="absolute top-0 h-full border-l border-line/70 text-center text-2xs text-ink-3" style={{ left: i * MONTH_W, width: MONTH_W }}>
                    <span className="leading-[22px]">{format(m, 'MMM')}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* column guides */}
            <div className="pointer-events-none absolute bottom-0 top-[66px] w-full">
              {months.map((m, i) => (
                <div key={i} className={cn('absolute bottom-0 top-0 border-l', m.getMonth() === 0 ? 'border-line-strong' : m.getMonth() % 3 === 0 ? 'border-line' : 'border-line/40')} style={{ left: i * MONTH_W }} />
              ))}
              <div className="absolute bottom-0 top-0 z-10 w-px bg-st-red" style={{ left: todayX }}>
                <span className="absolute -top-0 left-1 whitespace-nowrap rounded-sm bg-st-red px-1 text-[10px] font-semibold uppercase tracking-wide text-white">Today</span>
              </div>
            </div>
            {groups.map((g) => (
              <div key={g.label}>
                <div className="h-7 bg-sand-50/60" />
                {g.rows.map((s) => (
                  <div key={s.store.Store_ID} className="relative border-b border-line/60" style={{ height: ROW_H }}>
                    {bar(s)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-line px-3 py-2 text-2xs text-ink-3">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 bg-ink" /> Confirmed opening</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 border-2 border-ink bg-paper" /> Tentative</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 border-2 border-dashed border-ink-3" /> TBD</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded-sm bg-sand-200"><span className="block h-full w-3 rounded-sm bg-sand-500" /></span> Planned activities · filled = completion</span>
        <span className="flex items-center gap-1.5"><span className="hatch h-2.5 w-6 rounded-sm" /> Date not confirmed</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-st-red" /> Today</span>
      </div>
    </div>
  );
}
