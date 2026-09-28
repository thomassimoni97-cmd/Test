'use client';

import { useRouter } from 'next/navigation';
import { isAirport, type StoreStat } from '@/lib/domain/metrics';
import { AirportMark, DaysTo, OpeningDate, ProgressBar, RiskBadge } from '@/components/ui/badges';
import { Empty, cn } from '@/components/ui/primitives';

const COLS = 'grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.25fr)_78px_minmax(0,1.2fr)_84px_52px_60px_60px_62px]';

export function OpeningsTable({ stats }: { stats: StoreStat[] }) {
  const router = useRouter();
  if (!stats.length) return <Empty title="No openings match the current filters." compact />;
  const groups = [
    { label: 'New Companies', rows: stats.filter((s) => s.store.Program_Type === 'New Company') },
    { label: 'New Stores', rows: stats.filter((s) => s.store.Program_Type !== 'New Company') },
  ].filter((g) => g.rows.length);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        <div className={cn('grid items-center gap-3 border-b border-line-strong bg-wash px-4 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3', COLS)}>
          <span>Opening</span>
          <span>Country</span>
          <span>Opening date</span>
          <span className="text-right">Days to</span>
          <span>Overall progress</span>
          <span>Risk</span>
          <span className="text-right">Open</span>
          <span className="text-right">Blocked</span>
          <span className="text-right">Overdue</span>
          <span className="text-right">Decisions</span>
        </div>
        {groups.map((g) => (
          <div key={g.label}>
            <div className="border-b border-line bg-sand-50 px-4 py-1.5 text-2xs font-bold uppercase tracking-[0.14em] text-sand-700">
              {g.label} <span className="font-medium text-ink-3">· {g.rows.length}</span>
            </div>
            {g.rows.map((s) => (
              <button
                type="button"
                key={s.store.Store_ID}
                onClick={() => router.push(`/stores/${s.store.Store_ID}`)}
                className={cn('grid w-full items-center gap-3 border-b border-line/60 px-4 py-2.5 text-left text-[13px] hover:bg-sand-50/60', COLS)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-semibold text-ink">{s.store.Store_Name}</span>
                  {isAirport(s.store) && <AirportMark />}
                  <span className="shrink-0 font-mono text-2xs text-ink-4">{s.store.Store_ID}</span>
                </span>
                <span className="truncate text-ink-2">{s.store.Country}</span>
                <OpeningDate date={s.store.Opening_Date} status={s.store.Opening_Date_Status} className="text-[13px]" />
                <span className="text-right"><DaysTo days={s.daysToOpening} /></span>
                <ProgressBar value={s.progress} showLabel height={6} />
                <RiskBadge level={s.store.Risk_Level} />
                <span className="tnum text-right text-ink-2">{s.counts.open}</span>
                <span className={cn('tnum text-right', s.counts.blocked ? 'font-semibold text-st-red' : 'text-ink-4')}>{s.counts.blocked || '–'}</span>
                <span className={cn('tnum text-right', s.counts.overdue ? 'font-semibold text-st-red' : 'text-ink-4')}>{s.counts.overdue || '–'}</span>
                <span className={cn('tnum text-right', s.counts.decisions ? 'font-semibold text-st-violet' : 'text-ink-4')}>{s.counts.decisions || '–'}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
