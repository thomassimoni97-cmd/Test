'use client';

import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { areaStats, isClosed, isCompleted, isOpen } from '@/lib/domain/metrics';
import { confirmedSals } from '@/lib/domain/minutes';
import { useFilteredTasks, useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { AreaProgressList } from '@/components/store/AreaProgressList';
import { RecentChanges } from '@/components/store/RecentChanges';
import { SalFocus, useSinceLastSal } from '@/components/store/SalFocus';
import { IndicatorStrip, StoreHeader } from '@/components/store/StoreHeader';
import { ActionLogTable } from '@/components/tasks/ActionLogTable';
import { FilterBar } from '@/components/tasks/FilterBar';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { Button, Card, Empty, Kbd, Segmented } from '@/components/ui/primitives';

type LocalFlag = 'open' | 'completed' | 'highRisk';

export default function StoreSalPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const router = useRouter();
  const m = useModel();
  const store = m.storesById.get(storeId);
  const stat = m.storeStats.get(storeId);
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const presentation = useApp((s) => s.presentation);
  const openNewTask = useApp((s) => s.openNewTask);
  const view = (useApp((s) => s.prefs['sal.view']) as 'table' | 'kanban' | undefined) ?? 'table';
  const setPref = useApp((s) => s.setPref);
  const [local, setLocal] = useState<LocalFlag | ''>('');

  useEffect(() => {
    if (store) setPref('lastStore', store.Store_ID);
  }, [store, setPref]);

  const storeTasks = useMemo(() => m.tasksByStore.get(storeId) ?? [], [m, storeId]);
  const stats = useMemo(() => areaStats(storeTasks, m.snap.areas, m.snap.settings, m.today), [storeTasks, m]);
  const filtered = useFilteredTasks({ store: storeId });
  const logTasks = useMemo(() => {
    if (local === 'open') return filtered.filter(isOpen);
    if (local === 'completed') return filtered.filter(isCompleted);
    if (local === 'highRisk') return filtered.filter((t) => !isClosed(t) && t.Risk_Level === 'High');
    return filtered;
  }, [filtered, local]);
  const since = useSinceLastSal(store, m);
  const lastSal = store ? confirmedSals(m.snap.sals, store.Store_ID).pop() : undefined;
  const storeHistory = useMemo(() => m.snap.history.filter((h) => h.Store_ID === storeId).slice(-60).reverse(), [m, storeId]);

  // Presentation / keyboard navigation: ← → areas, [ ] openings
  const areaOrder = useMemo(() => stats.map((s) => s.area.Area_ID), [stats]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (/input|textarea|select/i.test(el.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (useApp.getState().drawer || useApp.getState().searchOpen) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const cur = areaOrder.indexOf(useApp.getState().filters.area);
        const len = areaOrder.length + 1; // + "all areas"
        const pos = (cur + 1 + (e.key === 'ArrowRight' ? 1 : -1) + len) % len;
        setFilters({ area: pos === 0 ? '' : areaOrder[pos - 1] });
      } else if (e.key === ']' || e.key === '[') {
        const i = m.stores.findIndex((s) => s.Store_ID === storeId);
        const n = m.stores[(i + (e.key === ']' ? 1 : -1) + m.stores.length) % m.stores.length];
        router.push(`/stores/${n.Store_ID}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [areaOrder, m.stores, storeId, router, setFilters]);

  if (!store || !stat) {
    return (
      <div className="p-8">
        <Empty title={`Opening “${storeId}” not found`} body="It may have been removed or renamed in the STORES sheet." action={<Link href="/stores"><Button>All openings</Button></Link>} />
      </div>
    );
  }

  const toggleIndicator = (k: 'open' | 'completed' | 'blocked' | 'overdue' | 'dueSoon' | 'decision' | 'highRisk') => {
    if (k === 'open' || k === 'completed' || k === 'highRisk') setLocal(local === k ? '' : k);
    else setFilters({ [k]: !filters[k] });
    document.getElementById('action-log')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const selectedArea = m.areasById.get(filters.area);

  return (
    <div className="mx-auto max-w-[1760px] space-y-4 px-6 py-5">
      <StoreHeader stat={stat} stores={m.stores} since={since} lastSal={lastSal?.SAL_Date ?? ''} />
      <IndicatorStrip stat={stat} active={{ ...filters, [local]: !!local }} onToggle={toggleIndicator} />

      <div className="grid grid-cols-12 gap-4">
        <AreaProgressList
          className="col-span-12 h-[440px] xl:col-span-6"
          stats={stats}
          selected={filters.area}
          onSelect={(id) => {
            setFilters({ area: id });
          }}
        />
        <SalFocus className="col-span-12 h-[440px] xl:col-span-6" tasks={storeTasks} m={m} since={since} />
      </div>

      <section id="action-log" className="scroll-mt-4 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em]">
            Action log
            {selectedArea && <span className="ml-2 font-normal normal-case tracking-normal text-ink-3">· {selectedArea.Area_Name}</span>}
            {local && <span className="ml-2 font-normal normal-case tracking-normal text-ink-3">· {local === 'highRisk' ? 'high-risk' : local}</span>}
          </h2>
          <Segmented size="sm" value={view} onChange={(v) => setPref('sal.view', v)} options={[{ value: 'table', label: 'Table' }, { value: 'kanban', label: 'Kanban' }]} />
          {!presentation && (
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openNewTask({ Store_ID: store.Store_ID, Area: filters.area || undefined })}>
              New task
            </Button>
          )}
          {presentation && (
            <span className="ml-auto flex items-center gap-1.5 text-2xs text-ink-3">
              <Kbd>←</Kbd><Kbd>→</Kbd> areas · <Kbd>[</Kbd><Kbd>]</Kbd> openings · <Kbd>1</Kbd>–<Kbd>5</Kbd> focus · <Kbd>Esc</Kbd> exit
            </span>
          )}
        </div>
        <FilterBar show={['q', 'area', 'owner', 'status', 'risk', 'overdue', 'blocked', 'dueSoon', 'decision']} compact />
        {view === 'table' ? (
          <ActionLogTable tasks={logTasks} prefKey="sal.log" maxHeight="72vh" exportName={`${store.Store_ID}-action-log`} defaultGroup="area" defaultHidden={['desc', 'start', 'updated']} />
        ) : (
          <KanbanBoard tasks={logTasks} />
        )}
      </section>

      <Card title="Recent changes" actions={<Link href={`/history?store=${store.Store_ID}`} className="text-xs text-ink-3 hover:text-ink">Full history →</Link>}>
        <div className="max-h-[420px] overflow-y-auto">
          <RecentChanges entries={storeHistory} m={m} showStore={false} limit={30} />
        </div>
      </Card>

      <div className="no-print flex items-center justify-between rounded-lg border border-sand-200 bg-sand-50 px-5 py-4">
        <div>
          <p className="text-[13px] font-semibold text-ink">End of SAL</p>
          <p className="text-xs text-ink-2">
            Generate the minutes from what changed since {lastSal ? `the SAL of ${lastSal.SAL_Date.split('-').reverse().join('/')}` : 'the start (first SAL)'}. Nothing is saved until you confirm.
          </p>
        </div>
        <Link href={`/stores/${store.Store_ID}/minutes`}>
          <Button variant="gold" size="lg" icon={<FileText className="h-4 w-4" />}>
            Generate meeting minutes
          </Button>
        </Link>
      </div>
    </div>
  );
}
