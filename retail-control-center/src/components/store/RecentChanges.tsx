'use client';

import { ArrowRight, CircleDot, MessageSquare, Plus } from 'lucide-react';
import { fmtRelativeTs, fmtShort } from '@/lib/domain/dates';
import { FIELD_LABELS } from '@/lib/domain/mutations';
import type { HistoryEntry } from '@/lib/domain/types';
import type { Model } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { Empty, cn } from '@/components/ui/primitives';
import { formatValue } from '@/components/tasks/TaskHistory';

export function describeChange(h: HistoryEntry): { verb: string; detail?: React.ReactNode } {
  const f = h.Field_Changed.replace(/^Store\./, '');
  const label = FIELD_LABELS[f] ?? f;
  if (h.Field_Changed === 'Note') return { verb: 'New note', detail: <span className="text-ink-2">“{h.Note || h.New_Value.replace(/^\[[^\]]*\]:\s*/, '')}”</span> };
  if (h.Field_Changed === 'Created') return { verb: 'Task created', detail: <span className="text-ink-2">{h.New_Value}</span> };
  if (h.Field_Changed === 'Store.Created') return { verb: 'Opening created', detail: h.New_Value };
  if (h.Field_Changed === 'Archived') return { verb: 'Task archived' };
  if (f === 'Blocker') return h.New_Value ? { verb: 'Blocker raised', detail: <span className="text-st-red">{h.New_Value}</span> } : { verb: 'Blocker resolved' };
  if (f === 'Decision_Required') return h.New_Value ? { verb: 'Decision required', detail: <span className="text-st-violet">{h.New_Value === 'TRUE' ? '' : h.New_Value}</span> } : { verb: 'Decision taken' };
  if (f === 'Description') return { verb: 'Description updated' };
  const fv = (v: string) => (f.endsWith('Date') ? fmtShort(v) || '—' : formatValue(f, v));
  return {
    verb: `${label} changed`,
    detail: (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className="text-ink-3">{fv(h.Previous_Value)}</span>
        <ArrowRight className="h-3 w-3 text-ink-4" />
        <span className="font-medium text-ink">{fv(h.New_Value)}</span>
      </span>
    ),
  };
}

export function RecentChanges({ entries, m, limit = 40, showStore = true, empty = 'No recent changes', dense }: { entries: HistoryEntry[]; m: Model; limit?: number; showStore?: boolean; empty?: string; dense?: boolean }) {
  const openTask = useApp((s) => s.openTask);
  if (!entries.length) return <Empty title={empty} compact icon={<CircleDot className="h-5 w-5" />} />;
  const list = entries.slice(0, limit);
  return (
    <ul className="divide-y divide-line/70">
      {list.map((h) => {
        const task = h.Task_ID ? m.snap.tasks.find((t) => t.Task_ID === h.Task_ID) : undefined;
        const store = m.storesById.get(h.Store_ID);
        const area = task ? m.areasById.get(task.Area) : undefined;
        const { verb, detail } = describeChange(h);
        const Icon = h.Field_Changed === 'Note' ? MessageSquare : h.Field_Changed === 'Created' ? Plus : CircleDot;
        return (
          <li key={h.History_ID}>
            <button type="button" disabled={!task} onClick={() => task && openTask(task.Task_ID)} className={cn('flex w-full gap-3 px-4 text-left hover:bg-wash/60 disabled:cursor-default', dense ? 'py-2' : 'py-2.5')}>
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sand-500" />
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="flex flex-wrap items-center gap-x-1.5 text-2xs text-ink-3">
                  <span className="tnum font-medium text-ink-2">{fmtRelativeTs(h.Timestamp)}</span>
                  {showStore && store && <span>· {store.Store_Name}</span>}
                  {area && <span>· {area.Area_Name}</span>}
                  <span>· {h.Updated_By}</span>
                </div>
                <p className="mt-0.5 leading-snug">
                  {task ? (
                    <>
                      <span className="font-mono text-[11.5px] font-semibold text-ink-2">{task.Task_ID}</span> <span className="text-ink">{task.Task_Title}</span>
                    </>
                  ) : (
                    <span className="font-medium text-ink">{store?.Store_Name ?? h.Store_ID} — opening</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-ink-2">
                  <span className="font-medium">{verb}</span>
                  {detail && <>: {detail}</>}
                </p>
              </div>
            </button>
          </li>
        );
      })}
      {entries.length > limit && <li className="px-4 py-2 text-center text-2xs text-ink-3">+ {entries.length - limit} more in History</li>}
    </ul>
  );
}

