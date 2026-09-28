import { dataSource, getRepository, handle } from '@/lib/server/instance';
import { ValidationError } from '@/lib/server/repository';

/** Restores the demo dataset. Local mode only unless ALLOW_SHEETS_RESET=true. */
export async function POST() {
  return handle(async () => {
    if (dataSource() === 'sheets' && process.env.ALLOW_SHEETS_RESET !== 'true') throw new ValidationError(['Demo reset is disabled on Google Sheets (set ALLOW_SHEETS_RESET=true to allow).']);
    return (await getRepository()).resetDemo();
  });
}
