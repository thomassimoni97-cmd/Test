'use client';

import { ArrowRight, MessageSquare } from 'lucide-react';
import { fmtDate, fmtTimestamp } from '@/lib/domain/dates';
import { FIELD_LABELS } from '@/lib/domain/mutations';
import type { HistoryEntry } from '@/lib/domain/types';
import { cn } from '@/components/ui/primitives';

export function formatValue(field: string, v: string): string {
  if (!v) return '—';
  if (/Date$/.test(field)) return fmtDate(v, 'dd MMM yyyy');
  if (field === 'Progress_Percentage') return `${v}%`;
  if (field === 'Archived') return v === 'TRUE' ? 'Archived' : 'Active';
  return v;
}

/** Chronological vertical timeline (newest first) grouped by day. */
export function TaskHistory({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return <p className="py-4 text-center text-xs text-ink-3">No history yet.</p>;
  const groups: { day: string; items: HistoryEntry[] }[] = [];
  for (const h of entries) {
    const day = fmtDate(h.Timestamp);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(h);
    else groups.push({ day, items: [h] });
  }
  return (
    <ol className="relative ml-1.5 border-l border-line pl-4">
      {groups.map((g) => (
        <li key={g.day} className="mb-4">
          <div className="absolute -left-[4.5px] mt-1 h-2 w-2 rounded-full bg-sand-400" aria-hidden />
          <div className="eyebrow mb-1.5 text-ink-2">{g.day}</div>
          <ul className="space-y-2">
            {g.items.map((h) => (
              <li key={h.History_ID} className={cn('rounded-md px-2.5 py-1.5 text-[13px]', h.Field_Changed === 'Note' ? 'bg-sand-50 ring-1 ring-sand-100' : 'bg-wash/60')}>
                {h.Field_Changed === 'Note' ? (
                  <div className="flex gap-2">
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sand-600" />
                    <p className="text-ink">{h.Note || h.New_Value.replace(/^\[[^\]]*\]:\s*/, '')}</p>
                  </div>
                ) : h.Field_Changed === 'Created' ? (
                  <p className="text-ink-2">Task created</p>
                ) : (
                  <div>
                    <span className="text-2xs font-semibold uppercase tracking-wide text-ink-3">{FIELD_LABELS[h.Field_Changed] ?? h.Field_Changed}</span>
                    {h.Field_Changed === 'Description' ? (
                      <p className="mt-0.5 text-xs text-ink-2">Description updated</p>
                    ) : (
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-ink">
                        <span className="text-ink-3 line-through decoration-ink-4/60">{formatValue(h.Field_Changed, h.Previous_Value)}</span>
                        <ArrowRight className="h-3 w-3 text-ink-4" />
                        <span className="font-medium">{formatValue(h.Field_Changed, h.New_Value)}</span>
                      </p>
                    )}
                  </div>
                )}
                <p className="mt-0.5 text-2xs text-ink-4">
                  {fmtTimestamp(h.Timestamp, 'HH:mm')} · {h.Updated_By || '—'}
                </p>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
