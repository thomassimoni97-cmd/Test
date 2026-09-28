import { dataSource, getRepository, handle } from '@/lib/server/instance';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const started = Date.now();
    const repo = await getRepository();
    const snap = await repo.getSnapshot({ force: true });
    return {
      ok: true,
      source: dataSource(),
      details: repo.adapter.describe(),
      latencyMs: Date.now() - started,
      counts: { stores: snap.stores.length, tasks: snap.tasks.length, history: snap.history.length, sals: snap.sals.length },
      issues: snap.issues.length,
    };
  });
}
