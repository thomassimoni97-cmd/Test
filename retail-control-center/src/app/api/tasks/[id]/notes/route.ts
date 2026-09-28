import { getRepository, handle, readJson, userFrom } from '@/lib/server/instance';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ text: string }>(req);
    return (await getRepository()).addNote(decodeURIComponent(id), body.text ?? '', userFrom(req));
  });
}
