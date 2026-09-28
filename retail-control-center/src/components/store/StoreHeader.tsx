'use client';

import { ChevronLeft, ChevronRight, FileText, Pencil, Printer } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fmtDate, fmtTimestamp } from '@/lib/domain/dates';
import { isAirport, type StoreStat } from '@/lib/domain/metrics';
import type { StructuredMinutes } from '@/lib/domain/minutes';
import type { Store } from '@/lib/domain/types';
import { useApp, type TaskFilters } from '@/lib/client/store';
import { AirportMark, OpeningDate, ProgressBar, RiskBadge } from '@/components/ui/badges';
import { Button, Select, cn } from '@/components/ui/primitives';

function Metric({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-center gap-1 px-5 first:pl-0', className)}>
      <span className="eyebrow">{label}</span>
      <div className="text-ink">{children}</div>
    </div>
  );
}

export function StoreHeader({ stat, stores, since, lastSal }: { stat: StoreStat; stores: Store[]; since: StructuredMinutes | null; lastSal: string }) {
  const { store, counts, progress, daysToOpening } = stat;
  const presentation = useApp((s) => s.presentation);
  const openStore = useApp((s) => s.openStore);
  const idx = stores.findIndex((s) => s.Store_ID === store.Store_ID);
  const prev = stores[(idx - 1 + stores.length) % stores.length];
  const next = stores[(idx + 1) % stores.length];

  return (
    <header className="rounded-lg border border-line bg-paper">
      <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <div className="eyebrow flex flex-wrap items-center gap-x-2">
            <span className="text-sand-700">{store.Program_Type}</span>
            <span>·</span>
            <span>{store.Store_Type}</span>
            <span>·</span>
            <span>{store.City ? `${store.City}, ` : ''}{store.Country}</span>
            {store.Project_Manager && (
              <>
                <span>·</span>
                <span>PM {store.Project_Manager}</span>
              </>
            )}
          </div>
          <h1 className="mt-1 flex items-center gap-3 font-display text-[2.6rem] font-semibold uppercase leading-none tracking-[0.02em] text-ink">
            {store.Store_Name}
            {isAirport(store) && <AirportMark className="h-6 w-6" />}
          </h1>
        </div>
        <div className="no-print flex shrink-0 items-center gap-2">
          <div className="flex items-center rounded-md border border-line-strong bg-paper">
            <Link href={`/stores/${prev.Store_ID}`} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:text-ink" title={`Previous opening: ${prev.Store_Name} ( [ )`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <StoreSwitcher current={store.Store_ID} stores={stores} />
            <Link href={`/stores/${next.Store_ID}`} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:text-ink" title={`Next opening: ${next.Store_Name} ( ] )`}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          {!presentation && (
            <>
              <Button size="md" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openStore(store.Store_ID)}>
                Edit
              </Button>
              <Button size="md" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()} title="Print-friendly store status">
                Print
              </Button>
            </>
          )}
          <Link href={`/stores/${store.Store_ID}/minutes`}>
            <Button variant="gold" size="md" icon={<FileText className="h-3.5 w-3.5" />}>
              Generate meeting minutes
            </Button>
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-[1.15fr_0.8fr_1.35fr_1fr_1.2fr] divide-x divide-line border-t border-line px-6 py-3">
        <Metric label="Opening date">
          <OpeningDate date={store.Opening_Date} status={store.Opening_Date_Status} className="text-lg font-semibold" />
        </Metric>
        <Metric label="Days to opening">
          <span className="tnum text-[1.9rem] font-semibold leading-none">{daysToOpening ?? '—'}</span>
          {daysToOpening !== null && <span className="ml-1 text-xs text-ink-3">{daysToOpening >= 0 ? 'days' : 'days since'}</span>}
        </Metric>
        <Metric label="Overall completion">
          <div className="flex items-center gap-3">
            <span className="tnum text-[1.9rem] font-semibold leading-none">{progress}%</span>
            <ProgressBar value={progress} height={8} className="flex-1" />
          </div>
        </Metric>
        <Metric label="Risk level (PM)">
          <RiskBadge level={store.Risk_Level} variant="solid" className="text-sm" />
          <span className="mt-1 block text-2xs text-ink-3">
            {counts.overdue} overdue · {counts.blocked} blocked · {counts.highRisk} high-risk
          </span>
        </Metric>
        <Metric label="Last update">
          <span className="tnum text-[13px] font-medium">{fmtTimestamp(store.Last_Update, 'dd MMM yyyy, HH:mm')}</span>
          <span className="block text-2xs text-ink-3">
            {lastSal ? <>Last SAL {fmtDate(lastSal)} · <b className="font-semibold text-ink-2">{since?.counts.changedTasks ?? 0}</b> tasks changed since</> : 'No confirmed SAL yet'}
          </span>
        </Metric>
      </div>
    </header>
  );
}

