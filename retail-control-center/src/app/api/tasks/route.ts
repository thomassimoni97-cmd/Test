import { getRepository, handle, readJson, userFrom } from '@/lib/server/instance';
import type { Task } from '@/lib/domain/types';

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ task: Partial<Task> & { Store_ID: string; Area: string; Task_Title: string }; note?: string }>(req);
    return (await getRepository()).createTask(body.task, userFrom(req), body.note ?? '');
  });
}
