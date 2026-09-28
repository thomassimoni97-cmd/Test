import { getRepository, handle, readJson } from '@/lib/server/instance';
import type { Area } from '@/lib/domain/types';

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ area: Omit<Area, 'rev'>; isNew?: boolean; order?: string[] }>(req);
    const repo = await getRepository();
    if (body.order) return repo.reorderAreas(body.order);
    return repo.saveArea(body.area, !!body.isNew);
  });
}
