// Google Sheets adapter (server-side only). Credentials never leave the server.
// Tables = tabs; row 1 = headers (mapped by name, column order is free, unknown columns preserved).

import { TABLES, TABLE_NAMES, type CellValue, type RawRow, type RawTables, type TableName } from '@/lib/domain/schema';
import { AdapterError, type TableAdapter } from './types';

/** Minimal surface of the googleapis Sheets client we rely on (lets tests inject a fake). */
export interface SheetsClient {
  spreadsheets: {
    get(p: { spreadsheetId: string; fields?: string }): Promise<{ data: { properties?: { title?: string | null }; sheets?: { properties?: { sheetId?: number | null; title?: string | null } }[] } }>;
    batchUpdate(p: { spreadsheetId: string; requestBody: { requests: unknown[] } }): Promise<unknown>;
    values: {
      batchGet(p: { spreadsheetId: string; ranges: string[]; valueRenderOption?: string; dateTimeRenderOption?: string }): Promise<{ data: { valueRanges?: { range?: string | null; values?: unknown[][] | null }[] } }>;
      get(p: { spreadsheetId: string; range: string; valueRenderOption?: string; dateTimeRenderOption?: string }): Promise<{ data: { values?: unknown[][] | null } }>;
      update(p: { spreadsheetId: string; range: string; valueInputOption: string; requestBody: { values: unknown[][] } }): Promise<unknown>;
      append(p: { spreadsheetId: string; range: string; valueInputOption: string; insertDataOption?: string; requestBody: { values: unknown[][] } }): Promise<unknown>;
      clear(p: { spreadsheetId: string; range: string }): Promise<unknown>;
    };
  };
}

export function colLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const q = (title: string) => `'${title.replace(/'/g, "''")}'`;

function toCell(v: CellValue | undefined): string | number | boolean {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' && v.length > 49000) return v.slice(0, 49000);
  return v;
}

function fromCell(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const code = (e as { code?: number; status?: number }).code ?? (e as { status?: number }).status;
      if (code && ![429, 500, 502, 503, 504].includes(Number(code))) break;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  const msg = (lastErr as Error)?.message ?? String(lastErr);
  throw new AdapterError(`Google Sheets ${label} failed: ${msg}`, lastErr);
}

export class GoogleSheetsAdapter implements TableAdapter {
  readonly kind = 'sheets' as const;
  private titles: Set<string> | null = null;

  constructor(private readonly client: SheetsClient, private readonly spreadsheetId: string, private readonly serviceAccount = '') {}

  private async sheetTitles(force = false): Promise<Set<string>> {
    if (this.titles && !force) return this.titles;
    const res = await withRetry(() => this.client.spreadsheets.get({ spreadsheetId: this.spreadsheetId, fields: 'properties.title,sheets.properties' }), 'metadata read');
    this.titles = new Set((res.data.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean));
    return this.titles;
  }

  private rowsFromValues(values: unknown[][] | null | undefined): { headers: string[]; rows: RawRow[] } {
    const v = values ?? [];
    const headers = (v[0] ?? []).map((h) => String(h ?? '').trim());
    const rows: RawRow[] = [];
    for (let i = 1; i < v.length; i++) {
      const r: RawRow = {};
      headers.forEach((h, c) => {
        if (h) r[h] = fromCell(v[i]?.[c]);
      });
      rows.push(r);
    }
    return { headers, rows };
  }

