'use client';

import { Search, X } from 'lucide-react';
import { useMemo } from 'react';
import { activeFilterCount, useModel } from '@/lib/client/model';
import { useApp, type TaskFilters } from '@/lib/client/store';
import { Button, Input, Select, ToggleChip, cn } from '@/components/ui/primitives';

type Key = keyof TaskFilters;

export function FilterBar({ show = ['q', 'store', 'area', 'owner', 'status', 'risk', 'overdue', 'blocked', 'dueSoon', 'decision'], className, compact }: { show?: Key[]; className?: string; compact?: boolean }) {
  const m = useModel();
  const f = useApp((s) => s.filters);
  const set = useApp((s) => s.setFilters);
  const clear = useApp((s) => s.clearFilters);
  const presentation = useApp((s) => s.presentation);
  const has = (k: Key) => show.includes(k);
  const countries = useMemo(() => [...new Set(m.stores.map((s) => s.Country).filter(Boolean))].sort(), [m.stores]);
  const years = useMemo(() => [...new Set(m.stores.map((s) => s.Opening_Date.slice(0, 4)).filter(Boolean))].sort(), [m.stores]);
  const n = activeFilterCount(f);
  const sel = 'h-7 w-auto max-w-[160px] text-xs';

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {has('q') && !presentation && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
          <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Filter…" className={cn('h-7 pl-7 text-xs', compact ? 'w-36' : 'w-48')} />
        </div>
      )}
      {has('year') && (
        <Select className={sel} value={f.year} onChange={(e) => set({ year: e.target.value })} aria-label="Year">
          <option value="">All years</option>
          {years.map((y) => <option key={y}>{y}</option>)}
        </Select>
      )}
      {has('programType') && (
        <Select className={sel} value={f.programType} onChange={(e) => set({ programType: e.target.value })} aria-label="Program type">
          <option value="">All programs</option>
          <option>New Company</option>
          <option>New Store</option>
        </Select>
      )}
      {has('store') && (
        <Select className={sel} value={f.store} onChange={(e) => set({ store: e.target.value })} aria-label="Store">
          <option value="">All openings</option>
          {m.stores.map((s) => <option key={s.Store_ID} value={s.Store_ID}>{s.Store_Name}{s.Program_Type === 'New Company' ? ' (Co.)' : ''}</option>)}
        </Select>
      )}
      {has('country') && (
        <Select className={sel} value={f.country} onChange={(e) => set({ country: e.target.value })} aria-label="Country">
          <option value="">All countries</option>
          {countries.map((c) => <option key={c}>{c}</option>)}
        </Select>
      )}
      {has('area') && (
        <Select className={sel} value={f.area} onChange={(e) => set({ area: e.target.value })} aria-label="Area">
          <option value="">All areas</option>
          {m.snap.areas.map((a) => <option key={a.Area_ID} value={a.Area_ID}>{a.Area_Name}</option>)}
        </Select>
      )}
      {has('owner') && (
        <Select className={sel} value={f.owner} onChange={(e) => set({ owner: e.target.value })} aria-label="Owner">
          <option value="">All owners</option>
          {m.activeOwners.map((o) => <option key={o.Owner_ID} value={o.Name}>{o.Name}</option>)}
        </Select>
      )}
      {has('status') && (
        <Select className={sel} value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          {m.activeStatuses.map((s) => <option key={s.name}>{s.name}</option>)}
        </Select>
      )}
      {has('risk') && (
        <Select className={cn(sel, 'w-28')} value={f.risk} onChange={(e) => set({ risk: e.target.value })} aria-label="Risk">
          <option value="">All risks</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </Select>
      )}
      {has('overdue') && <ToggleChip tone="red" active={f.overdue} onClick={() => set({ overdue: !f.overdue })}>Overdue</ToggleChip>}
      {has('blocked') && <ToggleChip tone="red" active={f.blocked} onClick={() => set({ blocked: !f.blocked })}>Blocked</ToggleChip>}
      {has('dueSoon') && <ToggleChip tone="amber" active={f.dueSoon} onClick={() => set({ dueSoon: !f.dueSoon })}>Due ≤ {m.snap.settings.Due_Soon_Days}d</ToggleChip>}
      {has('decision') && <ToggleChip tone="violet" active={f.decision} onClick={() => set({ decision: !f.decision })}>Decision required</ToggleChip>}
      {n > 0 && (
        <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={clear}>
          Clear filters ({n})
        </Button>
      )}
    </div>
  );
}
