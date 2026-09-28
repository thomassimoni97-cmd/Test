'use client';

import { Plus } from 'lucide-react';
import { useFilteredTasks } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { ActionLogTable } from '@/components/tasks/ActionLogTable';
import { FilterBar } from '@/components/tasks/FilterBar';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { Button, Segmented } from '@/components/ui/primitives';

export default function ActionLogPage() {
  const tasks = useFilteredTasks();
  const view = (useApp((s) => s.prefs['actions.view']) as 'table' | 'kanban' | undefined) ?? 'table';
  const setPref = useApp((s) => s.setPref);
  const presentation = useApp((s) => s.presentation);
  const openNewTask = useApp((s) => s.openNewTask);
  const store = useApp((s) => s.filters.store);
  const area = useApp((s) => s.filters.area);
  return (
    <div className="space-y-3 px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">All activities · all openings</div>
          <h1 className="mt-0.5 text-[1.6rem] font-semibold tracking-tight">Action Log</h1>
        </div>
        <div className="flex items-center gap-2">
          <Segmented value={view} onChange={(v) => setPref('actions.view', v)} options={[{ value: 'table', label: 'Table' }, { value: 'kanban', label: 'Kanban' }]} />
          {!presentation && <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openNewTask({ Store_ID: store || undefined, Area: area || undefined })}>New task</Button>}
        </div>
      </div>
      <FilterBar show={['q', 'programType', 'store', 'country', 'area', 'owner', 'status', 'risk', 'overdue', 'blocked', 'dueSoon', 'decision']} />
      {view === 'table' ? <ActionLogTable tasks={tasks} prefKey="actions.log" showStore maxHeight="calc(100vh - 250px)" /> : <KanbanBoard tasks={tasks} showStore />}
    </div>
  );
}
