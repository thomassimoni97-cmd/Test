'use client';

import { Archive, ArrowUpRight, Link2, Lock, LockOpen, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fmtDate, fmtTimestamp } from '@/lib/domain/dates';
import { delayDays, isAirport, lateCompletionDays } from '@/lib/domain/metrics';
import { flagOn } from '@/lib/domain/schema';
import type { Task, TaskPatch } from '@/lib/domain/types';
import { useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { AirportMark, BlockerMark, DecisionMark, DelayBadge, RiskBadge, StatusPill } from '@/components/ui/badges';
import { Button, Field, Input, Kbd, Select, Textarea, cn } from '@/components/ui/primitives';
import { TaskHistory } from './TaskHistory';

export function DrawerFrame({ children, onClose, width = 'w-[560px]' }: { children: React.ReactNode; onClose: () => void; width?: string }) {
  return (
    <aside className={cn('no-print fixed bottom-0 right-0 top-0 z-50 flex max-w-[96vw] animate-slidein flex-col border-l border-line bg-paper shadow-drawer', width)} role="dialog" aria-modal="false">
      <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-wash hover:text-ink" aria-label="Close (Esc)" title="Close (Esc)">
        <X className="h-4 w-4" />
      </button>
      {children}
    </aside>
  );
}

/** Text field that saves on blur (Enter for single-line). */
function BlurText({ value, onSave, multiline, placeholder, disabled, className, rows = 2 }: { value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string; disabled?: boolean; className?: string; rows?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v.trim() !== value.trim()) onSave(v);
  };
  if (disabled) return <p className={cn('whitespace-pre-wrap text-[13px] text-ink', !value && 'text-ink-4', className)}>{value || placeholder || '—'}</p>;
  return multiline ? (
    <Textarea value={v} rows={rows} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} className={className} />
  ) : (
    <Input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={cn('w-full', className)} />
  );
}

