import { describe, expect, it } from 'vitest';
import { applyTaskPatch } from '@/lib/domain/mutations';
import { buildSalSnapshot, detectChanges, firstSalBaseline, generateMinutes, renderHtml, renderText, resolveBaseline, getTemplate } from '@/lib/domain/minutes';
import { seedParsed, TODAY } from './helpers';

const now = new Date('2026-09-28T15:00:00');

function amsInput() {
  const p = seedParsed();
  const store = p.stores.find((s) => s.Store_ID === 'AMS')!;
  const baseline = resolveBaseline(p.sals, 'AMS')!;
  return { p, store, baseline, input: { store, tasks: p.tasks, history: p.history, areas: p.areas, settings: p.settings, baseline, now, today: TODAY } };
}

describe('SAL baseline + change detection', () => {
  it('baseline = last confirmed SAL of the store (21 Sep 2026)', () => {
    const { baseline } = amsInput();
    expect(baseline.previousSalDate).toBe('2026-09-21');
    expect(baseline.snapshot?.tasks).toBeTruthy();
    expect(baseline.isFirst).toBe(false);
  });

  it('consolidates several field changes of one task into ONE bullet (HR example)', () => {
    const { input } = amsInput();
    const { data, doc } = generateMinutes(input);
    const hr = data.areas.find((a) => a.area.Area_ID === 'HR')!;
    const rec = hr.items.filter((i) => i.task.Task_ID === 'AMS-HR-002');
    expect(rec).toHaveLength(1);
    expect(rec[0].signals).toEqual(expect.arrayContaining(['deadline', 'progress', 'note']));
    const text = renderText(doc);
    const line = text.split('\n').find((l) => l.includes('Recruiting store team'))!;
    expect(line).toContain('deadline moved from 20 Sep to 30 Sep');
    expect(line).toContain('progressed to 70% (from 40%)');
    expect(line).toContain('Waiting for final candidate confirmation');
    expect(line).toMatch(/→ In Progress \| Owner: Nicoletta Bisaro$/);
  });

  it('detects blockers, completion, decisions, overdue, owner change, created tasks, store changes', () => {
    const { input } = amsInput();
    const data = detectChanges(input);
    const sig = (id: string) => data.areas.flatMap((a) => a.items).find((i) => i.task.Task_ID === id)?.signals ?? [];
    expect(sig('AMS-IT-002')).toEqual(expect.arrayContaining(['newBlocker', 'overdue', 'risk']));
    expect(sig('AMS-SP-004')).toContain('newBlocker'); // blocker text without status change
    expect(sig('AMS-ITH-001')).toEqual(expect.arrayContaining(['resolvedBlocker', 'status']));
    expect(sig('AMS-ERP-001')).toContain('completed');
    expect(sig('AMS-FIN-001')).toEqual(expect.arrayContaining(['newDecision', 'overdue']));
    expect(sig('AMS-AR-001')).toContain('resolvedDecision');
    expect(sig('AMS-GS-001')).toContain('owner');
    expect(sig('AMS-POS-001')).toContain('deadline');
    expect(sig('AMS-POS-003')).toContain('overdue'); // became overdue since the baseline, no edit
    expect(sig('AMS-CMP-003')).toContain('created');
    expect(sig('AMS-RET-001')).toEqual([]); // unchanged since baseline → not included
    expect(data.storeChanges).toEqual([{ field: 'Risk_Level', from: 'Medium', to: 'High' }]);
  });

  it('orders bullets by priority: new blocker → overdue → decision → deadline → status → completed → note → progress → created', () => {
    const { input } = amsInput();
    const it = detectChanges(input).areas.find((a) => a.area.Area_ID === 'IT')!;
    expect(it.items.map((i) => i.task.Task_ID)).toEqual(['AMS-IT-002', 'AMS-IT-003']);
    const fin = detectChanges(input).areas.find((a) => a.area.Area_ID === 'FIN')!;
    expect(fin.items[0].task.Task_ID).toBe('AMS-FIN-001'); // overdue+decision before completed FIN-002
  });

  it('snapshot diff catches edits made directly in Google Sheets (no history rows)', () => {
    const { input, p } = amsInput();
    const tasks = p.tasks.map((t) => (t.Task_ID === 'AMS-RET-001' ? { ...t, Status: 'On Hold', Progress_Percentage: 65 } : t));
    const data = detectChanges({ ...input, tasks });
    const item = data.areas.flatMap((a) => a.items).find((i) => i.task.Task_ID === 'AMS-RET-001');
    expect(item?.signals).toEqual(expect.arrayContaining(['status', 'progress']));
  });

  it('history-based fallback when no snapshot is available (first SAL from a start date)', () => {
    const { input } = amsInput();
    const data = detectChanges({ ...input, baseline: firstSalBaseline({ startDate: '2026-09-25' }) });
    const ids = data.areas.flatMap((a) => a.items.map((i) => i.task.Task_ID));
    expect(ids).toContain('AMS-HR-002'); // changed on 26 Sep
    expect(ids).not.toContain('AMS-ERP-001'); // completed on 22 Sep, before the start date
    expect(data.baseline.isFirst).toBe(true);
  });

  it('first SAL current-state recap lists applicable tasks and says so in the header', () => {
    const { input } = amsInput();
    const { data, doc } = generateMinutes({ ...input, baseline: firstSalBaseline({}) });
    const n = data.areas.reduce((s, a) => s + a.items.length, 0);
    expect(n).toBe(input.tasks.filter((t) => t.Store_ID === 'AMS' && !t.Archived && t.Status !== 'N/A').length);
    expect(doc.headerLines.join('\n')).toContain('First SAL — current-state recap');
  });

  it('generating a preview is pure: it never changes the baseline', () => {
    const { p, input } = amsInput();
    const before = JSON.stringify(p.sals);
    generateMinutes(input);
    generateMinutes(input);
    expect(JSON.stringify(p.sals)).toBe(before);
    expect(resolveBaseline(p.sals, 'AMS')!.previousSalDate).toBe('2026-09-21');
  });

  it('after a confirmation the next comparison starts from the new baseline', () => {
    const { p, store, input } = amsInput();
    const snap = buildSalSnapshot(store, p.tasks, p.areas, p.settings, TODAY);
    const sals = [...p.sals, { ...p.sals[2], SAL_ID: 'NEW', SAL_Date: TODAY, Confirmation_Timestamp: now.toISOString(), Snapshot_JSON: JSON.stringify(snap) }];
    const b = resolveBaseline(sals, 'AMS')!;
    expect(b.previousSalDate).toBe(TODAY);
    expect(detectChanges({ ...input, baseline: b, now: new Date(now.getTime() + 60000) }).areas).toHaveLength(0);
    // a change after confirmation shows up
    const t = p.tasks.find((x) => x.Task_ID === 'AMS-HR-003')!;
    const later = new Date(now.getTime() + 120000);
    const r = applyTaskPatch(t, { Status: 'In Progress', Progress_Percentage: 10 }, { user: 'x', now: later });
    const data = detectChanges({ ...input, baseline: b, tasks: p.tasks.map((x) => (x.Task_ID === t.Task_ID ? r.task : x)), history: [...p.history, ...r.history], now: new Date(later.getTime() + 1000) });
    expect(data.areas.flatMap((a) => a.items).map((i) => i.task.Task_ID)).toEqual(['AMS-HR-003']);
  });

  it('minutes layout: numbered area sections, IT sub-areas grouped, next steps and blockers sections', () => {
    const { input } = amsInput();
    const text = renderText(generateMinutes(input).doc);
    expect(text.startsWith('AMSTERDAM AIRPORT\nOpening Store: 05 Mar 2027')).toBe(true);
    expect(text).toContain('Last SAL: 21 Sep 2026');
    expect(text).toContain('Current SAL: 28 Sep 2026');
    expect(text).toMatch(/\n1\. CORPORATE \/ LEGAL\n/);
    expect(text).toMatch(/\n3\. IT\n• Airport IT integration/);
    expect(text).toMatch(/\nSAP\n• Set-up and testing of flows/);
    expect(text).toContain('NEXT STEPS / OPEN POINTS');
    expect(text).toContain('BLOCKERS / DECISIONS REQUIRED');
    expect(text).not.toMatch(/\n\d+\. RETAIL\n/); // unchanged area omitted
  });

  it('templates are independent from detection (executive template)', () => {
    const { input } = amsInput();
    const data = detectChanges(input);
    const exec = getTemplate('executive').build(data);
    expect(exec.sections.map((s) => s.title)).toEqual(['OPENING UPDATES', 'KEY CHANGES', 'BLOCKERS / DECISIONS REQUIRED']);
  });

  it('HTML rendering escapes content and keeps structure for Outlook/Teams', () => {
    const { input } = amsInput();
    const doc = generateMinutes(input).doc;
    doc.sections[1].groups[0].bullets[0].text = '<script>alert(1)</script> & co';
    const html = renderHtml(doc);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(html).toContain('<ul');
    expect(html).not.toContain('<script>');
  });
});
