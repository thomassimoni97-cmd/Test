'use client';

import { ChevronRight } from 'lucide-react';
import { riskRank, type AreaStat } from '@/lib/domain/metrics';
import { useApp } from '@/lib/client/store';
import { ProgressBar, RiskBadge, StatusPill } from '@/components/ui/badges';
import { Card, Empty, Select, cn } from '@/components/ui/primitives';

export type AreaSort = 'order' | 'completion' | 'risk' | 'overdue' | 'blocked';

export function sortAreas(stats: AreaStat[], sort: AreaSort): AreaStat[] {
  const list = [...stats];
  switch (sort) {
    case 'completion':
      return list.sort((a, b) => a.progress - b.progress);
    case 'risk':
      return list.sort((a, b) => riskRank(b.risk ?? 'Low') - riskRank(a.risk ?? 'Low') || b.counts.overdue - a.counts.overdue);
    case 'overdue':
      return list.sort((a, b) => b.counts.overdue - a.counts.overdue || a.progress - b.progress);
    case 'blocked':
      return list.sort((a, b) => b.counts.blocked - a.counts.blocked || a.progress - b.progress);
    default:
      return list.sort((a, b) => a.area.Order - b.area.Order);
  }
}

export function AreaProgressList({ stats, selected, onSelect, prefKey = 'sal.areaSort', className }: { stats: AreaStat[]; selected: string; onSelect: (areaId: string) => void; prefKey?: string; className?: string }) {
  const sort = (useApp((s) => s.prefs[prefKey]) as AreaSort | undefined) ?? 'order';
  const setPref = useApp((s) => s.setPref);
  const list = sortAreas(stats, sort);
  return (
    <Card
      className={cn('flex flex-col', className)}
      title="Functional area progress"
      actions={
        <Select className="no-print h-7 text-xs" value={sort} onChange={(e) => setPref(prefKey, e.target.value)} aria-label="Sort areas">
          <option value="order">Configured order</option>
          <option value="completion">Lowest completion</option>
          <option value="risk">Highest risk</option>
          <option value="overdue">Most overdue</option>
          <option value="blocked">Most blockers</option>
        </Select>
      }
    >
      {list.length === 0 ? (
        <Empty title="No tasks for this opening yet" body="Add tasks to see progress per functional area." compact />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_9.2rem_7.2rem_2.5rem_2.5rem_2.7rem_5.2rem] items-center gap-2 border-b border-line bg-paper px-4 py-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-4">
            <span>Area</span>
            <span>Completion</span>
            <span>Status</span>
            <span className="text-right" title="Tasks">Tasks</span>
            <span className="text-right" title="Overdue">Late</span>
            <span className="text-right" title="Blocked">Block</span>
            <span>Risk</span>
          </div>
          <ul>
            {list.map((a) => {
              const active = selected === a.area.Area_ID;
              return (
                <li key={a.area.Area_ID}>
                  <button
                    type="button"
                    onClick={() => onSelect(active ? '' : a.area.Area_ID)}
                    aria-pressed={active}
                    className={cn('group grid w-full grid-cols-[minmax(0,1fr)_9.2rem_7.2rem_2.5rem_2.5rem_2.7rem_5.2rem] items-center gap-2 border-b border-line/60 px-4 py-2 text-left text-[13px] transition-colors', active ? 'bg-sand-50 shadow-[inset_3px_0_0_#B08D57]' : 'hover:bg-wash/60')}
                  >
                    <span className="flex min-w-0 items-center gap-1 font-medium text-ink">
                      <span className="truncate" title={a.area.Area_Name}>{a.area.Area_Name}</span>
                      {a.area.Group && a.area.Group !== a.area.Area_Name && <span className="shrink-0 text-2xs font-normal text-ink-4">{a.area.Group}</span>}
                    </span>
                    <ProgressBar value={a.progress} showLabel height={6} tone={a.status === 'Completed' ? 'green' : 'gold'} />
                    <StatusPill status={a.status} size="sm" className="justify-self-start" />
                    <span className="tnum text-right text-ink-2">{a.counts.total}</span>
                    <span className={cn('tnum text-right', a.counts.overdue ? 'font-semibold text-st-red' : 'text-ink-4')}>{a.counts.overdue || '–'}</span>
                    <span className={cn('tnum text-right', a.counts.blocked ? 'font-semibold text-st-red' : 'text-ink-4')}>{a.counts.blocked || '–'}</span>
                    <span className="flex items-center justify-between">
                      <RiskBadge level={a.risk} />
                      <ChevronRight className="h-3.5 w-3.5 text-ink-4 opacity-0 group-hover:opacity-100" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
