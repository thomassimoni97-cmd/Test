import { describe, expect, it } from 'vitest';
import { applyTaskPatch, blankTask, formatNote, nextTaskId, noteHistory } from '@/lib/domain/mutations';

const now = new Date('2026-09-28T14:32:00');
const meta = { user: 'Laura', now };
const base = () => blankTask({ Task_ID: 'AMS-HR-008', Store_ID: 'AMS', Area: 'HR', Task_Title: 'Recruiting', Status: 'In Progress', Progress_Percentage: 40, Due_Date: '2026-09-20', Owner: 'Nicoletta Bisaro' }, { user: 'x', now: new Date('2026-09-01') });

describe('task mutation rules', () => {
  it('creates one history row per changed field and bumps version', () => {
    const t = base();
    const r = applyTaskPatch(t, { Progress_Percentage: 70, Due_Date: '2026-09-30', Owner: 'Nicoletta Bisaro' }, meta);
    expect(r.history.map((h) => [h.Field_Changed, h.Previous_Value, h.New_Value])).toEqual([
      ['Progress_Percentage', '40', '70'],
      ['Due_Date', '2026-09-20', '2026-09-30'],
    ]);
    expect(r.task.Version).toBe(t.Version + 1);
    expect(r.task.Last_Updated_By).toBe('Laura');
    expect(r.history.every((h) => h.Updated_By === 'Laura' && h.Task_ID === 'AMS-HR-008' && h.Store_ID === 'AMS')).toBe(true);
  });

  it('no-op patch produces no history and no version bump', () => {
    const t = base();
    const r = applyTaskPatch(t, { Progress_Percentage: 40, Status: 'In Progress' }, meta);
    expect(r.history).toHaveLength(0);
    expect(r.task).toBe(t);
  });

  it('Completed forces 100% and sets Completed_Date; 100% completes; reopening clears date', () => {
    const done = applyTaskPatch(base(), { Status: 'Completed' }, meta).task;
    expect(done.Progress_Percentage).toBe(100);
    expect(done.Completed_Date).toBe('2026-09-28');
    const auto = applyTaskPatch(base(), { Progress_Percentage: 100 }, meta);
    expect(auto.task.Status).toBe('Completed');
    expect(auto.history.map((h) => h.Field_Changed)).toEqual(['Status', 'Progress_Percentage']);
    const reopened = applyTaskPatch(done, { Status: 'In Progress' }, meta).task;
    expect(reopened.Completed_Date).toBe('');
    expect(reopened.Progress_Percentage).toBe(90);
  });

  it('progress on a Not Started task moves it to In Progress', () => {
    const t = { ...base(), Status: 'Not Started', Progress_Percentage: 0 };
    expect(applyTaskPatch(t, { Progress_Percentage: 10 }, meta).task.Status).toBe('In Progress');
  });

  it('notes are prefixed with the current date and never overwrite', () => {
    expect(formatNote('Waiting for Airport IT', now)).toBe('[28 Sep 2026]: Waiting for Airport IT');
    const h = noteHistory(base(), 'Waiting for Airport IT', meta);
    expect(h.Field_Changed).toBe('Note');
    expect(h.New_Value).toBe('[28 Sep 2026]: Waiting for Airport IT');
    expect(h.Note).toBe('Waiting for Airport IT');
  });

  it('generates immutable sequential task ids per store+area', () => {
    expect(nextTaskId(['AMS-HR-001', 'AMS-HR-007', 'AMS-IT-009', 'ROM-HR-020'], 'AMS', 'HR')).toBe('AMS-HR-008');
    expect(nextTaskId([], 'SAU', 'FIN')).toBe('SAU-FIN-001');
  });
});