  async readAll(): Promise<RawTables> {
    const titles = await this.sheetTitles(true);
    const present = TABLE_NAMES.filter((t) => titles.has(t));
    const missing = TABLE_NAMES.filter((t) => !titles.has(t));
    if (present.length === 0) throw new AdapterError(`None of the expected tabs (${TABLE_NAMES.join(', ')}) exist in the spreadsheet. Run "npm run sheets:init".`);
    const res = await withRetry(
      () => this.client.spreadsheets.values.batchGet({ spreadsheetId: this.spreadsheetId, ranges: present.map((t) => q(t)), valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' }),
      'read',
    );
    const out = Object.fromEntries(TABLE_NAMES.map((t) => [t, [] as RawRow[]])) as RawTables;
    (res.data.valueRanges ?? []).forEach((vr, i) => {
      out[present[i]] = this.rowsFromValues(vr.values).rows;
    });
    if (missing.length) (out as RawTables & { __missing?: string[] }).__missing = missing;
    return out;
  }

  private async readRaw(table: TableName) {
    const res = await withRetry(
      () => this.client.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: q(table), valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' }),
      `read ${table}`,
    );
    return res.data.values ?? [];
  }

  async readTable(table: TableName): Promise<RawRow[]> {
    return this.rowsFromValues(await this.readRaw(table)).rows;
  }

  /** Makes sure every field we write has a header column (appends missing ones at the end). */
  private async ensureHeaders(table: TableName, headers: string[], fields: string[]): Promise<string[]> {
    const missing = fields.filter((f) => !headers.includes(f));
    if (!missing.length) return headers;
    const next = [...headers, ...missing];
    await withRetry(
      () => this.client.spreadsheets.values.update({ spreadsheetId: this.spreadsheetId, range: `${q(table)}!A1:${colLetter(next.length - 1)}1`, valueInputOption: 'RAW', requestBody: { values: [next] } }),
      `header update ${table}`,
    );
    return next;
  }

  async updateRow(table: TableName, key: string, row: RawRow): Promise<void> {
    const values = await this.readRaw(table);
    let headers = (values[0] ?? []).map((h) => String(h ?? '').trim());
    const keyCol = headers.indexOf(TABLES[table].key);
    if (keyCol < 0) throw new AdapterError(`${table}: key column ${TABLES[table].key} not found`);
    const idx = values.findIndex((r, i) => i > 0 && String(r?.[keyCol] ?? '').trim() === key);
    if (idx < 0) throw new AdapterError(`${table}: row "${key}" not found`);
    headers = await this.ensureHeaders(table, headers, Object.keys(row));
    const existing = values[idx] ?? [];
    const merged = headers.map((h, c) => (h && h in row ? toCell(row[h]) : (existing[c] as string | number | boolean | undefined) ?? ''));
    const rowNum = idx + 1;
    await withRetry(
      () => this.client.spreadsheets.values.update({ spreadsheetId: this.spreadsheetId, range: `${q(table)}!A${rowNum}:${colLetter(headers.length - 1)}${rowNum}`, valueInputOption: 'RAW', requestBody: { values: [merged] } }),
      `update ${table}`,
    );
  }

  async appendRows(table: TableName, rows: RawRow[]): Promise<void> {
    if (!rows.length) return;
    const headerRes = await withRetry(() => this.client.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `${q(table)}!1:1` }), `read ${table} headers`);
    let headers = ((headerRes.data.values ?? [])[0] ?? []).map((h) => String(h ?? '').trim());
    if (!headers.filter(Boolean).length) headers = [];
    headers = await this.ensureHeaders(table, headers, [...new Set(rows.flatMap((r) => Object.keys(r)))]);
    const values = rows.map((r) => headers.map((h) => toCell(r[h])));
    await withRetry(
      () => this.client.spreadsheets.values.append({ spreadsheetId: this.spreadsheetId, range: `${q(table)}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values } }),
      `append ${table}`,
    );
  }

  async replaceTables(tables: Partial<RawTables>): Promise<void> {
    const titles = await this.sheetTitles(true);
    const toCreate = Object.keys(tables).filter((t) => !titles.has(t));
    if (toCreate.length) {
      await withRetry(
        () => this.client.spreadsheets.batchUpdate({ spreadsheetId: this.spreadsheetId, requestBody: { requests: toCreate.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) } }),
        'create tabs',
      );
      await this.sheetTitles(true);
    }
    for (const [name, rows] of Object.entries(tables) as [TableName, RawRow[]][]) {
      const headers = [...TABLES[name].headers];
      for (const r of rows) for (const k of Object.keys(r)) if (!headers.includes(k)) headers.push(k);
      await withRetry(() => this.client.spreadsheets.values.clear({ spreadsheetId: this.spreadsheetId, range: q(name) }), `clear ${name}`);
      const values = [headers, ...rows.map((r) => headers.map((h) => toCell(r[h])))];
      // chunk large tables to stay within request size limits
      const CHUNK = 2000;
      for (let i = 0; i < values.length; i += CHUNK) {
        const part = values.slice(i, i + CHUNK);
        await withRetry(
          () => this.client.spreadsheets.values.update({ spreadsheetId: this.spreadsheetId, range: `${q(name)}!A${i + 1}`, valueInputOption: 'RAW', requestBody: { values: part } }),
          `write ${name}`,
        );
      }
    }
  }

  /** Header formatting + dropdown validation so the Sheet stays usable by non-developers. */
  async applyFormatting(opts: { statuses: string[] }) {
    const meta = await withRetry(() => this.client.spreadsheets.get({ spreadsheetId: this.spreadsheetId, fields: 'sheets.properties' }), 'metadata read');
    const idOf = (t: string) => meta.data.sheets?.find((s) => s.properties?.title === t)?.properties?.sheetId ?? null;
    const requests: unknown[] = [];
    for (const t of TABLE_NAMES) {
      const sheetId = idOf(t);
      if (sheetId === null) continue;
      requests.push(
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.93, blue: 0.89 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
      );
    }
    const tasksId = idOf('TASKS');
    const storesId = idOf('STORES');
    const col = (t: TableName, f: string) => TABLES[t].headers.indexOf(f);
    const list = (sheetId: number, c: number, values: string[]) => ({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 },
        rule: { condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) }, strict: false, showCustomUi: true },
      },
    });
    const range = (sheetId: number, c: number, ref: string) => ({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 },
        rule: { condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: ref }] }, strict: false, showCustomUi: true },
      },
    });
    if (tasksId !== null) {
      requests.push(
        list(tasksId, col('TASKS', 'Status'), opts.statuses),
        list(tasksId, col('TASKS', 'Risk_Level'), ['Low', 'Medium', 'High']),
        list(tasksId, col('TASKS', 'Priority'), ['Low', 'Medium', 'High']),
        range(tasksId, col('TASKS', 'Area'), '=AREAS!$A$2:$A'),
        range(tasksId, col('TASKS', 'Owner'), '=OWNERS!$B$2:$B'),
        range(tasksId, col('TASKS', 'Secondary_Owner'), '=OWNERS!$B$2:$B'),
        range(tasksId, col('TASKS', 'Store_ID'), '=STORES!$A$2:$A'),
      );
    }
    if (storesId !== null) {
      requests.push(
        list(storesId, col('STORES', 'Opening_Date_Status'), ['Confirmed', 'Tentative', 'TBD']),
        list(storesId, col('STORES', 'Program_Type'), ['New Company', 'New Store']),
        list(storesId, col('STORES', 'Store_Type'), ['Standard Store', 'Airport Store', 'Company Opening']),
        list(storesId, col('STORES', 'Risk_Level'), ['Low', 'Medium', 'High']),
      );
    }
    if (requests.length) await withRetry(() => this.client.spreadsheets.batchUpdate({ spreadsheetId: this.spreadsheetId, requestBody: { requests } }), 'formatting');
  }

  describe() {
    return { mode: 'Google Sheets', spreadsheetId: this.spreadsheetId, serviceAccount: this.serviceAccount };
  }
}

/** Builds the real googleapis client from environment variables. */
export async function createSheetsClientFromEnv(): Promise<{ client: SheetsClient; email: string }> {
  const { sheets, auth } = await import('@googleapis/sheets');
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '';
  let key = process.env.GOOGLE_PRIVATE_KEY ?? '';
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const raw = json.trim().startsWith('{') ? json : Buffer.from(json, 'base64').toString('utf8');
    const parsed = JSON.parse(raw) as { client_email: string; private_key: string };
    email = parsed.client_email;
    key = parsed.private_key;
  }
  if (!email || !key) throw new AdapterError('Google service account credentials are missing (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY, or GOOGLE_SERVICE_ACCOUNT_JSON).');
  const jwt = new auth.JWT({ email, key: key.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const client = sheets({ version: 'v4', auth: jwt }) as unknown as SheetsClient;
  return { client, email };
}
