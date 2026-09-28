// Creates / refreshes the Google Sheets structure: 7 tabs, headers, frozen header row, dropdown validation.
//   npm run sheets:init            → structure + demo dataset (overwrites the 7 tabs!)
//   npm run sheets:init -- --empty → structure + default areas / settings only, no demo data
//   add --yes to skip the confirmation prompt
import readline from 'node:readline/promises';
import { DEFAULT_SETTINGS, serializeArea, serializeSettings, TABLE_NAMES, type RawTables } from '../src/lib/domain/schema';
import { buildSeedTables, SEED_AREAS } from '../src/lib/domain/seed';
import { GoogleSheetsAdapter, createSheetsClientFromEnv } from '../src/lib/server/adapters/sheets-adapter';
import { loadEnv } from './env';

async function main() {
  loadEnv();
  const id = process.env.GOOGLE_SHEETS_ID;
  if (!id) throw new Error('GOOGLE_SHEETS_ID is not set (see .env.example)');
  const empty = process.argv.includes('--empty');
  const { client, email } = await createSheetsClientFromEnv();
  const adapter = new GoogleSheetsAdapter(client, id, email);
  console.log(`Spreadsheet: ${id}\nService account: ${email}\nMode: ${empty ? 'empty structure' : 'structure + demo data'}`);
  if (!process.argv.includes('--yes')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`This will OVERWRITE the tabs ${TABLE_NAMES.join(', ')}. Type "yes" to continue: `);
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') return console.log('Aborted.');
  }
  const tables: RawTables = empty
    ? { STORES: [], TASKS: [], TASK_HISTORY: [], OWNERS: [], SAL_HISTORY: [], AREAS: SEED_AREAS.map((a) => serializeArea({ ...a, rev: '' })), SETTINGS: serializeSettings(DEFAULT_SETTINGS) }
    : buildSeedTables();
  await adapter.replaceTables(tables);
  await adapter.applyFormatting({ statuses: DEFAULT_SETTINGS.Statuses.map((s) => s.name) });
  const counts = Object.entries(tables).map(([k, v]) => `${k}: ${v.length}`).join(' · ');
  console.log(`Done. ${counts}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
