// Writes the Google Sheets template (one CSV per tab, with demo data) into ./sheets-template.
// Import each CSV as a tab of the same name (File → Import → Insert new sheet), or use `npm run sheets:init`.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TABLES, str, type TableName } from '../src/lib/domain/schema';
import { buildSeedTables } from '../src/lib/domain/seed';

const out = path.join(process.cwd(), 'sheets-template');
mkdirSync(out, { recursive: true });
const anchor = process.argv[2] ? new Date(`${process.argv[2]}T12:00:00`) : new Date();
const tables = buildSeedTables(anchor);
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
for (const [name, rows] of Object.entries(tables) as [TableName, (typeof tables)[TableName]][]) {
  const headers = TABLES[name].headers;
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => cell(str(r[h]))).join(','))];
  writeFileSync(path.join(out, `${name}.csv`), lines.join('\n') + '\n');
  console.log(`${name}.csv  ${rows.length} rows`);
}
