'use client';

import { Copy, FileText, Printer } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { fmtDate, fmtTimestamp } from '@/lib/domain/dates';
import { isAirport } from '@/lib/domain/metrics';
import { parseSnapshot, renderHtml, renderText, type MinutesDoc } from '@/lib/domain/minutes';
import type { SalRecord } from '@/lib/domain/types';
import { copyRich } from '@/lib/client/clipboard';
import { isArtifact } from '@/lib/client/env';
import { useModel } from '@/lib/client/model';
import { toast } from '@/lib/client/toasts';
import { MinutesView } from '@/components/minutes/MinutesEditor';
import { AirportMark, ProgressBar, StatusPill } from '@/components/ui/badges';
import { Button, Card, Empty, Segmented, cn } from '@/components/ui/primitives';

export default function MinutesHistoryPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const m = useModel();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<'final' | 'generated' | 'snapshot'>('final');
  const salsByStore = useMemo(() => {
    const map = new Map<string, SalRecord[]>();
    for (const s of m.snap.sals.filter((x) => x.Confirmed)) map.set(s.Store_ID, [...(map.get(s.Store_ID) ?? []), s]);
    for (const l of map.values()) l.sort((a, b) => b.Confirmation_Timestamp.localeCompare(a.Confirmation_Timestamp));
    return map;
  }, [m.snap.sals]);
  const storeId = params.get('store') ?? [...salsByStore.keys()][0] ?? m.stores[0]?.Store_ID ?? '';
  const list = salsByStore.get(storeId) ?? [];
  const sal = list.find((s) => s.SAL_ID === params.get('sal')) ?? list[0];
  const store = m.storesById.get(storeId);

  // Minutes_JSON holds the structured final doc; if Final_Minutes was edited in the Sheet afterwards, the text wins.
  const parsed = useMemo(() => {
    if (!sal) return null;
    let doc: MinutesDoc | null = null;
    let included: { taskId: string; area: string; signals: string[] }[] = [];
    try {
      const j = JSON.parse(sal.Minutes_JSON || '{}');
      doc = j.doc ?? null;
      included = j.included ?? [];
    } catch {
      /* legacy / manual row */
    }
    return { doc, included, snapshot: parseSnapshot(sal.Snapshot_JSON) };
  }, [sal]);

  const go = (s: string, id?: string) => router.replace(`/minutes?store=${s}${id ? `&sal=${id}` : ''}`, { scroll: false });

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-6 py-5">
      <div className="no-print">
        <div className="eyebrow">SAL_HISTORY · confirmed minutes and baselines</div>
        <h1 className="mt-0.5 text-[1.6rem] font-semibold tracking-tight">Meeting Minutes</h1>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <Card className="no-print col-span-12 md:col-span-3" title="Openings">
          <ul className="max-h-[75vh] overflow-y-auto">
            {m.stores.map((s) => {
              const n = salsByStore.get(s.Store_ID)?.length ?? 0;
              return (
                <li key={s.Store_ID}>
                  <button type="button" onClick={() => go(s.Store_ID)} className={cn('flex w-full items-center gap-2 border-b border-line/60 px-4 py-2 text-left text-[13px]', s.Store_ID === storeId ? 'bg-sand-50 font-semibold shadow-[inset_3px_0_0_#B08D57]' : 'hover:bg-wash/60')}>
                    <span className="truncate">{s.Store_Name}{s.Program_Type === 'New Company' && <span className="font-normal text-ink-3"> (Co.)</span>}</span>
                    {isAirport(s) && <AirportMark />}
                    <span className={cn('tnum ml-auto text-2xs', n ? 'text-ink-2' : 'text-ink-4')}>{n || '—'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="no-print col-span-12 md:col-span-2" title={store?.Store_Name ?? '—'}>
          {list.length === 0 ? (
            <Empty compact title="No previous SAL available" body="Confirmed minutes will appear here." action={store && <Link href={`/stores/${store.Store_ID}/minutes`}><Button size="sm" variant="gold">Generate first minutes</Button></Link>} />
          ) : (
            <ul>
              {list.map((s) => (
                <li key={s.SAL_ID}>
                  <button type="button" onClick={() => go(storeId, s.SAL_ID)} className={cn('w-full border-b border-line/60 px-4 py-2 text-left', s.SAL_ID === sal?.SAL_ID ? 'bg-sand-50 shadow-[inset_3px_0_0_#B08D57]' : 'hover:bg-wash/60')}>
                    <div className="tnum text-[13px] font-semibold">{fmtDate(s.SAL_Date)}</div>
                    <div className="text-2xs text-ink-3">{s.Created_By} · {fmtTimestamp(s.Confirmation_Timestamp, 'HH:mm')}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="print-full col-span-12 md:col-span-7">
          {!sal || !parsed ? (
            <Card><Empty title="Select a SAL" icon={<FileText className="h-6 w-6" />} /></Card>
          ) : (
            <Card
              title={`SAL ${fmtDate(sal.SAL_Date)}`}
              actions={
                <div className="no-print flex items-center gap-2">
                  <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'final', label: 'Final minutes' }, { value: 'generated', label: 'Generated draft' }, { value: 'snapshot', label: 'Snapshot & changes' }]} />
                  <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={async () => ((await copyRich(sal.Final_Minutes, parsed.doc ? renderHtml(parsed.doc) : `<pre>${sal.Final_Minutes}</pre>`)) ? toast.success('Minutes copied') : toast.error('Copy failed'))}>Copy</Button>
                  {!isArtifact() && <Button size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>Print</Button>}
                </div>
              }
            >
              <div className="grid grid-cols-4 divide-x divide-line border-b border-line text-[12px]">
                <div className="px-4 py-2"><div className="eyebrow">SAL date</div><div className="tnum font-semibold">{fmtDate(sal.SAL_Date)}</div></div>
                <div className="px-4 py-2"><div className="eyebrow">Previous SAL</div><div className="tnum">{sal.Previous_SAL_Date ? fmtDate(sal.Previous_SAL_Date) : 'First SAL'}</div></div>
                <div className="px-4 py-2"><div className="eyebrow">Confirmed</div><div className="tnum">{fmtTimestamp(sal.Confirmation_Timestamp)}</div></div>
                <div className="px-4 py-2"><div className="eyebrow">By</div><div>{sal.Created_By || '—'}</div></div>
              </div>
              <div className="p-5">
                {tab === 'final' && (parsed.doc && renderText(parsed.doc).trim() === sal.Final_Minutes.trim() ? <MinutesView doc={parsed.doc} /> : <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{sal.Final_Minutes}</pre>)}
                {tab === 'generated' && <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-2">{sal.Generated_Minutes || '—'}</pre>}
                {tab === 'snapshot' && (
                  <div className="space-y-5">
                    {parsed.snapshot ? (
                      <>
                        <div className="grid grid-cols-4 gap-3 text-[13px] md:grid-cols-8">
                          {[
                            ['Completion', `${parsed.snapshot.kpis.progress}%`],
                            ['Days to opening', parsed.snapshot.kpis.daysToOpening ?? '—'],
                            ['Open', parsed.snapshot.kpis.open],
                            ['Completed', parsed.snapshot.kpis.completed],
                            ['Blocked', parsed.snapshot.kpis.blocked],
                            ['Overdue', parsed.snapshot.kpis.overdue],
                            ['Due soon', parsed.snapshot.kpis.dueSoon],
                            ['Decisions', parsed.snapshot.kpis.decisions],
                          ].map(([l, v]) => (
                            <div key={l as string} className="rounded-md border border-line px-3 py-2"><div className="eyebrow">{l}</div><div className="tnum text-lg font-semibold">{v}</div></div>
                          ))}
                        </div>
                        <p className="text-xs text-ink-3">Opening date at confirmation: <b>{fmtDate(parsed.snapshot.store.Opening_Date)}</b> ({parsed.snapshot.store.Opening_Date_Status}) · Risk {parsed.snapshot.store.Risk_Level}</p>
                        <div>
                          <div className="eyebrow mb-2">Area progress at this SAL</div>
                          <div className="divide-y divide-line/60 rounded-md border border-line">
                            {parsed.snapshot.areas.map((a) => (
                              <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_160px_110px_80px] items-center gap-3 px-3 py-1.5 text-[13px]">
                                <span>{a.name}</span>
                                <ProgressBar value={a.progress} showLabel />
                                <StatusPill status={a.status} size="sm" />
                                <span className="text-2xs text-ink-3">{a.overdue ? `${a.overdue} late` : ''} {a.blocked ? `${a.blocked} blocked` : ''}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-ink-3">No snapshot stored for this SAL.</p>
                    )}
                    <div>
                      <div className="eyebrow mb-2">Changes included ({parsed.included.length})</div>
                      {parsed.included.length === 0 ? <p className="text-xs text-ink-3">—</p> : (
                        <ul className="divide-y divide-line/60 rounded-md border border-line">
                          {parsed.included.map((i) => {
                            const t = m.snap.tasks.find((x) => x.Task_ID === i.taskId);
                            return (
                              <li key={i.taskId} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                                <span className="font-mono text-[11px] text-ink-3">{i.taskId}</span>
                                <span className="truncate">{t?.Task_Title ?? '(removed task)'}</span>
                                <span className="ml-auto text-2xs text-ink-3">{i.signals.join(', ')}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
