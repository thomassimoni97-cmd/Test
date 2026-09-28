import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { JsonFileAdapter } from '@/lib/server/adapters/json-adapter';
import { ConflictError, Repository, ValidationError } from '@/lib/server/repository';
import { resolveBaseline, detectChanges } from '@/lib/domain/minutes';
import { seedTables } from './helpers';

let repo: Repository;
let adapter: JsonFileAdapter;

beforeEach(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-roc-'));
  adapter = new JsonFileAdapter(path.join(dir, 'db.json'), seedTables);
  repo = new Repository(adapter);
});

describe('repository (local adapter — same contract as Google Sheets)', () => {
  it('reads the seeded dataset', async () => {
    const s = await repo.getSnapshot();
    expect(s.stores).toHaveLength(19);
    expect(s.tasks.filter((t) => t.Store_ID === 'AMS').length).toBeGreaterThan(50);
    expect(s.sals.filter((x) => x.Store_ID === 'AMS')).toHaveLength(3);
    expect(s.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('creates a task with an immutable generated ID, history and persisted row', async () => {
    const r = await repo.createTask({ Store_ID: 'AMS', Area: 'HR', Task_Title: 'Uniforms order', Owner: 'Nicoletta Bisaro', Due_Date: '2026-11-15' }, 'Tester', 'First note');
    expect(r.task.Task_ID).toBe('AMS-HR-007');
    expect(r.history.map((h) => h.Field_Changed)).toEqual(['Created', 'Note']);
    const rows = await adapter.readTable('TASKS');
    expect(rows.find((x) => x.Task_ID === 'AMS-HR-007')?.Task_Title).toBe('Uniforms order');
  });

  it('updates status/progress/due/owner, writes history, bumps version and returns a fresh rev', async () => {
    const s = await repo.getSnapshot();
    const t = s.tasks.find((x) => x.Task_ID === 'AMS-HR-005')!;
    const r = await repo.updateTask(t.Task_ID, { Status: 'Blocked', Progress_Percentage: 30, Due_Date: '2026-10-10', Owner: 'Marco Ferri', Risk_Level: 'High', Priority: 'High', Decision_Required: 'Approve extra checks' }, t.rev, 'Tester', 'Two candidates flagged');
    expect(r.task.Version).toBe(t.Version + 1);
    expect(r.history.map((h) => h.Field_Changed)).toEqual(['Status', 'Progress_Percentage', 'Due_Date', 'Owner', 'Risk_Level', 'Priority', 'Decision_Required', 'Note']);
    const again = await repo.updateTask(t.Task_ID, { Progress_Percentage: 35 }, r.task.rev, 'Tester'); // new rev works
    expect(again.task.Progress_Percentage).toBe(35);
    const hist = await adapter.readTable('TASK_HISTORY');
    expect(hist.filter((h) => h.Task_ID === 'AMS-HR-005' && h.Updated_By === 'Tester')).toHaveLength(9);
  });

  it('optimistic concurrency: rejects stale revs, including direct edits in the sheet', async () => {
    const s = await repo.getSnapshot();
    const t = s.tasks.find((x) => x.Task_ID === 'AMS-HR-005')!;
    await repo.updateTask(t.Task_ID, { Progress_Percentage: 50 }, t.rev, 'A');
    await expect(repo.updateTask(t.Task_ID, { Progress_Percentage: 60 }, t.rev, 'B')).rejects.toBeInstanceOf(ConflictError);
    // someone edits the Google Sheet directly (no Version bump)
    const fresh = (await repo.getSnapshot({ force: true })).tasks.find((x) => x.Task_ID === t.Task_ID)!;
    await adapter.updateRow('TASKS', t.Task_ID, { Owner: 'Sara Lombardi' });
    const err = await repo.updateTask(t.Task_ID, { Progress_Percentage: 70 }, fresh.rev, 'A').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).current).toMatchObject({ Owner: 'Sara Lombardi' });
  });

  it('validates input', async () => {
    const t = (await repo.getSnapshot()).tasks[0];
    for (const bad of [{ Status: 'Done-ish' }, { Progress_Percentage: 150 }, { Due_Date: '31/02/2026' }, { Owner: 'Nobody Known' }, { Area: 'NOPE' }, { Risk_Level: 'Extreme' as never }, { Task_Weight: -1 }]) {
      await expect(repo.updateTask(t.Task_ID, bad, t.rev, 'x')).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(repo.createTask({ Store_ID: 'NOPE', Area: 'HR', Task_Title: 'x' }, 'x')).rejects.toBeInstanceOf(ValidationError);
  });

  it('notes are appended to history (never overwrite)', async () => {
    const t = (await repo.getSnapshot()).tasks.find((x) => x.Task_ID === 'AMS-IT-002')!;
    const a = await repo.addNote(t.Task_ID, 'First', 'x');
    const b = await repo.addNote(t.Task_ID, 'Second', 'x');
    expect(a.history[0].New_Value).toMatch(/^\[\d{2} \w{3} \d{4}\]: First$/);
    const notes = (await repo.getSnapshot({ force: true })).history.filter((h) => h.Task_ID === t.Task_ID && h.Field_Changed === 'Note');
    expect(notes.map((n) => n.Note)).toEqual(expect.arrayContaining(['First', 'Second', 'Escalated to Schiphol IT service manager']));
    expect(b.history[0].History_ID).not.toBe(a.history[0].History_ID);
  });

  it('archives instead of deleting', async () => {
    const t = (await repo.getSnapshot()).tasks.find((x) => x.Task_ID === 'AMS-GS-002')!;
    const r = await repo.archiveTask(t.Task_ID, t.rev, 'x');
    expect(r.task.Archived).toBe(true);
    const row = (await adapter.readTable('TASKS')).find((x) => x.Task_ID === 'AMS-GS-002');
    expect(row?.Archived).toBe(true);
  });

  it('store changes are versioned and logged for the minutes', async () => {
    const st = (await repo.getSnapshot()).stores.find((s) => s.Store_ID === 'AMS')!;
    const r = await repo.updateStore('AMS', { Opening_Date: '2027-03-19', Opening_Date_Status: 'Tentative' }, st.rev, 'x');
    expect(r.history.map((h) => h.Field_Changed)).toEqual(['Store.Opening_Date', 'Store.Opening_Date_Status']);
    await expect(repo.updateStore('AMS', { Risk_Level: 'Low' }, st.rev, 'x')).rejects.toBeInstanceOf(ConflictError);
  });

  it('confirming minutes creates the new baseline; stale confirmations are rejected', async () => {
    const s = await repo.getSnapshot();
    const prev = resolveBaseline(s.sals, 'AMS')!;
    const { sal } = await repo.confirmSal({ storeId: 'AMS', salDate: '2026-09-28', baselineTimestamp: prev.timestamp, previousSalDate: prev.previousSalDate, generationTimestamp: new Date().toISOString(), generatedMinutes: 'gen', finalMinutes: 'final', minutesJson: '{}' }, 'x');
    const s2 = await repo.getSnapshot({ force: true });
    const b = resolveBaseline(s2.sals, 'AMS')!;
    expect(b.timestamp).toBe(sal.Confirmation_Timestamp);
    expect(b.snapshot?.tasks?.['AMS-HR-002']).toBeTruthy();
    const store = s2.stores.find((x) => x.Store_ID === 'AMS')!;
    const after = detectChanges({ store, tasks: s2.tasks, history: s2.history, areas: s2.areas, settings: s2.settings, baseline: b, now: new Date(Date.now() + 1000), today: '2026-09-28' });
    expect(after.areas).toHaveLength(0);
    await expect(repo.confirmSal({ storeId: 'AMS', salDate: '2026-09-28', baselineTimestamp: prev.timestamp, previousSalDate: '', generationTimestamp: '', generatedMinutes: '', finalMinutes: 'x', minutesJson: '' }, 'x')).rejects.toBeInstanceOf(ConflictError);
  });

  it('configuration: areas (add / rename / reorder / disable), owners, settings', async () => {
    await repo.saveArea({ Area_ID: 'VM', Area_Name: 'Visual Merchandising', Group: '', Order: 999, Active: true }, true);
    await repo.saveArea({ Area_ID: 'HR', Area_Name: 'People & Organization', Group: '', Order: 140, Active: false }, false);
    await expect(repo.saveArea({ Area_ID: 'VM', Area_Name: 'dup', Group: '', Order: 1, Active: true }, true)).rejects.toBeInstanceOf(ValidationError);
    const s = await repo.getSnapshot({ force: true });
    await repo.reorderAreas(['VM', ...s.areas.filter((a) => a.Area_ID !== 'VM').map((a) => a.Area_ID)]);
    const s2 = await repo.getSnapshot({ force: true });
    expect(s2.areas[0].Area_ID).toBe('VM');
    const hr = s2.areas.find((a) => a.Area_ID === 'HR')!;
    expect(hr).toMatchObject({ Area_Name: 'People & Organization', Active: false });
    expect(s2.tasks.filter((t) => t.Area === 'HR').length).toBeGreaterThan(0); // tasks keep their area code
    const o = await repo.saveOwner({ Name: 'New Person', Email: 'new@goldengoose.example', Function: 'IT', Active: true });
    expect(o.owner.Owner_ID).toBe('OWN-023');
    await repo.updateSettings({ Due_Soon_Days: 21, Progress_Method: 'weighted' });
    const s3 = await repo.getSnapshot({ force: true });
    expect(s3.settings).toMatchObject({ Due_Soon_Days: 21, Progress_Method: 'weighted' });
    await expect(repo.updateSettings({ Due_Soon_Days: 0 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps STORES.Overall_Progress aligned as a convenience copy', async () => {
    const s = await repo.getSnapshot();
    const t = s.tasks.find((x) => x.Task_ID === 'AMS-HR-006')!;
    const r = await repo.updateTask(t.Task_ID, { Status: 'Completed' }, t.rev, 'x');
    expect(r.store?.Overall_Progress).toBeGreaterThan(s.stores.find((x) => x.Store_ID === 'AMS')!.Overall_Progress);
    const row = (await adapter.readTable('STORES')).find((x) => x.Store_ID === 'AMS');
    expect(row?.Overall_Progress).toBe(r.store?.Overall_Progress);
  });
});
