'use client';

import { ArrowDown, ArrowUp, Database, Lock, Plus, RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useEffect, useState } from 'react';
import { progressOf } from '@/lib/domain/metrics';
import { MINUTES_TEMPLATES } from '@/lib/domain/minutes';
import type { Area, Owner, ProgressMethod, RiskLevel, StatusDef, StatusTone } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import { useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { toast } from '@/lib/client/toasts';
import { RiskBadge, StatusPill, TONE } from '@/components/ui/badges';
import { Button, Card, Field, Input, Select, Textarea, cn } from '@/components/ui/primitives';

const SECTIONS = [
  ['areas', 'Functional areas'],
  ['owners', 'Owners'],
  ['statuses', 'Statuses'],
  ['risk', 'Risk levels'],
  ['progress', 'Progress calculation'],
  ['duesoon', 'Due soon threshold'],
  ['sal', 'SAL settings'],
  ['sheets', 'Google Sheets connection'],
  ['display', 'Display preferences'],
  ['quality', 'Data quality'],
] as const;

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const section = params.get('section') ?? 'areas';
  const issues = useApp((s) => s.snapshot?.issues.length ?? 0);
  return (
    <div className="mx-auto flex max-w-[1300px] gap-6 px-6 py-5">
      <nav className="w-56 shrink-0">
        <h1 className="mb-3 text-[1.6rem] font-semibold tracking-tight">Settings</h1>
        <ul className="space-y-0.5">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <button type="button" onClick={() => router.replace(`/settings?section=${id}`, { scroll: false })} className={cn('flex w-full items-center rounded-md px-3 py-1.5 text-left text-[13px]', section === id ? 'bg-paper font-semibold shadow-sm ring-1 ring-line' : 'text-ink-2 hover:bg-paper/60')}>
                {label}
                {id === 'quality' && issues > 0 && <span className="ml-auto rounded-full bg-st-amberBg px-1.5 text-2xs font-semibold text-st-amber">{issues}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        {section === 'areas' && <AreasSettings />}
        {section === 'owners' && <OwnersSettings />}
        {section === 'statuses' && <StatusSettings />}
        {section === 'risk' && <RiskSettings />}
        {section === 'progress' && <ProgressSettings />}
        {section === 'duesoon' && <DueSoonSettings />}
        {section === 'sal' && <SalSettings />}
        {section === 'sheets' && <SheetsSettings />}
        {section === 'display' && <DisplaySettings />}
        {section === 'quality' && <QualitySettings />}
      </div>
    </div>
  );
}

function Section({ title, desc, children, actions }: { title: string; desc?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Card title={title} actions={actions}>
      {desc && <p className="border-b border-line px-4 py-2.5 text-xs text-ink-3">{desc}</p>}
      <div className="p-4">{children}</div>
    </Card>
  );
}

function AreasSettings() {
  const m = useModel();
  const saveArea = useApp((s) => s.saveArea);
  const reorder = useApp((s) => s.reorderAreas);
  const [n, setN] = useState({ Area_ID: '', Area_Name: '', Group: '' });
  const areas = m.snap.areas;
  const count = (id: string) => m.tasks.filter((t) => t.Area === id).length;
  const move = (i: number, dir: -1 | 1) => {
    const ids = areas.map((a) => a.Area_ID);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder(ids);
  };
  const save = (a: Area, patch: Partial<Area>) => saveArea({ Area_ID: a.Area_ID, Area_Name: a.Area_Name, Group: a.Group, Order: a.Order, Active: a.Active, ...patch }, false);
  return (
    <Section title="Functional areas" desc="Areas come from the AREAS sheet — nothing is hard-coded. The code is used in Task IDs and cannot change; the name can be renamed at any time. Group nests areas in the meeting minutes (e.g. SAP / ERP / POS under IT). Disabled areas are hidden from dropdowns but their tasks are kept.">
      <div className="overflow-hidden rounded-md border border-line">
        <div className="grid grid-cols-[64px_80px_minmax(0,1fr)_160px_70px_90px] gap-3 border-b border-line bg-wash px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
          <span>Order</span><span>Code</span><span>Name</span><span>Group (minutes)</span><span className="text-right">Tasks</span><span>Active</span>
        </div>
        {areas.map((a, i) => (
          <div key={a.Area_ID} className={cn('grid grid-cols-[64px_80px_minmax(0,1fr)_160px_70px_90px] items-center gap-3 border-b border-line/60 px-3 py-1.5', !a.Active && 'opacity-60')}>
            <span className="flex">
              <button type="button" className="p-1 text-ink-3 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="p-1 text-ink-3 hover:text-ink disabled:opacity-30" disabled={i === areas.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
            </span>
            <span className="font-mono text-xs font-semibold">{a.Area_ID}</span>
            <Input defaultValue={a.Area_Name} key={a.Area_Name} onBlur={(e) => e.target.value.trim() !== a.Area_Name && save(a, { Area_Name: e.target.value })} />
            <Input defaultValue={a.Group} key={`g${a.Group}`} placeholder="—" onBlur={(e) => e.target.value.trim() !== a.Group && save(a, { Group: e.target.value.trim() })} />
            <span className="tnum text-right text-xs text-ink-3">{count(a.Area_ID)}</span>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-[#231D19]" checked={a.Active} onChange={(e) => save(a, { Active: e.target.checked })} /> {a.Active ? 'Active' : 'Disabled'}</label>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <Field label="Code"><Input value={n.Area_ID} onChange={(e) => setN({ ...n, Area_ID: e.target.value.toUpperCase() })} placeholder="VM" className="w-24" /></Field>
        <Field label="Name"><Input value={n.Area_Name} onChange={(e) => setN({ ...n, Area_Name: e.target.value })} placeholder="Visual Merchandising" className="w-64" /></Field>
        <Field label="Group"><Input value={n.Group} onChange={(e) => setN({ ...n, Group: e.target.value })} placeholder="optional" className="w-40" /></Field>
        <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} disabled={!n.Area_ID || !n.Area_Name} onClick={async () => { if (await saveArea({ ...n, Order: (areas[areas.length - 1]?.Order ?? 0) + 10, Active: true }, true)) setN({ Area_ID: '', Area_Name: '', Group: '' }); }}>
          Add area
        </Button>
      </div>
    </Section>
  );
}

function OwnersSettings() {
  const m = useModel();
  const saveOwner = useApp((s) => s.saveOwner);
  const [n, setN] = useState({ Name: '', Email: '', Function: '' });
  const save = (o: Owner, patch: Partial<Owner>) => saveOwner({ Owner_ID: o.Owner_ID, Name: o.Name, Email: o.Email, Function: o.Function, Active: o.Active, ...patch });
  const load = (name: string) => m.tasks.filter((t) => t.Owner === name && t.Status !== 'Completed' && t.Status !== 'N/A').length;
  return (
    <Section title="Owners" desc="Owners come from the OWNERS sheet and feed every owner dropdown (primary and secondary). Deactivate people instead of deleting them so history stays readable.">
      <div className="overflow-hidden rounded-md border border-line">
        <div className="grid grid-cols-[90px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_70px_90px] gap-3 border-b border-line bg-wash px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
          <span>ID</span><span>Name</span><span>Email</span><span>Function</span><span className="text-right">Open</span><span>Active</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {m.snap.owners.map((o) => (
            <div key={o.Owner_ID} className={cn('grid grid-cols-[90px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_70px_90px] items-center gap-3 border-b border-line/60 px-3 py-1.5', !o.Active && 'opacity-60')}>
              <span className="font-mono text-2xs text-ink-3">{o.Owner_ID}</span>
              <Input defaultValue={o.Name} key={o.Name} onBlur={(e) => e.target.value.trim() !== o.Name && save(o, { Name: e.target.value.trim() })} />
              <Input defaultValue={o.Email} key={`e${o.Email}`} onBlur={(e) => e.target.value.trim() !== o.Email && save(o, { Email: e.target.value.trim() })} />
              <Input defaultValue={o.Function} key={`f${o.Function}`} onBlur={(e) => e.target.value.trim() !== o.Function && save(o, { Function: e.target.value.trim() })} />
              <span className="tnum text-right text-xs text-ink-3">{load(o.Name)}</span>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-[#231D19]" checked={o.Active} onChange={(e) => save(o, { Active: e.target.checked })} /> {o.Active ? 'Active' : 'Inactive'}</label>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-2xs text-ink-3">Renaming an owner does not rewrite existing tasks (they reference the name as typed in Sheets); reassign them from the Action Log grouped by owner.</p>
      <div className="mt-4 flex items-end gap-2">
        <Field label="Name"><Input value={n.Name} onChange={(e) => setN({ ...n, Name: e.target.value })} className="w-52" /></Field>
        <Field label="Email"><Input value={n.Email} onChange={(e) => setN({ ...n, Email: e.target.value })} className="w-60" /></Field>
        <Field label="Function"><Input value={n.Function} onChange={(e) => setN({ ...n, Function: e.target.value })} className="w-48" /></Field>
        <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} disabled={!n.Name} onClick={async () => { if (await saveOwner({ ...n, Active: true })) setN({ Name: '', Email: '', Function: '' }); }}>Add owner</Button>
      </div>
    </Section>
  );
}

function StatusSettings() {
  const m = useModel();
  const update = useApp((s) => s.updateSettings);
  const [list, setList] = useState<StatusDef[]>(m.snap.settings.Statuses);
  const [name, setName] = useState('');
  useEffect(() => setList(m.snap.settings.Statuses), [m.snap.settings.Statuses]);
  const tones = Object.keys(TONE) as StatusTone[];
  const dirty = JSON.stringify(list) !== JSON.stringify(m.snap.settings.Statuses);
  return (
    <Section title="Statuses" desc="Core statuses drive the rules (Blocked, Completed, N/A…) and cannot be removed. You can change their colour and add custom statuses (they behave as open work). Status text is always displayed next to the colour." actions={<Button size="sm" variant="primary" disabled={!dirty} onClick={() => update({ Statuses: list })}>Save statuses</Button>}>
      <ul className="divide-y divide-line/60 rounded-md border border-line">
        {list.map((s, i) => (
          <li key={s.name} className="grid grid-cols-[180px_160px_140px_minmax(0,1fr)] items-center gap-3 px-3 py-2">
            <StatusPill status={s.name} />
            <Select value={s.tone} onChange={(e) => setList(list.map((x, k) => (k === i ? { ...x, tone: e.target.value as StatusTone } : x)))}>
              {tones.map((t) => <option key={t}>{t}</option>)}
            </Select>
            {s.core ? (
              <span className="flex items-center gap-1 text-xs text-ink-3"><Lock className="h-3 w-3" /> Core status</span>
            ) : (
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-[#231D19]" checked={s.active} onChange={(e) => setList(list.map((x, k) => (k === i ? { ...x, active: e.target.checked } : x)))} /> Active</label>
            )}
            <span className="text-2xs text-ink-3">{m.tasks.filter((t) => t.Status === s.name).length} tasks</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-end gap-2">
        <Field label="New status"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Waiting for Landlord" className="w-64" /></Field>
        <Button icon={<Plus className="h-3.5 w-3.5" />} disabled={!name.trim() || list.some((s) => s.name.toLowerCase() === name.trim().toLowerCase())} onClick={() => { setList([...list, { name: name.trim(), tone: 'violet', active: true, core: false }]); setName(''); }}>Add</Button>
      </div>
    </Section>
  );
}

function RiskSettings() {
  const m = useModel();
  const update = useApp((s) => s.updateSettings);
  const [g, setG] = useState(m.snap.settings.Risk_Guidance);
  return (
    <Section title="Risk levels" desc="Risk is assigned manually by the Project Manager — there is no automated score. The app shows factual indicators next to it (overdue, blocked, high-risk tasks, due soon, days to opening, completion). Guidance text helps keep assessments consistent." actions={<Button size="sm" variant="primary" onClick={() => update({ Risk_Guidance: g })}>Save guidance</Button>}>
      <div className="space-y-3">
        {(['Low', 'Medium', 'High'] as RiskLevel[]).map((r) => (
          <div key={r} className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
            <RiskBadge level={r} variant="solid" />
            <Textarea rows={2} value={g[r]} onChange={(e) => setG({ ...g, [r]: e.target.value })} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function ProgressSettings() {
  const m = useModel();
  const update = useApp((s) => s.updateSettings);
  const method = m.snap.settings.Progress_Method;
  const ex = m.stores.slice(0, 6);
  return (
    <Section title="Progress calculation" desc="N/A tasks are always excluded. On Hold tasks count with their actual progress (never as completed). Completed tasks count as 100%.">
      <div className="grid grid-cols-2 gap-3">
        {([['simple', 'Simple average', 'Average progress of applicable tasks.'], ['weighted', 'Weighted progress', 'SUM(progress × Task_Weight) / SUM(Task_Weight).']] as [ProgressMethod, string, string][]).map(([id, l, d]) => (
          <label key={id} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', method === id ? 'border-sand-500 bg-sand-50' : 'border-line')}>
            <input type="radio" className="mt-1 accent-[#231D19]" checked={method === id} onChange={() => update({ Progress_Method: id })} />
            <span><span className="block text-[13px] font-semibold">{l}</span><span className="text-xs text-ink-3">{d}</span></span>
          </label>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-line">
        <div className="grid grid-cols-3 border-b border-line bg-wash px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3"><span>Opening</span><span className="text-right">Simple</span><span className="text-right">Weighted</span></div>
        {ex.map((s) => {
          const t = m.tasksByStore.get(s.Store_ID) ?? [];
          return (
            <div key={s.Store_ID} className="grid grid-cols-3 border-b border-line/60 px-3 py-1.5 text-[13px]">
              <span>{s.Store_Name}</span>
              <span className={cn('tnum text-right', method === 'simple' && 'font-semibold')}>{progressOf(t, 'simple')}%</span>
              <span className={cn('tnum text-right', method === 'weighted' && 'font-semibold')}>{progressOf(t, 'weighted')}%</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function DueSoonSettings() {
  const m = useModel();
  const update = useApp((s) => s.updateSettings);
  const [v, setV] = useState(m.snap.settings.Due_Soon_Days);
  return (
    <Section title="Due soon threshold" desc="Open tasks with a due date between today and today + N days are flagged as “due soon” in SAL Focus, KPIs and filters.">
      <div className="flex items-end gap-2">
        <Field label="Days"><Input type="number" min={1} max={120} value={v} onChange={(e) => setV(Number(e.target.value))} className="w-28" /></Field>
        <Button variant="primary" disabled={v === m.snap.settings.Due_Soon_Days} onClick={() => update({ Due_Soon_Days: v })}>Save</Button>
      </div>
    </Section>
  );
}

function SalSettings() {
  const m = useModel();
  const update = useApp((s) => s.updateSettings);
  const [h, setH] = useState(m.snap.settings.Next_Steps_Horizon_Days);
  const [tpl, setTpl] = useState(m.snap.settings.Minutes_Template);
  return (
    <Section title="SAL settings" desc="Minutes are generated deterministically from TASK_HISTORY and the previous confirmed SAL baseline. Only “Confirm meeting minutes” creates a new baseline; previews never do.">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Next steps horizon (days)" hint="Open actions due within N days (and all overdue) are listed as next steps"><Input type="number" min={1} max={365} value={h} onChange={(e) => setH(Number(e.target.value))} className="w-28" /></Field>
        <Field label="Default minutes template">
          <Select value={tpl} onChange={(e) => setTpl(e.target.value)}>
            {MINUTES_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
        </Field>
        <Button variant="primary" onClick={() => update({ Next_Steps_Horizon_Days: h, Minutes_Template: tpl })}>Save</Button>
      </div>
      <ul className="mt-4 space-y-1 text-xs text-ink-3">
        {MINUTES_TEMPLATES.map((t) => <li key={t.id}><b className="text-ink-2">{t.label}</b> — {t.description}</li>)}
      </ul>
    </Section>
  );
}

function SheetsSettings() {
  const source = useApp((s) => s.snapshot?.meta.source);
  const resetDemo = useApp((s) => s.resetDemo);
  const [h, setH] = useState<Awaited<ReturnType<typeof api.health>> | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const test = async () => {
    setBusy(true);
    setErr('');
    try {
      setH(await api.health());
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  useEffect(() => {
    test();
  }, []);
  return (
    <Section title="Google Sheets connection" desc="Google Sheets is the Single Source of Truth. The browser never talks to Google: all reads/writes go through the server API with a service account kept in environment variables." actions={<Button size="sm" icon={<RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />} onClick={test}>Test connection</Button>}>
      <div className="flex items-start gap-3 rounded-md border border-line p-3">
        <Database className="mt-0.5 h-5 w-5 text-sand-600" />
        <div className="text-[13px]">
          <p className="font-semibold">{source === 'sheets' ? 'Connected to Google Sheets' : 'Local demo mode (JSON file)'}</p>
          {err ? <p className="mt-1 text-st-red">{err}</p> : h ? (
            <dl className="mt-1 grid grid-cols-[140px_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
              {Object.entries(h.details).map(([k, v]) => (<Fragment key={k}><dt className="text-ink-3">{k}</dt><dd className="break-all font-mono">{v || '—'}</dd></Fragment>))}
              <dt className="text-ink-3">Round trip</dt><dd>{h.latencyMs} ms</dd>
              <dt className="text-ink-3">Rows</dt><dd>{h.counts.stores} stores · {h.counts.tasks} tasks · {h.counts.history} history · {h.counts.sals} SALs</dd>
              <dt className="text-ink-3">Data issues</dt><dd>{h.issues}</dd>
            </dl>
          ) : <p className="text-xs text-ink-3">Checking…</p>}
        </div>
      </div>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-ink-2">
        <li>Create a Google Cloud service account and enable the Google Sheets API.</li>
        <li>Share the spreadsheet with the service account email (Editor).</li>
        <li>Set <code>GOOGLE_SHEETS_ID</code> and the credentials in the server environment (see <code>.env.example</code>).</li>
        <li>Run <code>npm run sheets:init</code> once to create the tabs, headers, dropdown validation and demo data.</li>
      </ol>
      {source === 'local' && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[13px] font-semibold">Demo data</p>
          <p className="text-xs text-ink-3">Restore the original demo dataset (all local changes are lost).</p>
          {confirmReset ? (
            <div className="mt-2 flex gap-2"><Button variant="danger" size="sm" onClick={() => { resetDemo(); setConfirmReset(false); }}>Yes, reset demo data</Button><Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button></div>
          ) : <Button className="mt-2" size="sm" onClick={() => setConfirmReset(true)}>Reset demo data</Button>}
        </div>
      )}
    </Section>
  );
}

function DisplaySettings() {
  const m = useModel();
  const userName = useApp((s) => s.userName);
  const setUserName = useApp((s) => s.setUserName);
  const update = useApp((s) => s.updateSettings);
  const [name, setName] = useState(userName || 'PMO Admin');
  const [prog, setProg] = useState({ Program_Name: m.snap.settings.Program_Name, Program_Year: m.snap.settings.Program_Year, Refresh_Interval_Seconds: m.snap.settings.Refresh_Interval_Seconds });
  return (
    <Section title="Display preferences">
      <div className="space-y-5">
        <div className="flex items-end gap-2">
          <Field label="Your name" hint="Written in Last_Updated_By / Updated_By for your changes (stored in this browser)"><Input value={name} onChange={(e) => setName(e.target.value)} className="w-64" /></Field>
          <Button variant="primary" onClick={() => { setUserName(name.trim()); try { localStorage.setItem('gg-roc-user', name.trim()); } catch { /* ignore */ } toast.success('Saved'); }}>Save</Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Program name"><Input value={prog.Program_Name} onChange={(e) => setProg({ ...prog, Program_Name: e.target.value })} className="w-64" /></Field>
          <Field label="Program / year label"><Input value={prog.Program_Year} onChange={(e) => setProg({ ...prog, Program_Year: e.target.value })} className="w-36" /></Field>
          <Field label="Auto refresh (seconds)"><Input type="number" min={15} max={3600} value={prog.Refresh_Interval_Seconds} onChange={(e) => setProg({ ...prog, Refresh_Interval_Seconds: Number(e.target.value) })} className="w-32" /></Field>
          <Button variant="primary" onClick={() => update(prog)}>Save</Button>
        </div>
        <div className="text-xs text-ink-3">
          <p className="font-semibold text-ink-2">Keyboard</p>
          <ul className="mt-1 space-y-0.5">
            <li>⌘K or / — global search · Shift+P — presentation mode · Esc — close panel / exit presentation</li>
            <li>Store SAL: ← → functional areas · [ ] previous/next opening · 1–5 SAL focus tabs</li>
            <li>Functional area: ← → previous/next area</li>
          </ul>
        </div>
      </div>
    </Section>
  );
}

function QualitySettings() {
  const m = useModel();
  const issues = m.snap.issues;
  return (
    <Section title="Data quality" desc="Problems found while reading the sheets. The app never crashes on malformed cells — it falls back to safe defaults and lists them here so they can be fixed in Google Sheets.">
      {issues.length === 0 ? <p className="text-[13px] text-st-green">No issues found. All references, dates, statuses and IDs are valid.</p> : (
        <div className="max-h-[65vh] overflow-y-auto rounded-md border border-line">
          <div className="sticky top-0 grid grid-cols-[80px_110px_150px_140px_minmax(0,1fr)] gap-3 border-b border-line bg-wash px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3"><span>Severity</span><span>Sheet</span><span>Row / key</span><span>Field</span><span>Issue</span></div>
          {issues.map((i, k) => (
            <div key={k} className="grid grid-cols-[80px_110px_150px_140px_minmax(0,1fr)] gap-3 border-b border-line/60 px-3 py-1.5 text-xs">
              <span className={cn('font-semibold', i.severity === 'error' ? 'text-st-red' : 'text-st-amber')}>{i.severity}</span>
              <span className="font-mono">{i.table}</span>
              <span className="font-mono">{i.rowKey}</span>
              <span className="font-mono text-ink-3">{i.field ?? '—'}</span>
              <span>{i.message}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
