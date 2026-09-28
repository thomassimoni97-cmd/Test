'use client';

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { CalendarDays } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { fmtShort } from '@/lib/domain/dates';
import { delayDays, isAirport, isBlocked, needsDecision } from '@/lib/domain/metrics';
import { CORE_STATUS, type Task } from '@/lib/domain/types';
import { useModel, type Model } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { AirportMark, BlockerMark, DecisionMark, DelayBadge, ProgressBar, RiskBadge, TONE } from '@/components/ui/badges';
import { Empty, ToggleChip, cn } from '@/components/ui/primitives';

const CARD_LIMIT = 120;

export function KanbanBoard({ tasks, showStore = false }: { tasks: Task[]; showStore?: boolean }) {
  const m = useModel();
  const update = useApp((s) => s.updateTask);
  const presentation = useApp((s) => s.presentation);
  const [showNA, setShowNA] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // pointer drag only; keyboard users change status from the card's detail panel (Enter opens it)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const columns = useMemo(() => m.activeStatuses.filter((s) => showNA || s.name !== CORE_STATUS.na), [m.activeStatuses, showNA]);
  const byStatus = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const c of columns) map.set(c.name, []);
    for (const t of tasks) map.get(t.Status)?.push(t);
    for (const list of map.values()) list.sort((a, b) => (a.Due_Date || '9999').localeCompare(b.Due_Date || '9999'));
    return map;
  }, [tasks, columns]);

  const onStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const to = e.over?.id ? String(e.over.id) : null;
    const t = tasks.find((x) => x.Task_ID === e.active.id);
    if (to && t && t.Status !== to) update(t.Task_ID, { Status: to });
  };
  const active = activeId ? tasks.find((t) => t.Task_ID === activeId) : null;

  if (!tasks.length) return <div className="rounded-lg border border-line bg-paper"><Empty title="No tasks match the current filters." compact /></div>;

  return (
    <div>
      <div className="no-print mb-2 flex items-center gap-2 text-xs text-ink-3">
        {!presentation && <span>Drag a card to change its status — the change is saved to Google Sheets and logged in history.</span>}
        <ToggleChip active={showNA} onClick={() => setShowNA((x) => !x)}>Show N/A column</ToggleChip>
      </div>
      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((c) => {
            const list = byStatus.get(c.name) ?? [];
            const show = expanded.has(c.name) ? list : list.slice(0, CARD_LIMIT);
            return (
              <Column key={c.name} id={c.name} tone={c.tone} count={list.length} disabled={presentation}>
                {show.map((t) => (
                  <DraggableCard key={t.Task_ID} task={t} m={m} showStore={showStore} disabled={presentation} />
                ))}
                {list.length > show.length && (
                  <button type="button" className="w-full rounded-md border border-dashed border-line-strong py-2 text-xs text-ink-3 hover:text-ink" onClick={() => setExpanded((s) => new Set(s).add(c.name))}>
                    Show {list.length - show.length} more
                  </button>
                )}
                {!list.length && <p className="py-6 text-center text-xs text-ink-4">No tasks</p>}
              </Column>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>{active ? <Card task={active} m={m} showStore={showStore} dragging /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ id, tone, count, children, disabled }: { id: string; tone: keyof typeof TONE; count: number; children: React.ReactNode; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div ref={setNodeRef} className={cn('flex w-[290px] shrink-0 flex-col rounded-lg border bg-wash/70 transition-colors', isOver ? 'border-sand-500 bg-sand-50' : 'border-line')}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className={cn('h-2 w-2 rounded-full', TONE[tone].dot)} aria-hidden />
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink">{id}</span>
        <span className="tnum ml-auto rounded-full bg-paper px-2 text-2xs font-semibold text-ink-3 ring-1 ring-line">{count}</span>
      </div>
      <div className="flex max-h-[calc(100vh-260px)] min-h-24 flex-col gap-2 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

const DraggableCard = memo(function DraggableCard({ task, m, showStore, disabled }: { task: Task; m: Model; showStore: boolean; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.Task_ID, disabled });
  const openTask = useApp((s) => s.openTask);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={`${task.Task_ID} ${task.Task_Title}`}
      onClick={() => openTask(task.Task_ID)}
      onKeyDown={(e) => e.key === 'Enter' && openTask(task.Task_ID)}
      className={cn('rounded-md', isDragging && 'opacity-30')}
    >
      <Card task={task} m={m} showStore={showStore} />
    </div>
  );
});

function Card({ task: t, m, showStore, dragging }: { task: Task; m: Model; showStore: boolean; dragging?: boolean }) {
  const delay = delayDays(t, m.today);
  const store = m.storesById.get(t.Store_ID);
  return (
    <div
      className={cn('cursor-pointer rounded-md border bg-paper p-2.5 text-left transition-shadow hover:shadow-sm', delay ? 'border-st-red/40' : 'border-line', dragging && 'rotate-1 shadow-pop')}
    >
      <div className="flex items-center gap-1.5 text-2xs text-ink-3">
        <span className="font-mono font-semibold text-ink-2">{t.Task_ID}</span>
        <span className="truncate">· {m.areasById.get(t.Area)?.Area_Name ?? t.Area}</span>
        <span className="ml-auto flex items-center gap-1">
          {isBlocked(t) && <BlockerMark />}
          {needsDecision(t) && <DecisionMark />}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-ink">{t.Task_Title}</p>
      {showStore && store && (
        <p className="mt-0.5 flex items-center gap-1 text-2xs text-ink-3">
          {store.Store_Name} {isAirport(store) && <AirportMark className="h-3 w-3" />}
        </p>
      )}
      <ProgressBar value={t.Progress_Percentage} showLabel height={4} className="mt-2" />
      <div className="mt-2 flex items-center gap-2 text-2xs">
        <span className="truncate text-ink-2">{t.Owner || 'Unassigned'}</span>
        <span className={cn('ml-auto inline-flex items-center gap-1 tnum', delay ? 'font-semibold text-st-red' : 'text-ink-3')}>
          <CalendarDays className="h-3 w-3" /> {t.Due_Date ? fmtShort(t.Due_Date) : '—'}
        </span>
        {delay ? <DelayBadge days={delay} /> : null}
        <RiskBadge level={t.Risk_Level} label={false} />
      </div>
    </div>
  );
}
