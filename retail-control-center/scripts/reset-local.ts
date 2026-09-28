// Restores the local demo dataset (.data/db.json or LOCAL_DATA_FILE).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildSeedTables } from '../src/lib/domain/seed';
import { loadEnv } from './env';

loadEnv();
const file = process.env.LOCAL_DATA_FILE || path.join(process.cwd(), '.data', 'db.json');
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(buildSeedTables()));
console.log(`Demo data written to ${file} (restart the dev server if it is running).`);
