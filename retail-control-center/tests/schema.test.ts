import { describe, expect, it } from 'vitest';
import { parseLooseDate } from '@/lib/domain/dates';
import { bool, flagOn, parseProgress, parseTables, type RawTables } from '@/lib/domain/schema';

const empty = (): RawTables => ({ STORES: [], TASKS: [], TASK_HISTORY: [], AREAS: [], OWNERS: [], SAL_HISTORY: [], SETTINGS: [] });

describe('tolerant sheet parsing', () => {
  it('parses dates from ISO, serial numbers and human formats; flags garbage', () => {
    expect(parseLooseDate('2027-03-05')).toEqual({ value: '2027-03-05', ok: true });
    expect(parseLooseDate(46451).value).toBe('2027-03-05'); // Google Sheets serial
    expect(parseLooseDate('05/03/2027').value).toBe('2027-03-05'); // dd/MM/yyyy
    expect(parseLooseDate('5 Mar 2027').value).toBe('2027-03-05');
    expect(parseLooseDate('')).toEqual({ value: '', ok: true });
    expect(parseLooseDate(null)).toEqual({ value: '', ok: true });
    expect(parseLooseDate('next week').ok).toBe(false);
  });

  it('parses progress in all common shapes', () => {
    expect(parseProgress(68).value).toBe(68);
    expect(parseProgress('68%').value).toBe(68);
    expect(parseProgress(0.68).value).toBe(68); // percent-formatted cell
    expect(parseProgress('')).toEqual({ value: 0, ok: true });
    expect(parseProgress(150)).toEqual({ value: 100, ok: false });
    expect(parseProgress('abc').ok).toBe(false);
  });

  it('booleans and free-text flags', () => {
    expect(bool('TRUE')).toBe(true);
    expect(bool('x')).toBe(true);
    expect(bool('No')).toBe(false);
    expect(bool('', true)).toBe(true);
    expect(flagOn('Waiting for landlord')).toBe(true);
    expect(flagOn('FALSE')).toBe(false);
    expect(flagOn('')).toBe(false);
  });

  it('never crashes on blank / malformed rows and reports issues instead', () => {
    const raw = empty();
    raw.AREAS = [{ Area_ID: 'HR', Area_Name: 'HR', Order: 10, Active: true }];
    raw.OWNERS = [{ Owner_ID: 'O1', Name: 'Jane Doe', Active: true }];
    raw.STORES = [
      { Store_ID: 'AMS', Store_Name: 'Amsterdam Airport', Opening_Date: 'soon', Risk_Level: 'critical', Program_Type: 'New Store' },
      { Store_ID: 'AMS', Store_Name: 'Duplicate' },
      { Store_ID: null, Store_Name: 'No id' },
      {},
    ];
    raw.TASKS = [
      { Task_ID: 'AMS-HR-001', Store_ID: 'AMS', Area: 'HR', Task_Title: 'Ok', Status: 'in progress', Progress_Percentage: '40%', Owner: 'Jane Doe', Due_Date: 46300 },
      { Task_ID: 'AMS-HR-002', Store_ID: 'XXX', Area: 'ZZ', Task_Title: '', Status: 'Maybe', Progress_Percentage: 300, Risk_Level: 'huge', Owner: 'Ghost', Due_Date: 'tomorrow', Task_Weight: -2 },
      { Task_ID: 'AMS-HR-001', Store_ID: 'AMS', Area: 'HR', Task_Title: 'Dup' },
      { Task_ID: '', Task_Title: 'no id' },
    ];
    const p = parseTables(raw);
    expect(p.stores).toHaveLength(1);
    expect(p.stores[0].Opening_Date).toBe('');
    expect(p.stores[0].Risk_Level).toBe('Low');
    expect(p.tasks).toHaveLength(2);
    const [a, b] = p.tasks;
    expect(a.Status).toBe('In Progress');
    expect(a.Progress_Percentage).toBe(40);
    expect(a.Due_Date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.Task_Title).toBe('(untitled task)');
    expect(b.Progress_Percentage).toBe(100);
    expect(b.Task_Weight).toBe(1);
    const msgs = p.issues.map((i) => `${i.table}:${i.rowKey}:${i.field ?? ''}`);
    expect(msgs).toEqual(expect.arrayContaining([
      'STORES:AMS:Opening_Date', 'STORES:AMS:Risk_Level', 'STORES:AMS:Store_ID',
      'TASKS:AMS-HR-001:Task_ID', 'TASKS:AMS-HR-002:Store_ID', 'TASKS:AMS-HR-002:Area', 'TASKS:AMS-HR-002:Owner',
      'TASKS:AMS-HR-002:Status', 'TASKS:AMS-HR-002:Progress_Percentage', 'TASKS:AMS-HR-002:Due_Date', 'TASKS:AMS-HR-002:Task_Weight',
    ]));
  });

  it('keeps defaults when SETTINGS is empty or malformed', () => {
    const raw = empty();
    raw.SETTINGS = [{ Setting_Key: 'Due_Soon_Days', Setting_Value: 'abc' }, { Setting_Key: 'Progress_Method', Setting_Value: 'magic' }];
    const p = parseTables(raw);
    expect(p.settings.Due_Soon_Days).toBe(14);
    expect(p.settings.Progress_Method).toBe('simple');
    expect(p.settings.Statuses.map((s) => s.name)).toEqual(['Not Started', 'In Progress', 'On Hold', 'Blocked', 'Completed', 'N/A']);
  });
});
