'use client';

import { useState } from 'react';
import { OPENING_DATE_STATUSES, PROGRAM_TYPES, STORE_OVERALL_STATUSES, STORE_TYPES } from '@/lib/domain/schema';
import type { RiskLevel, Store, StorePatch, Task } from '@/lib/domain/types';
import { useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { DrawerFrame, TaskDrawer } from './TaskDrawer';

export function DrawerHost() {
  const drawer = useApp((s) => s.drawer);
  if (!drawer) return null;
  if (drawer.kind === 'task') return <TaskDrawer taskId={drawer.taskId} />;
  if (drawer.kind === 'new-task') return <NewTaskDrawer defaults={drawer.defaults} />;
  if (drawer.kind === 'store') return <StoreDrawer storeId={drawer.storeId} />;
  return <StoreDrawer />;
}

function NewTaskDrawer({ defaults }: { defaults: Partial<Task> }) {
  const m = useModel();
  const close = useApp((s) => s.closeDrawer);
  const create = useApp((s) => s.createTask);
  const openTask = useApp((s) => s.openTask);
  const [t, setT] = useState<Partial<Task>>({
    Store_ID: defaults.Store_ID ?? m.stores[0]?.Store_ID ?? '',
    Area: defaults.Area ?? m.activeAreas[0]?.Area_ID ?? '',
    Task_Title: '',
    Status: 'Not Started',
    Risk_Level: 'Low',
    Priority: 'Medium',
    Task_Weight: 1,
    Progress_Percentage: 0,
    ...defaults,
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Task>) => setT((x) => ({ ...x, ...p }));
  const valid = !!(t.Store_ID && t.Area && t.Task_Title?.trim());

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const created = await create(t as Task, note);
    setBusy(false);
    if (created) openTask(created.Task_ID);
  };

  return (
    <DrawerFrame onClose={close}>
      <div className="border-b border-line px-5 py-4">
        <div className="eyebrow">New task</div>
        <p className="mt-1 text-xs text-ink-3">The Task ID is generated automatically ({t.Store_ID || 'STORE'}-{t.Area || 'AREA'}-nnn) and never changes.</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4">
          <Field label="Store / opening">
            <Select value={t.Store_ID} onChange={(e) => set({ Store_ID: e.target.value })}>
              {m.stores.map((s) => <option key={s.Store_ID} value={s.Store_ID}>{s.Store_Name} ({s.Store_ID}) · {s.Program_Type}</option>)}
            </Select>
          </Field>
          <Field label="Functional area">
            <Select value={t.Area} onChange={(e) => set({ Area: e.target.value })}>
              {m.activeAreas.map((a) => <option key={a.Area_ID} value={a.Area_ID}>{a.Area_Name}</option>)}
            </Select>
          </Field>
          <Field label="Task title" className="col-span-2">
            <Input autoFocus value={t.Task_Title} onChange={(e) => set({ Task_Title: e.target.value })} placeholder="e.g. Airport access passes for store staff" onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </Field>
          <Field label="Description" className="col-span-2">
            <Textarea rows={2} value={t.Description ?? ''} onChange={(e) => set({ Description: e.target.value })} />
          </Field>
          <Field label="Owner">
            <Select value={t.Owner ?? ''} onChange={(e) => set({ Owner: e.target.value })}>
              <option value="">— Unassigned —</option>
              {m.activeOwners.map((o) => <option key={o.Owner_ID} value={o.Name}>{o.Name} · {o.Function}</option>)}
            </Select>
          </Field>
          <Field label="Secondary owner">
            <Select value={t.Secondary_Owner ?? ''} onChange={(e) => set({ Secondary_Owner: e.target.value })}>
              <option value="">—</option>
              {m.activeOwners.map((o) => <option key={o.Owner_ID} value={o.Name}>{o.Name}</option>)}
            </Select>
          </Field>
          <Field label="Start date"><Input type="date" value={t.Start_Date ?? ''} onChange={(e) => set({ Start_Date: e.target.value })} /></Field>
          <Field label="Due date"><Input type="date" value={t.Due_Date ?? ''} onChange={(e) => set({ Due_Date: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={t.Status} onChange={(e) => set({ Status: e.target.value })}>
              {m.activeStatuses.map((s) => <option key={s.name}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Risk">
            <Select value={t.Risk_Level} onChange={(e) => set({ Risk_Level: e.target.value as RiskLevel })}>
              {['Low', 'Medium', 'High'].map((r) => <option key={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={t.Priority} onChange={(e) => set({ Priority: e.target.value as RiskLevel })}>
              {['Low', 'Medium', 'High'].map((r) => <option key={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Weight"><Input type="number" min={0.1} step={0.5} value={t.Task_Weight ?? 1} onChange={(e) => set({ Task_Weight: Number(e.target.value) })} /></Field>
          <Field label="Blocker" className="col-span-2"><Input value={t.Blocker ?? ''} onChange={(e) => set({ Blocker: e.target.value })} placeholder="Leave empty if none" /></Field>
          <Field label="Decision required" className="col-span-2"><Input value={t.Decision_Required ?? ''} onChange={(e) => set({ Decision_Required: e.target.value })} placeholder="Leave empty if none" /></Field>
          <Field label="Dependencies" className="col-span-2"><Input value={t.Dependency ?? ''} onChange={(e) => set({ Dependency: e.target.value })} placeholder="Task IDs, comma separated" /></Field>
          <Field label="First note (optional)" className="col-span-2"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" disabled={!valid || busy} onClick={submit}>{busy ? 'Creating…' : 'Create task'}</Button>
      </div>
    </DrawerFrame>
  );
}

function StoreDrawer({ storeId }: { storeId?: string }) {
  const m = useModel();
  const close = useApp((s) => s.closeDrawer);
  const updateStore = useApp((s) => s.updateStore);
  const createStore = useApp((s) => s.createStore);
  const existing = storeId ? m.storesById.get(storeId) : undefined;
  const [s, setS] = useState<Partial<Store>>(
    existing ?? { Store_ID: '', Store_Name: '', Country: '', City: '', Store_Type: 'Standard Store', Program_Type: 'New Store', Opening_Date: '', Opening_Date_Status: 'TBD', Overall_Status: 'Planning', Risk_Level: 'Low', Project_Manager: '' },
  );
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Store>) => setS((x) => ({ ...x, ...p }));

  const submit = async () => {
    setBusy(true);
    if (existing) {
      const patch: StorePatch = {};
      for (const k of ['Store_Name', 'Country', 'City', 'Store_Type', 'Opening_Date', 'Opening_Date_Status', 'Program_Type', 'Overall_Status', 'Risk_Level', 'Project_Manager'] as const) {
        if (s[k] !== existing[k]) (patch as Record<string, unknown>)[k] = s[k];
      }
      const ok = await updateStore(existing.Store_ID, patch);
      setBusy(false);
      if (ok) close();
    } else {
      const created = await createStore(s as Store);
      setBusy(false);
      if (created) close();
    }
  };

  return (
    <DrawerFrame onClose={close} width="w-[480px]">
      <div className="border-b border-line px-5 py-4">
        <div className="eyebrow">{existing ? 'Edit opening' : 'New opening'}</div>
        <h2 className="mt-1 font-display text-2xl font-semibold">{s.Store_Name || 'New store / company'}</h2>
        {existing && <p className="mt-1 text-xs text-ink-3">Changes to opening date, risk and status are recorded in history and reported in the next meeting minutes.</p>}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4">
          <Field label="Store ID" hint={existing ? 'Immutable' : '2–8 letters/digits, used as Task ID prefix'}>
            <Input value={s.Store_ID} disabled={!!existing} onChange={(e) => set({ Store_ID: e.target.value.toUpperCase() })} placeholder="AMS" />
          </Field>
          <Field label="Name"><Input value={s.Store_Name} onChange={(e) => set({ Store_Name: e.target.value })} placeholder="Amsterdam Airport" /></Field>
          <Field label="Country"><Input value={s.Country} onChange={(e) => set({ Country: e.target.value })} /></Field>
          <Field label="City"><Input value={s.City} onChange={(e) => set({ City: e.target.value })} /></Field>
          <Field label="Program type">
            <Select value={s.Program_Type} onChange={(e) => set({ Program_Type: e.target.value as Store['Program_Type'], Store_Type: e.target.value === 'New Company' ? 'Company Opening' : s.Store_Type })}>
              {PROGRAM_TYPES.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Store type">
            <Select value={s.Store_Type} onChange={(e) => set({ Store_Type: e.target.value })}>
              {STORE_TYPES.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Opening date"><Input type="date" value={s.Opening_Date} onChange={(e) => set({ Opening_Date: e.target.value })} /></Field>
          <Field label="Opening date status">
            <Select value={s.Opening_Date_Status} onChange={(e) => set({ Opening_Date_Status: e.target.value as Store['Opening_Date_Status'] })}>
              {OPENING_DATE_STATUSES.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Overall status">
            <Select value={s.Overall_Status} onChange={(e) => set({ Overall_Status: e.target.value })}>
              {[...new Set([...STORE_OVERALL_STATUSES, s.Overall_Status ?? ''])].filter(Boolean).map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Risk level" hint="Manual PM assessment">
            <Select value={s.Risk_Level} onChange={(e) => set({ Risk_Level: e.target.value as RiskLevel })}>
              {['Low', 'Medium', 'High'].map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Project manager" className="col-span-2">
            <Select value={s.Project_Manager} onChange={(e) => set({ Project_Manager: e.target.value })}>
              <option value="">—</option>
              {m.activeOwners.map((o) => <option key={o.Owner_ID} value={o.Name}>{o.Name} · {o.Function}</option>)}
            </Select>
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" disabled={busy || !s.Store_ID || !s.Store_Name} onClick={submit}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Create opening'}</Button>
      </div>
    </DrawerFrame>
  );
}
