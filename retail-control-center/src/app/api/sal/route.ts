import { getRepository, handle, readJson, userFrom } from '@/lib/server/instance';

/** CONFIRM MEETING MINUTES — the only operation that creates a new SAL baseline. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{
      storeId: string; salDate: string; baselineTimestamp: string; previousSalDate: string;
      generationTimestamp: string; generatedMinutes: string; finalMinutes: string; minutesJson: string;
    }>(req);
    return (await getRepository()).confirmSal(body, userFrom(req));
  });
}
