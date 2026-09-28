import { getRepository, handle, readJson, userFrom } from '@/lib/server/instance';
import type { StorePatch } from '@/lib/domain/types';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ patch: StorePatch; rev: string }>(req);
    return (await getRepository()).updateStore(decodeURIComponent(id), body.patch ?? {}, body.rev ?? '', userFrom(req));
  });
}