export function TaskDrawer({ taskId }: { taskId: string }) {
  const m = useModel();
  const task = m.snap.tasks.find((t) => t.Task_ID === taskId);
  const close = useApp((s) => s.closeDrawer);
  const update = useApp((s) => s.updateTask);
  const addNote = useApp((s) => s.addNote);
  const archive = useApp((s) => s.archiveTask);
  const openTask = useApp((s) => s.openTask);
  const presentation = useApp((s) => s.presentation);
  const [unlocked, setUnlocked] = useState(false);
  const [note, setNote] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  useEffect(() => {
    setNote('');
    setConfirmArchive(false);
  }, [taskId]);

  const history = m.historyByTask.get(taskId) ?? [];
  const dependents = useMemo(() => m.tasks.filter((t) => t.Dependency.split(/[,;\s]+/).includes(taskId)), [m.tasks, taskId]);

  if (!task) {
    return (
      <DrawerFrame onClose={close}>
        <div className="p-6 text-sm text-ink-3">Task {taskId} not found (it may have been removed from the sheet).</div>
      </DrawerFrame>
    );
  }
  const store = m.storesById.get(task.Store_ID);
  const area = m.areasById.get(task.Area);
  const readOnly = (presentation && !unlocked) || task.Archived;
  const save = (patch: TaskPatch) => update(task.Task_ID, patch);
  const delay = delayDays(task, m.today);
  const late = lateCompletionDays(task);
  const deps = task.Dependency.split(/[,;\s]+/).map((d) => d.trim()).filter(Boolean);
  const submitNote = async () => {
    if (!note.trim()) return;
    const ok = await addNote(task.Task_ID, note);
    if (ok !== false) setNote('');
  };

  return (
    <DrawerFrame onClose={close}>
      <div className="border-b border-line px-5 pb-4 pt-4">
        <div className="flex items-center gap-2 pr-10 text-xs text-ink-3">
          <span className="tnum rounded bg-wash px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-2">{task.Task_ID}</span>
          {store && (
            <Link href={`/stores/${store.Store_ID}`} className="inline-flex items-center gap-1 hover:text-ink" onClick={close}>
              {store.Store_Name} {isAirport(store) && <AirportMark />}
            </Link>
          )}
          <span>·</span>
          <span>{area?.Area_Name ?? task.Area}</span>
          {task.Archived && <span className="rounded bg-st-greyBg px-1.5 text-2xs font-semibold uppercase text-st-grey">Archived</span>}
        </div>
        <div className="mt-2">
          {readOnly ? <h2 className="pr-8 text-lg font-semibold leading-snug text-ink">{task.Task_Title}</h2> : <BlurText value={task.Task_Title.replace(/\n/g, ' ')} onSave={(v) => save({ Task_Title: v.replace(/\s*\n\s*/g, ' ') })} multiline rows={2} className="resize-none border-transparent px-1.5 py-1 text-lg font-semibold leading-snug hover:border-line-strong" />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill status={task.Status} />
          <RiskBadge level={task.Risk_Level} variant="solid" />
          {delay ? <DelayBadge days={delay} /> : null}
          {flagOn(task.Blocker) && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-st-redBg px-2 text-xs font-medium text-st-red">
              <BlockerMark /> Blocker
            </span>
          )}
          {flagOn(task.Decision_Required) && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-st-violetBg px-2 text-xs font-medium text-st-violet">
              <DecisionMark /> Decision required
            </span>
          )}
          {presentation && !task.Archived && (
            <button type="button" onClick={() => setUnlocked((u) => !u)} className="ml-auto inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
              {unlocked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} {unlocked ? 'Editing' : 'Quick edit'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4">
          <Field label="Status">
            {readOnly ? <StatusPill status={task.Status} /> : (
              <Select value={task.Status} onChange={(e) => save({ Status: e.target.value })}>
                {m.activeStatuses.map((s) => <option key={s.name}>{s.name}</option>)}
                {!m.statusDefs.has(task.Status) && <option>{task.Status}</option>}
              </Select>
            )}
          </Field>
          <Field label={`Progress · ${task.Progress_Percentage}%`}>
            {readOnly ? (
              <div className="h-2 overflow-hidden rounded-full bg-sand-100"><div className="h-full bg-sand-500" style={{ width: `${task.Progress_Percentage}%` }} /></div>
            ) : (
              <ProgressEditor value={task.Progress_Percentage} onSave={(v) => save({ Progress_Percentage: v })} />
            )}
          </Field>
          <Field label="Owner">
            {readOnly ? <p className="text-[13px]">{task.Owner || '—'}</p> : (
              <Select value={task.Owner} onChange={(e) => save({ Owner: e.target.value })}>
                <option value="">— Unassigned —</option>
                {m.activeOwners.map((o) => <option key={o.Owner_ID} value={o.Name}>{o.Name} · {o.Function}</option>)}
                {task.Owner && !m.ownersByName.has(task.Owner) && <option value={task.Owner}>{task.Owner} (not in OWNERS)</option>}
              </Select>
            )}
          </Field>
          <Field label="Secondary owner">
            {readOnly ? <p className="text-[13px]">{task.Secondary_Owner || '—'}</p> : (
              <Select value={task.Secondary_Owner} onChange={(e) => save({ Secondary_Owner: e.target.value })}>
                <option value="">—</option>
                {m.activeOwners.map((o) => <option key={o.Owner_ID} value={o.Name}>{o.Name}</option>)}
                {task.Secondary_Owner && !m.ownersByName.has(task.Secondary_Owner) && <option value={task.Secondary_Owner}>{task.Secondary_Owner}</option>}
              </Select>
            )}
          </Field>
          <Field label="Start date">
            {readOnly ? <p className="tnum text-[13px]">{fmtDate(task.Start_Date)}</p> : <Input type="date" value={task.Start_Date} onChange={(e) => save({ Start_Date: e.target.value })} />}
          </Field>
          <Field label="Due date" hint={delay ? <span className="text-st-red">Overdue by {delay} days</span> : late ? `Completed ${late} days late` : undefined}>
            {readOnly ? <p className="tnum text-[13px]">{fmtDate(task.Due_Date)}</p> : <Input type="date" value={task.Due_Date} onChange={(e) => save({ Due_Date: e.target.value })} className={cn(delay && 'border-st-red/50 text-st-red')} />}
          </Field>
          <Field label="Risk">
            {readOnly ? <RiskBadge level={task.Risk_Level} /> : (
              <Select value={task.Risk_Level} onChange={(e) => save({ Risk_Level: e.target.value as Task['Risk_Level'] })}>
                {['Low', 'Medium', 'High'].map((r) => <option key={r}>{r}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Priority">
            {readOnly ? <p className="text-[13px]">{task.Priority}</p> : (
              <Select value={task.Priority} onChange={(e) => save({ Priority: e.target.value as Task['Priority'] })}>
                {['Low', 'Medium', 'High'].map((r) => <option key={r}>{r}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Area">
            {readOnly ? <p className="text-[13px]">{area?.Area_Name ?? task.Area}</p> : (
              <Select value={task.Area} onChange={(e) => save({ Area: e.target.value })}>
                {m.snap.areas.filter((a) => a.Active || a.Area_ID === task.Area).map((a) => <option key={a.Area_ID} value={a.Area_ID}>{a.Area_Name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Weight" hint={m.snap.settings.Progress_Method === 'weighted' ? 'Used by weighted progress' : 'Only used with weighted progress'}>
            {readOnly ? <p className="text-[13px]">{task.Task_Weight}</p> : <BlurText value={String(task.Task_Weight)} onSave={(v) => save({ Task_Weight: Number(v) })} />}
          </Field>

          <div className="col-span-2">
            <Field label="Blocker">
              <div className={cn('rounded-md', flagOn(task.Blocker) && 'ring-1 ring-st-red/30')}>
                <BlurText value={task.Blocker} onSave={(v) => save({ Blocker: v })} multiline rows={2} disabled={readOnly} placeholder="Describe what is blocking this activity (leave empty if none)" className={cn(flagOn(task.Blocker) && 'bg-st-redBg/40')} />
              </div>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Decision required">
              <div className={cn('rounded-md', flagOn(task.Decision_Required) && 'ring-1 ring-st-violet/30')}>
                <BlurText value={task.Decision_Required} onSave={(v) => save({ Decision_Required: v })} multiline rows={2} disabled={readOnly} placeholder="Which decision is needed, from whom (leave empty if none)" className={cn(flagOn(task.Decision_Required) && 'bg-st-violetBg/40')} />
              </div>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Description">
              <BlurText value={task.Description} onSave={(v) => save({ Description: v })} multiline rows={3} disabled={readOnly} placeholder="Scope, context, acceptance criteria" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Dependencies">
              {!readOnly && <BlurText value={task.Dependency} onSave={(v) => save({ Dependency: v })} placeholder="Task IDs, comma separated (e.g. AMS-CON-001)" />}
              {(deps.length > 0 || dependents.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {deps.map((d) => {
                    const dt = m.snap.tasks.find((t) => t.Task_ID === d);
                    return (
                      <button key={d} type="button" onClick={() => dt && openTask(d)} className="inline-flex items-center gap-1 rounded-md border border-line bg-wash px-2 py-0.5 text-2xs text-ink-2 hover:border-ink-4" title={dt?.Task_Title ?? 'Unknown task'}>
                        <Link2 className="h-3 w-3" /> depends on <b className="font-semibold">{d}</b> {dt && <StatusPill status={dt.Status} size="sm" className="ml-1 h-4" />}
                      </button>
                    );
                  })}
                  {dependents.map((d) => (
                    <button key={d.Task_ID} type="button" onClick={() => openTask(d.Task_ID)} className="inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-0.5 text-2xs text-ink-2 hover:border-ink-4" title={d.Task_Title}>
                      <ArrowUpRight className="h-3 w-3" /> blocks <b className="font-semibold">{d.Task_ID}</b>
                    </button>
                  ))}
                </div>
              )}
              {readOnly && !deps.length && !dependents.length && <p className="text-[13px] text-ink-4">—</p>}
            </Field>
          </div>
        </div>

        {!task.Archived && (
          <div className="border-t border-line bg-ivory/60 px-5 py-4">
            <div className="eyebrow mb-2">Add update / note</div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What happened? The current date is added automatically, e.g. [28 Sep 2026]: …"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitNote();
              }}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-2xs text-ink-3">
                Saved to TASK_HISTORY · <Kbd>⌘</Kbd>+<Kbd>Enter</Kbd>
              </span>
              <Button variant="primary" size="sm" disabled={!note.trim()} onClick={submitNote}>
                Save note
              </Button>
            </div>
          </div>
        )}

        <div className="border-t border-line px-5 py-4">
          <div className="eyebrow mb-3">Task history</div>
          <TaskHistory entries={history} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-2xs text-ink-3">
        <span>
          Last update {fmtTimestamp(task.Last_Update)} · {task.Last_Updated_By || '—'} · v{task.Version}
        </span>
        {!readOnly && !task.Archived && (
          confirmArchive ? (
            <span className="flex items-center gap-2">
              Archive this task? History is kept.
              <Button size="sm" variant="danger" onClick={() => archive(task.Task_ID).then((ok) => ok && close())}>Archive</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(false)}>Cancel</Button>
            </span>
          ) : (
            <Button size="sm" variant="quiet" icon={<Archive className="h-3.5 w-3.5" />} onClick={() => setConfirmArchive(true)}>
              Archive
            </Button>
          )
        )}
      </div>
    </DrawerFrame>
  );
}

function ProgressEditor({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="flex h-8 items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v !== value && onSave(v)}
        onKeyUp={() => v !== value && onSave(v)}
        className="h-1.5 flex-1 cursor-pointer accent-[#B08D57]"
        aria-label="Progress"
      />
      <Input
        type="number"
        min={0}
        max={100}
        value={v}
        onChange={(e) => setV(Math.max(0, Math.min(100, Number(e.target.value))))}
        onBlur={() => v !== value && onSave(v)}
        className="tnum w-16 text-right"
      />
    </div>
  );
}
