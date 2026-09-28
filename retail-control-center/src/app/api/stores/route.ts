import { getRepository, handle, readJson, userFrom } from '@/lib/server/instance';
import type { Store } from '@/lib/domain/types';

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ store: Partial<Store> & { Store_ID: string; Store_Name: string } }>(req);
    return (await getRepository()).createStore(body.store, userFrom(req));
  });
}
