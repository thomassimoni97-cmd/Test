import 'server-only';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { JsonFileAdapter } from './adapters/json-adapter';
import { GoogleSheetsAdapter, createSheetsClientFromEnv } from './adapters/sheets-adapter';
import { AdapterError, type TableAdapter } from './adapters/types';
import { ConflictError, NotFoundError, Repository, ValidationError } from './repository';

const g = globalThis as unknown as { __ggRepo?: Promise<Repository> };

export function dataSource(): 'sheets' | 'local' {
  const explicit = (process.env.DATA_SOURCE ?? '').toLowerCase();
  if (explicit === 'local') return 'local';
  if (explicit === 'sheets') return 'sheets';
  return process.env.GOOGLE_SHEETS_ID ? 'sheets' : 'local';
}

async function createAdapter(): Promise<TableAdapter> {
  if (dataSource() === 'sheets') {
    const id = process.env.GOOGLE_SHEETS_ID;
    if (!id) throw new AdapterError('GOOGLE_SHEETS_ID is not set.');
    const { client, email } = await createSheetsClientFromEnv();
    return new GoogleSheetsAdapter(client, id, email);
  }
  const file = process.env.LOCAL_DATA_FILE || (process.env.VERCEL ? '/tmp/gg-roc-db.json' : path.join(process.cwd(), '.data', 'db.json'));
  return new JsonFileAdapter(file);
}

export function getRepository(): Promise<Repository> {
  if (!g.__ggRepo) {
    const ttl = Number(process.env.SHEETS_CACHE_TTL_MS);
    g.__ggRepo = createAdapter().then((a) => new Repository(a, Number.isFinite(ttl) && ttl > 0 ? ttl : undefined));
    g.__ggRepo.catch(() => {
      g.__ggRepo = undefined; // allow retry after fixing configuration
    });
  }
  return g.__ggRepo;
}

export function userFrom(req: Request): string {
  const h = req.headers.get('x-gg-user');
  const name = h ? decodeURIComponent(h).trim().slice(0, 80) : '';
  return name || process.env.DEFAULT_USER_NAME || 'PMO Admin';
}

export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message, issues: e.issues }, { status: 400 });
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message, current: e.current }, { status: 409 });
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof AdapterError) return NextResponse.json({ error: e.message, source: dataSource() }, { status: 502 });
    console.error(e);
    return NextResponse.json({ error: (e as Error)?.message ?? 'Unexpected error' }, { status: 500 });
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError(['Invalid JSON body']);
  }
}
