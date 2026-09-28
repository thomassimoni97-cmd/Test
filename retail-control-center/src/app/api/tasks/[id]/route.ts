import { getRepository, handle, readJson, userFrom } from '@/lib/server/instance';
import type { TaskPatch } from '@/lib/domain/types';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ patch: TaskPatch; rev: string; note?: string }>(req);
    return (await getRepository()).updateTask(decodeURIComponent(id), body.patch ?? {}, body.rev ?? '', userFrom(req), body.note ?? '');
  });
}

/** Safe delete = archive (the row and its history are kept). */
export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    return (await getRepository()).archiveTask(decodeURIComponent(id), url.searchParams.get('rev') ?? '', userFrom(req), url.searchParams.get('reason') ?? '');
  });
}
