import { describe, expect, it } from 'vitest';
import { GoogleSheetsAdapter, colLetter, type SheetsClient } from '@/lib/server/adapters/sheets-adapter';
import { Repository, ConflictError } from '@/lib/server/repository';
import { TABLE_NAMES } from '@/lib/domain/schema';
import { seedTables } from './helpers';

/** Minimal in-memory emulation of the Sheets v4 values API (A1 ranges, RAW input, UNFORMATTED output). */
class FakeSheets implements SheetsClient {
  tabs = new Map<string, unknown[][]>();
  calls: string[] = [];
  private parse(range: string) {
    const m = range.match(/^'((?:[^']|'')+)'(?:!(.+))?$/);
    if (!m) throw Object.assign(new Error(`bad range ${range}`), { code: 400 });
    const title = m[1].replace(/''/g, "'");
    if (!this.tabs.has(title)) throw Object.assign(new Error(`Unable to parse range: ${range}`), { code: 400 });
    const a1 = m[2];
    const col = (s: string) => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    if (!a1) return { title, r0: 0, c0: 0, r1: Infinity, c1: Infinity };
    let mm = a1.match(/^(\d+):(\d+)$/);
    if (mm) return { title, r0: +mm[1] - 1, c0: 0, r1: +mm[2] - 1, c1: Infinity };
    mm = a1.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (mm) return { title, r0: +mm[2] - 1, c0: col(mm[1]), r1: mm[4] ? +mm[4] - 1 : Infinity, c1: mm[3] ? col(mm[3]) : Infinity };
    throw new Error(`unsupported A1 ${a1}`);
  }
  private read(range: string) {
    const r = this.parse(range);
    const grid = this.tabs.get(r.title)!;
    const out: unknown[][] = [];
    for (let i = r.r0; i < Math.min(grid.length, r.r1 + 1); i++) {
      const row = (grid[i] ?? []).slice(r.c0, r.c1 === Infinity ? undefined : r.c1 + 1);
      while (row.length && (row[row.length - 1] === '' || row[row.length - 1] === undefined)) row.pop();
      out.push(row);
    }
    while (out.length && out[out.length - 1].length === 0) out.pop();
    return out;
  }
  spreadsheets = {
    get: async () => ({ data: { sheets: [...this.tabs.keys()].map((title, i) => ({ properties: { title, sheetId: i } })) } }),
    batchUpdate: async (p: { requestBody: { requests: unknown[] } }) => {
      for (const req of p.requestBody.requests as { addSheet?: { properties: { title: string } } }[]) if (req.addSheet) this.tabs.set(req.addSheet.properties.title, []);
      return {};
    },
    values: {
      batchGet: async (p: { ranges: string[] }) => {
        this.calls.push('batchGet');
        return { data: { valueRanges: p.ranges.map((range) => ({ range, values: this.read(range) })) } };
      },
      get: async (p: { range: string }) => {
        this.calls.push(`get ${p.range}`);
        return { data: { values: this.read(p.range) } };
      },
      update: async (p: { range: string; requestBody: { values: unknown[][] } }) => {
        this.calls.push(`update ${p.range}`);
        const r = this.parse(p.range);
        const grid = this.tabs.get(r.title)!;
        p.requestBody.values.forEach((row, i) => {
          const target = (grid[r.r0 + i] ??= []);
          row.forEach((v, j) => (target[r.c0 + j] = v));
        });
        return {};
      },
      append: async (p: { range: string; requestBody: { values: unknown[][] } }) => {
        this.calls.push(`append ${p.range}`);
        const grid = this.tabs.get(this.parse(p.range).title)!;
        let last = grid.length;
        while (last > 0 && !(grid[last - 1] ?? []).some((v) => v !== '' && v !== undefined)) last--;
        p.requestBody.values.forEach((row, i) => (grid[last + i] = [...row]));
        return {};
      },
      clear: async (p: { range: string }) => {
        this.tabs.set(this.parse(p.range).title, []);
        return {};
      },
    },
  };
}

async function initSheet() {
  const fake = new FakeSheets();
  fake.tabs.set('Sheet1', []);
  const adapter = new GoogleSheetsAdapter(fake, 'test-sheet');
  await adapter.replaceTables(seedTables());
  return { fake, adapter };
}

