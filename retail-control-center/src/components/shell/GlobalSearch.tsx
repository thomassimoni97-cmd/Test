'use client';

import { MessageSquare, Search, Store as StoreIcon, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useModel } from '@/lib/client/model';
import { useApp, EMPTY_FILTERS } from '@/lib/client/store';
import { AirportMark, StatusPill } from '@/components/ui/badges';
import { Kbd, cn } from '@/components/ui/primitives';
import { isAirport } from '@/lib/domain/metrics';

type Result =
  | { kind: 'store'; id: string; title: string; sub: string; airport: boolean }
  | { kind: 'task'; id: string; title: string; sub: string; status: string; via?: string }
  | { kind: 'owner'; id: string; title: string; sub: string };

export function GlobalSearch() {
  const open = useApp((s) => s.searchOpen);
  const setOpen = useApp((s) => s.setSearchOpen);
  const openTask = useApp((s) => s.openTask);
  const setFilters = useApp((s) => s.setFilters);
  const m = useModel();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: Result[] = [];
    for (const st of m.stores) {
      if (`${st.Store_ID} ${st.Store_Name} ${st.Country} ${st.City}`.toLowerCase().includes(s))
        out.push({ kind: 'store', id: st.Store_ID, title: st.Store_Name, sub: `${st.City}, ${st.Country} · ${st.Program_Type}`, airport: isAirport(st) });
    }
    for (const o of m.activeOwners) if (`${o.Name} ${o.Function}`.toLowerCase().includes(s)) out.push({ kind: 'owner', id: o.Name, title: o.Name, sub: o.Function });
    let n = 0;
    const seen = new Set<string>();
    for (const t of m.tasks) {
      if (n >= 25) break;
      if (`${t.Task_ID} ${t.Task_Title} ${t.Description} ${t.Owner} ${t.Blocker} ${t.Decision_Required}`.toLowerCase().includes(s)) {
        const st = m.storesById.get(t.Store_ID);
        out.push({ kind: 'task', id: t.Task_ID, title: t.Task_Title, sub: `${t.Task_ID} · ${st?.Store_Name ?? t.Store_ID} · ${m.areasById.get(t.Area)?.Area_Name ?? t.Area} · ${t.Owner}`, status: t.Status });
        seen.add(t.Task_ID);
        n++;
      }
    }
    // notes (history)
    let nn = 0;
    for (let i = m.snap.history.length - 1; i >= 0 && nn < 10; i--) {
      const h = m.snap.history[i];
      if (h.Field_Changed !== 'Note' || seen.has(h.Task_ID)) continue;
      if ((h.Note || h.New_Value).toLowerCase().includes(s)) {
        const t = m.snap.tasks.find((x) => x.Task_ID === h.Task_ID);
        if (!t) continue;
        seen.add(t.Task_ID);
        out.push({ kind: 'task', id: t.Task_ID, title: t.Task_Title, sub: `${t.Task_ID} · ${m.storesById.get(t.Store_ID)?.Store_Name ?? ''}`, status: t.Status, via: h.New_Value });
        nn++;
      }
    }
    return out;
  }, [q, m]);

  if (!open) return null;

  const choose = (r: Result) => {
    setOpen(false);
    if (r.kind === 'store') router.push(`/stores/${r.id}`);
    else if (r.kind === 'owner') {
      setFilters({ ...EMPTY_FILTERS, owner: r.id });
      router.push('/actions');
    } else openTask(r.id);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/20 pt-[12vh] backdrop-blur-[1px]" onMouseDown={() => setOpen(false)}>
      <div className="w-[640px] max-w-[92vw] animate-fadein overflow-hidden rounded-xl border border-line bg-paper shadow-pop" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Global search">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 text-ink-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && results[idx]) choose(results[idx]);
              else if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="Task ID, title, store, country, owner, note…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-4"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-1.5">
          {q.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-xs text-ink-3">Type at least 2 characters. Results open the Task Detail or the Store SAL.</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-ink-3">No results for “{q}”.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.kind}-${r.id}-${i}`}
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => choose(r)}
                className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left', i === idx ? 'bg-wash' : '')}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sand-50 text-sand-700">
                  {r.kind === 'store' ? <StoreIcon className="h-3.5 w-3.5" /> : r.kind === 'owner' ? <User className="h-3.5 w-3.5" /> : r.kind === 'task' && r.via ? <MessageSquare className="h-3.5 w-3.5" /> : <span className="text-2xs font-bold">T</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink">
                    {r.title} {r.kind === 'store' && r.airport && <AirportMark />}
                  </span>
                  <span className="block truncate text-2xs text-ink-3">{r.kind === 'task' && r.via ? `Note: ${r.via}` : r.sub}</span>
                </span>
                {r.kind === 'task' && <StatusPill status={r.status} size="sm" />}
                {r.kind !== 'task' && <span className="text-2xs uppercase tracking-wide text-ink-4">{r.kind === 'store' ? 'Store SAL' : 'Owner'}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
