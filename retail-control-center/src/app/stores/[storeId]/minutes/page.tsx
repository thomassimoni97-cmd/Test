'use client';

import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, FileDown, History, Printer, RotateCcw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { addDaysISO, fmtDate, fmtTimestamp, isISODate } from '@/lib/domain/dates';
import { confirmedSals, firstSalBaseline, generateMinutes, MINUTES_TEMPLATES, renderHtml, renderText, resolveBaseline, SIGNAL_RANK, summaryFor, type Baseline, type MinutesDoc, type StructuredMinutes } from '@/lib/domain/minutes';
import type { SalRecord } from '@/lib/domain/types';
import { copyRich } from '@/lib/client/clipboard';
import { useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { toast } from '@/lib/client/toasts';
import { MinutesEditor, MinutesView } from '@/components/minutes/MinutesEditor';
import { Button, Card, Field, Input, Select, cn } from '@/components/ui/primitives';

interface Draft {
  doc: MinutesDoc;
  generatedText: string;
  generatedAt: string;
  baselineTs: string;
  baselineMode: 'diff' | 'recap';
  previousSalDate: string;
  salDate: string;
  templateId: string;
  firstStart?: string;
  included: { taskId: string; area: string; signals: string[] }[];
}

const SIGNAL_LABEL: Record<string, string> = {
  newBlocker: 'New blocker', overdue: 'Overdue', newDecision: 'Decision required', deadline: 'Deadline changed', status: 'Status changed',
  owner: 'Owner changed', risk: 'Risk changed', priority: 'Priority changed', resolvedBlocker: 'Blocker resolved', resolvedDecision: 'Decision taken',
  archived: 'Archived', completed: 'Completed', note: 'New note', progress: 'Progress', created: 'New task', recap: 'Current state',
};

export default function MinutesGeneratorPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const m = useModel();
  const store = m.storesById.get(storeId);
  const draft = useApp((s) => s.prefs[`minutesDraft.${storeId}`]) as Draft | undefined;
  const setPref = useApp((s) => s.setPref);
  const confirmSal = useApp((s) => s.confirmSal);
  const [confirmed, setConfirmed] = useState<SalRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [askRegenerate, setAskRegenerate] = useState(false);
  const [firstMode, setFirstMode] = useState<'since' | 'recap'>('since');
  const [firstStart, setFirstStart] = useState(addDaysISO(m.today, -14));
  const [salDate, setSalDate] = useState(draft?.salDate ?? m.today);
  const [templateId, setTemplateId] = useState(draft?.templateId ?? m.snap.settings.Minutes_Template ?? 'standard');

  const baseline = useMemo(() => (store ? resolveBaseline(m.snap.sals, store.Store_ID) : null), [store, m.snap.sals]);
  const prevSal = store ? confirmedSals(m.snap.sals, store.Store_ID).pop() : undefined;
  const staleDraft = !!draft && !!baseline && draft.baselineTs !== baseline.timestamp;

  const generate = (b: Baseline, opts: { firstStart?: string; templateId?: string } = {}) => {
    if (!store) return;
    const tpl = opts.templateId ?? templateId;
    const { data, doc } = generateMinutes({ store, tasks: m.snap.tasks, history: m.snap.history, areas: m.snap.areas, settings: m.snap.settings, baseline: b, now: new Date(), today: m.today, salDate }, tpl);
    const d: Draft = {
      doc,
      generatedText: renderText(doc),
      generatedAt: data.generatedAt,
      baselineTs: b.timestamp,
      baselineMode: b.mode,
      previousSalDate: b.previousSalDate,
      salDate,
      templateId: tpl,
      firstStart: opts.firstStart,
      included: data.areas.flatMap((a) => a.items.map((i) => ({ taskId: i.task.Task_ID, area: a.area.Area_ID, signals: i.signals }))),
    };
    setPref(`minutesDraft.${storeId}`, d);
    setAskRegenerate(false);
    setConfirmed(null);
  };

  // auto-generate the first preview when a baseline exists
  useEffect(() => {
    if (store && baseline && (!draft || staleDraft)) generate(baseline);
  }, [store, baseline]); // eslint-disable-line react-hooks/exhaustive-deps

  // structured data for the side panel (recomputed live; the doc itself is the user's draft)
  const structured: StructuredMinutes | null = useMemo(() => {
    if (!store || !draft) return null;
    const b: Baseline = baseline && draft.baselineMode === 'diff' && draft.baselineTs === baseline.timestamp ? baseline : draft.baselineMode === 'recap' ? firstSalBaseline({}) : { ...firstSalBaseline({ startDate: draft.firstStart }), timestamp: draft.baselineTs };
    return generateMinutes({ store, tasks: m.snap.tasks, history: m.snap.history, areas: m.snap.areas, settings: m.snap.settings, baseline: b, now: new Date(), today: m.today, salDate }).data;
  }, [store, draft, baseline, m, salDate]);

  if (!store) return <div className="p-8 text-sm text-ink-3">Opening not found.</div>;

  const draftBaseline = (): Baseline => baseline ?? (draft?.baselineMode === 'recap' ? firstSalBaseline({}) : firstSalBaseline({ startDate: draft?.firstStart }));
  const regenerate = (tpl?: string) => generate(draftBaseline(), { firstStart: draft?.firstStart, templateId: tpl });

  const setDoc = (doc: MinutesDoc) => draft && setPref(`minutesDraft.${storeId}`, { ...draft, doc });
  const text = draft ? renderText(draft.doc) : '';
  const edited = !!draft && text !== draft.generatedText;

  const doCopy = async () => {
    if (!draft) return;
    const ok = await copyRich(text, renderHtml(draft.doc));
    if (ok) toast.success('Minutes copied', 'Paste into Outlook, Teams or Word — headings, numbering and bullets are preserved.');
    else toast.error('Copy failed', 'Your browser blocked clipboard access.');
  };

  const doConfirm = async () => {
    if (!draft) return;
    if (!isISODate(salDate)) return toast.error('Invalid SAL date');
    setBusy(true);
    const finalDoc: MinutesDoc = { ...draft.doc, headerLines: draft.doc.headerLines.map((l) => (l.startsWith('Current SAL:') ? `Current SAL: ${fmtDate(salDate)}` : l)) };
    const sal = await confirmSal({
      storeId: store.Store_ID,
      salDate,
      baselineTimestamp: draft.baselineTs,
      previousSalDate: draft.previousSalDate,
      generationTimestamp: draft.generatedAt,
      generatedMinutes: draft.generatedText,
      finalMinutes: renderText(finalDoc),
      minutesJson: JSON.stringify({ doc: finalDoc, included: draft.included }),
    });
    setBusy(false);
    if (sal) {
      setConfirmed(sal);
      setPref(`minutesDraft.${storeId}`, undefined);
      toast.success('Meeting minutes confirmed', 'A new SAL baseline has been created. The next minutes will start from here.');
    }
  };

  // ── first SAL chooser ──
  const firstSalChooser = (
    <Card className="mx-auto max-w-2xl">
      <div className="p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-sand-600" />
          <div>
            <h2 className="text-base font-semibold">First SAL for {store.Store_Name}</h2>
            <p className="mt-1 text-[13px] text-ink-2">There is no confirmed SAL yet, so there is no baseline to compare with. Choose how to build the first minutes. Confirming them creates the first baseline.</p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <label className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', firstMode === 'since' ? 'border-sand-500 bg-sand-50' : 'border-line')}>
            <input type="radio" className="mt-1 accent-[#231D19]" checked={firstMode === 'since'} onChange={() => setFirstMode('since')} />
            <div className="flex-1">
              <p className="text-[13px] font-semibold">Changes since a starting date</p>
              <p className="text-xs text-ink-3">Uses TASK_HISTORY from the selected date.</p>
              <Input type="date" className="mt-2" value={firstStart} onChange={(e) => setFirstStart(e.target.value)} />
            </div>
          </label>
          <label className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', firstMode === 'recap' ? 'border-sand-500 bg-sand-50' : 'border-line')}>
            <input type="radio" className="mt-1 accent-[#231D19]" checked={firstMode === 'recap'} onChange={() => setFirstMode('recap')} />
            <div>
              <p className="text-[13px] font-semibold">Initial current-state recap</p>
              <p className="text-xs text-ink-3">One bullet per applicable activity with its current status, blockers and deadlines.</p>
            </div>
          </label>
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="gold" onClick={() => generate(firstMode === 'recap' ? firstSalBaseline({}) : firstSalBaseline({ startDate: firstStart }), { firstStart: firstMode === 'since' ? firstStart : undefined })}>
            Generate preview
          </Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-5">
      <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/stores/${store.Store_ID}`} className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {store.Store_Name} SAL
          </Link>
          <h1 className="mt-1 text-[1.6rem] font-semibold tracking-tight">Meeting minutes · {store.Store_Name}</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {prevSal ? (
              <>Comparing with the SAL of <b className="font-semibold text-ink-2">{fmtDate(prevSal.SAL_Date)}</b> (confirmed {fmtTimestamp(prevSal.Confirmation_Timestamp)}). </>
            ) : (
              <>First SAL — no previous baseline. </>
            )}
            This is a draft: nothing is saved and the baseline does not change until you confirm.
          </p>
        </div>
        <Link href={`/minutes?store=${store.Store_ID}`}>
          <Button size="sm" icon={<History className="h-3.5 w-3.5" />}>Minutes history</Button>
        </Link>
      </div>

      {confirmed ? (
        <Card className="mx-auto max-w-2xl">
          <div className="p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-st-green" />
            <h2 className="mt-2 text-base font-semibold">Minutes confirmed — new baseline created</h2>
            <p className="mt-1 text-[13px] text-ink-2">SAL of {fmtDate(confirmed.SAL_Date)} saved in SAL_HISTORY at {fmtTimestamp(confirmed.Confirmation_Timestamp)}. The next minutes for {store.Store_Name} will compare from this point.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link href={`/minutes?store=${store.Store_ID}&sal=${confirmed.SAL_ID}`}><Button>Open in Minutes history</Button></Link>
              <Link href={`/stores/${store.Store_ID}`}><Button variant="primary">Back to Store SAL</Button></Link>
            </div>
          </div>
        </Card>
      ) : !draft ? (
        baseline ? <p className="text-sm text-ink-3">Generating…</p> : firstSalChooser
      ) : (
        <div className="grid grid-cols-12 gap-5">
          <div className="no-print col-span-12 lg:col-span-8">
            {staleDraft && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-st-amber/40 bg-st-amberBg px-3 py-2 text-xs text-st-amber">
                <AlertTriangle className="h-4 w-4" /> A newer SAL was confirmed since this draft was generated. Regenerate before confirming.
              </div>
            )}
            <MinutesEditor doc={draft.doc} onChange={setDoc} />
          </div>
          <aside className="no-print col-span-12 space-y-4 lg:col-span-4">
            <div className="sticky top-4 space-y-4">
              <Card title="Finalize">
                <div className="space-y-3 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="SAL date"><Input type="date" value={salDate} onChange={(e) => setSalDate(e.target.value)} /></Field>
                    <Field label="Template">
                      <Select
                        value={templateId}
                        onChange={(e) => {
                          setTemplateId(e.target.value);
                          if (!edited) regenerate(e.target.value);
                          else toast.info('Template changed', 'Use “Regenerate from data” to apply it (your edits will be replaced).');
                        }}
                      >
                        {MINUTES_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <p className="text-2xs text-ink-3">
                    Generated {fmtTimestamp(draft.generatedAt)}{edited && ' · edited by you'} · {draft.baselineMode === 'recap' ? 'current-state recap' : `changes since ${fmtDate(draft.previousSalDate) }`}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <Button icon={<Copy className="h-3.5 w-3.5" />} onClick={doCopy}>Copy</Button>
                    <Button icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>Print</Button>
                    <Button icon={<FileDown className="h-3.5 w-3.5" />} onClick={() => { toast.info('Export PDF', 'Choose “Save as PDF” as the destination in the print dialog.'); setTimeout(() => window.print(), 300); }}>PDF</Button>
                  </div>
                  <Button variant="gold" size="lg" className="w-full" disabled={busy || staleDraft} onClick={doConfirm}>
                    {busy ? 'Confirming…' : 'Confirm meeting minutes'}
                  </Button>
                  <p className="text-2xs text-ink-3">Confirm saves the final text in SAL_HISTORY and creates the new baseline for {store.Store_Name}. Nothing is sent or published.</p>
                  <div className="border-t border-line pt-3">
                    {askRegenerate ? (
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-st-amber">Discard your edits and regenerate?</span>
                        <span className="flex gap-1">
                          <Button size="sm" variant="danger" onClick={() => regenerate()}>Regenerate</Button>
                          <Button size="sm" variant="ghost" onClick={() => setAskRegenerate(false)}>Cancel</Button>
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => (edited ? setAskRegenerate(true) : regenerate())}>
                          Regenerate from data
                        </Button>
                        {!baseline && (
                          <Button size="sm" variant="quiet" onClick={() => setPref(`minutesDraft.${storeId}`, undefined)}>
                            Change first-SAL option
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {structured && (
                <Card title="Detected changes" actions={<span className="text-2xs text-ink-3">{structured.counts.changedTasks} tasks</span>}>
                  <div className="grid grid-cols-4 divide-x divide-line border-b border-line text-center">
                    {[
                      ['Blockers', structured.counts.newBlockers, 'text-st-red'],
                      ['Completed', structured.counts.completed, 'text-st-green'],
                      ['Notes', structured.counts.notes, 'text-ink'],
                      ['New', structured.counts.created, 'text-ink'],
                    ].map(([l, v, c]) => (
                      <div key={l as string} className="py-2">
                        <div className={cn('tnum text-lg font-semibold', v ? (c as string) : 'text-ink-4')}>{v as number}</div>
                        <div className="text-2xs uppercase tracking-wide text-ink-3">{l as string}</div>
                      </div>
                    ))}
                  </div>
                  <ul className="max-h-[42vh] divide-y divide-line/70 overflow-y-auto">
                    {structured.areas.flatMap((a) => a.items.map((i) => ({ a, i }))).sort((x, y) => x.i.rank - y.i.rank).map(({ a, i }) => (
                      <li key={i.task.Task_ID} className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-1 text-2xs">
                          <span className="font-mono font-semibold text-ink-2">{i.task.Task_ID}</span>
                          <span className="text-ink-3">· {a.area.Area_Name}</span>
                          {[...i.signals].sort((x, y) => SIGNAL_RANK[x] - SIGNAL_RANK[y]).map((s) => (
                            <span key={s} className={cn('rounded px-1 font-medium', s === 'newBlocker' || s === 'overdue' ? 'bg-st-redBg text-st-red' : s === 'newDecision' ? 'bg-st-violetBg text-st-violet' : s === 'completed' ? 'bg-st-greenBg text-st-green' : 'bg-wash text-ink-2')}>
                              {SIGNAL_LABEL[s]}
                            </span>
                          ))}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{summaryFor(i)}</p>
                      </li>
                    ))}
                    {!structured.areas.length && <li className="px-4 py-6 text-center text-xs text-ink-3">No relevant changes detected.</li>}
                  </ul>
                </Card>
              )}
            </div>
          </aside>
          <div className="print-only col-span-12">
            <MinutesView doc={draft.doc} />
          </div>
        </div>
      )}
    </div>
  );
}