describe('Google Sheets adapter', () => {
  it('A1 column letters', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(colLetter)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  it('initialises tabs and reads everything back in ONE batchGet', async () => {
    const { fake, adapter } = await initSheet();
    for (const t of TABLE_NAMES) expect(fake.tabs.has(t)).toBe(true);
    fake.calls = [];
    const raw = await adapter.readAll();
    expect(fake.calls).toEqual(['batchGet']);
    expect(raw.TASKS.length).toBe(seedTables().TASKS.length);
    expect(raw.STORES.find((s) => s.Store_ID === 'AMS')?.Store_Name).toBe('Amsterdam Airport');
  });

  it('maps columns by header name, preserves user-added columns and tolerates reordered columns', async () => {
    const { fake, adapter } = await initSheet();
    const grid = fake.tabs.get('TASKS')!;
    // user adds a custom column and swaps two columns in the sheet
    grid[0].push('PMO_Comment');
    const iTitle = grid[0].indexOf('Task_Title');
    const iArea = grid[0].indexOf('Area');
    for (const row of grid) [row[iTitle], row[iArea]] = [row[iArea], row[iTitle]];
    const r = grid.findIndex((row) => row[0] === 'AMS-HR-002');
    grid[r][grid[0].length - 1] = 'keep me';
    await adapter.updateRow('TASKS', 'AMS-HR-002', { Status: 'Completed', Progress_Percentage: 100 });
    const rows = await adapter.readTable('TASKS');
    const row = rows.find((x) => x.Task_ID === 'AMS-HR-002')!;
    expect(row).toMatchObject({ Status: 'Completed', Progress_Percentage: 100, PMO_Comment: 'keep me', Area: 'HR' });
    expect(String(row.Task_Title)).toContain('Recruiting');
  });

  it('adds missing header columns on append instead of dropping data', async () => {
    const { fake, adapter } = await initSheet();
    fake.tabs.get('TASK_HISTORY')![0] = ['History_ID', 'Task_ID', 'Store_ID', 'Timestamp', 'Field_Changed']; // truncated header
    await adapter.appendRows('TASK_HISTORY', [{ History_ID: 'H-1', Task_ID: 'T', Store_ID: 'S', Timestamp: '2026-09-28T10:00:00.000Z', Field_Changed: 'Note', New_Value: 'x', Note: 'y', Updated_By: 'u' }]);
    const header = fake.tabs.get('TASK_HISTORY')![0];
    expect(header).toEqual(expect.arrayContaining(['New_Value', 'Note', 'Updated_By']));
    const rows = await adapter.readTable('TASK_HISTORY');
    expect(rows[rows.length - 1]).toMatchObject({ History_ID: 'H-1', Note: 'y', Updated_By: 'u' });
  });

  it('reports a clear error when the spreadsheet has none of the tabs', async () => {
    const fake = new FakeSheets();
    fake.tabs.set('Sheet1', []);
    await expect(new GoogleSheetsAdapter(fake, 'x').readAll()).rejects.toThrow(/sheets:init/);
  });

  it('end-to-end: repository read + write + concurrency on the Sheets adapter', async () => {
    const { fake, adapter } = await initSheet();
    const repo = new Repository(adapter, 0);
    const s = await repo.getSnapshot();
    const t = s.tasks.find((x) => x.Task_ID === 'AMS-CRM-001')!;
    const r = await repo.updateTask(t.Task_ID, { Status: 'In Progress', Blocker: '' }, t.rev, 'Sheets Tester', 'Retail ticket raised');
    expect(r.history.map((h) => h.Field_Changed)).toEqual(['Status', 'Blocker', 'Note']);
    const grid = fake.tabs.get('TASKS')!;
    const row = grid.find((x) => x[0] === 'AMS-CRM-001')!;
    expect(row[grid[0].indexOf('Status')]).toBe('In Progress');
    expect(row[grid[0].indexOf('Last_Updated_By')]).toBe('Sheets Tester');
    // direct edit in Google Sheets → next write with the old rev is rejected
    row[grid[0].indexOf('Due_Date')] = 46400;
    await expect(repo.updateTask(t.Task_ID, { Progress_Percentage: 20 }, r.task.rev, 'x')).rejects.toBeInstanceOf(ConflictError);
    // a fresh read sees the manual edit (serial date parsed)
    const fresh = (await repo.getSnapshot({ force: true })).tasks.find((x) => x.Task_ID === t.Task_ID)!;
    expect(fresh.Due_Date).toBe('2027-01-13');
    expect((await repo.updateTask(t.Task_ID, { Progress_Percentage: 20 }, fresh.rev, 'x')).task.Progress_Percentage).toBe(20);
  });
});
