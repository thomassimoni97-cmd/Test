import { NextResponse } from 'next/server';
import { getRepository, handle } from '@/lib/server/instance';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  const ifNoneMatch = req.headers.get('if-none-match');
  try {
    const repo = await getRepository();
    const etag = await repo.getEtag({ force });
    if (ifNoneMatch && ifNoneMatch === `"${etag}"`) return new NextResponse(null, { status: 304, headers: { ETag: `"${etag}"` } });
    const snap = await repo.getSnapshot();
    return NextResponse.json(snap, { headers: { ETag: `"${snap.meta.etag}"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return handle(async () => {
      throw e;
    });
  }
}
