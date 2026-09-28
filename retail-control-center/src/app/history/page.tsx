'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { tsToISODate } from '@/lib/domain/dates';
import type { HistoryEntry } from '@/lib/domain/types';
import { useModel } from '@/lib/client/model';
import { RecentChanges } from '@/components/store/RecentChanges';
import { Button, Card, Input, Select } from '@/components/ui/primitives';

const TYPES: { id: string; label: string; match: (h: HistoryEntry) => boolean }[] = [
  { id: 'status', label: 'Status', match: (h) => h.Field_Changed === 'Status' },
  { id: 'progress', label: 'Progress', match: (h) => h.Field_Changed === 'Progress_Percentage' },
  { id: 'due', label: 'Due / start date', match: (h) => h.Field_Changed === 'Due_Date' || h.Field_Changed === 'Start_Date' },
  { id: 'owner', label: 'Owner', match: (h) => h.Field_Changed === 'Owner' || h.Field_Changed === 'Secondary_Owner' },
  { id: 'risk', label: 'Risk / priority', match: (h) => h.Field_Changed === 'Risk_Level' || h.Field_Changed === 'Priority' },
  { id: 'blocker', label: 'Blocker', match: (h) => h.Field_Changed === 'Blocker' },
  { id: 'decision', label: 'Decision required', match: (h) => h.Field_Changed === 'Decision_Required' },
  { id: 'note', label: 'Notes', match: (h) => h.Field_Changed === 'Note' },
  { id: 'created', label: 'Created / archived', match: (h) => h.Field_Changed === 'Created' || h.Field_Changed === 'Archived' || h.Field_Changed === 'Store.Created' },
  { id: 'store', label: 'Opening (store) changes', match: (h) => h.Field_Changed.startsWith('Store.') },
  { id: 'other', label: 'Title / description / other', match: (h) => ['Task_Title', 'Description', 'Area', 'Task_Weight', 'Dependency'].includes(h.Field_Changed) },
];

export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryInner />
    </Suspense>
  );
}

function HistoryInner() {
  const m = useModel();
  const params = useSearchParams();
  const [store, setStore] = useState(params.get('store') ?? '');
  const [area, setArea] = useState('');
  const [user, setUser] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(200);

  const users = useMemo(() => [...new Set(m.snap.history.map((h) => h.Updated_By).filter(Boolean))].sort(), [m.snap.history]);
  const taskArea = useMemo(() => new Map(m.snap.tasks.map((t) => [t.Task_ID, t.Area])), [m.snap.tasks]);
  const entries = useMemo(() => {
    const matcher = TYPES.find((t) => t.id === type)?.match;
    const out: HistoryEntry[] = [];
    for (let i = m.snap.history.length - 1; i >= 0; i--) {
      const h = m.snap.history[i];
      if (store && h.Store_ID !== store) continue;
      if (area && taskArea.get(h.Task_ID) !== area) continue;
      if (user && h.Updated_By !== user) continue;
      if (matcher && !matcher(h)) continue;
      const d = tsToISODate(h.Timestamp);
      if (from && d < from) continue;
      if (to && d > to) continue;
      out.push(h);
    }
    return out;
  }, [m.snap.history, store, area, user, type, from, to, taskArea]);
  const sel = 'h-7 text-xs';

  return (
    <div className="mx-auto max-w-[1200px] space-y-3 px-6 py-5">
      <div>
        <div className="eyebrow">TASK_HISTORY · append-only audit trail</div>
        <h1 className="mt-0.5 text-[1.6rem] font-semibold tracking-tight">History</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select className={sel} value={store} onChange={(e) => setStore(e.target.value)}>
          <option value="">All openings</option>
          {m.stores.map((s) => <option key={s.Store_ID} value={s.Store_ID}>{s.Store_Name}{s.Program_Type === 'New Company' ? ' (Co.)' : ''}</option>)}
        </Select>
        <Select className={sel} value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">All areas</option>
          {m.snap.areas.map((a) => <option key={a.Area_ID} value={a.Area_ID}>{a.Area_Name}</option>)}
        </Select>
        <Select className={sel} value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">All users</option>
          {users.map((u) => <option key={u}>{u}</option>)}
        </Select>
        <Select className={sel} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All change types</option>
          {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
        <label className="flex items-center gap-1 text-xs text-ink-3">From <Input type="date" className="h-7 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-1 text-xs text-ink-3">To <Input type="date" className="h-7 text-xs" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {(store || area || user || type || from || to) && <Button size="sm" variant="ghost" onClick={() => { setStore(''); setArea(''); setUser(''); setType(''); setFrom(''); setTo(''); }}>Clear filters</Button>}
        <span className="tnum ml-auto text-xs text-ink-3">{entries.length} entries</span>
      </div>
      <Card>
        <RecentChanges entries={entries} m={m} limit={limit} empty="No changes match these filters" />
        {entries.length > limit && (
          <div className="border-t border-line p-2 text-center">
            <Button size="sm" onClick={() => setLimit((l) => l + 300)}>Load more</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
