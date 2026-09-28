import { getRepository, handle, readJson } from '@/lib/server/instance';
import type { Owner } from '@/lib/domain/types';

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ owner: Omit<Owner, 'rev' | 'Owner_ID'> & { Owner_ID?: string } }>(req);
    return (await getRepository()).saveOwner(body.owner);
  });
}