function StoreSwitcher({ current, stores }: { current: string; stores: Store[] }) {
  const router = useRouter();
  return (
    <Select
      className="h-8 rounded-none border-0 border-x border-line text-xs"
      value={current}
      onChange={(e) => {
        router.push(`/stores/${e.target.value}`);
      }}
      aria-label="Switch opening"
    >
      <optgroup label="New Companies">
        {stores.filter((s) => s.Program_Type === 'New Company').map((s) => <option key={s.Store_ID} value={s.Store_ID}>{s.Store_Name} (Co.)</option>)}
      </optgroup>
      <optgroup label="New Stores">
        {stores.filter((s) => s.Program_Type !== 'New Company').map((s) => <option key={s.Store_ID} value={s.Store_ID}>{s.Store_Name}</option>)}
      </optgroup>
    </Select>
  );
}

export function IndicatorStrip({ stat, active, onToggle }: { stat: StoreStat; active: Partial<TaskFilters> & { completed?: boolean; open?: boolean }; onToggle: (k: 'open' | 'completed' | 'blocked' | 'overdue' | 'dueSoon' | 'decision' | 'highRisk') => void }) {
  const c = stat.counts;
  const days = useApp((s) => s.snapshot?.settings.Due_Soon_Days ?? 14);
  const items = [
    { k: 'open' as const, label: 'Open actions', v: c.open, alert: false },
    { k: 'completed' as const, label: 'Completed', v: c.completed, alert: false, good: true },
    { k: 'blocked' as const, label: 'Blocked', v: c.blocked, alert: c.blocked > 0 },
    { k: 'overdue' as const, label: 'Overdue', v: c.overdue, alert: c.overdue > 0 },
    { k: 'dueSoon' as const, label: `Due next ${days}d`, v: c.dueSoon, warn: c.dueSoon > 0 },
    { k: 'decision' as const, label: 'Decisions required', v: c.decisions, violet: c.decisions > 0 },
    { k: 'highRisk' as const, label: 'High-risk tasks', v: c.highRisk, warn: c.highRisk > 0 },
  ];
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-line bg-paper">
      {items.map((it, i) => {
        const on = !!(active as Record<string, unknown>)[it.k];
        return (
          <button
            key={it.k}
            type="button"
            onClick={() => onToggle(it.k)}
            aria-pressed={on}
            className={cn('flex items-baseline justify-between gap-2 px-4 py-2.5 text-left transition-colors', i > 0 && 'border-l border-line', on ? 'bg-ink text-ivory' : 'hover:bg-wash/70')}
            title={`Filter the action log: ${it.label}`}
          >
            <span className={cn('text-2xs font-semibold uppercase tracking-[0.08em]', on ? 'text-ivory/80' : 'text-ink-3')}>{it.label}</span>
            <span
              className={cn(
                'tnum text-2xl font-semibold leading-none',
                on ? 'text-ivory' : it.alert ? 'text-st-red' : it.violet ? 'text-st-violet' : it.warn ? 'text-st-amber' : it.good ? 'text-st-green' : 'text-ink',
                !it.v && !on && 'text-ink-4',
              )}
            >
              {it.v}
            </span>
          </button>
        );
      })}
    </div>
  );
}
