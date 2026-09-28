'use client';

import { Plus } from 'lucide-react';
import { useFilteredTasks, useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { FilterBar } from '@/components/tasks/FilterBar';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { Button } from '@/components/ui/primitives';

export default function KanbanPage() {
  const m = useModel();
  const tasks = useFilteredTasks();
  const store = useApp((s) => s.filters.store);
  const presentation = useApp((s) => s.presentation);
  const openNewTask = useApp((s) => s.openNewTask);
  return (
    <div className="space-y-3 px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{store ? m.storesById.get(store)?.Store_Name : 'All openings'}</div>
          <h1 className="mt-0.5 text-[1.6rem] font-semibold tracking-tight">Kanban</h1>
        </div>
        {!presentation && <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openNewTask({ Store_ID: store || undefined })}>New task</Button>}
      </div>
      <FilterBar show={['q', 'store', 'area', 'owner', 'risk', 'overdue', 'blocked', 'dueSoon', 'decision']} />
      {!store && tasks.length > 400 && <p className="text-xs text-ink-3">Tip: select an opening to keep the board readable ({tasks.length} tasks shown).</p>}
      <KanbanBoard tasks={tasks} showStore={!store} />
    </div>
  );
}
