import { getRepository, handle, readJson } from '@/lib/server/instance';
import type { Settings } from '@/lib/domain/types';

export async function PUT(req: Request) {
  return handle(async () => {
    const body = await readJson<{ settings: Partial<Settings> }>(req);
    return (await getRepository()).updateSettings(body.settings ?? {});
  });
}
