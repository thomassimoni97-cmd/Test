'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useModel } from '@/lib/client/model';
import { useApp } from '@/lib/client/store';
import { OpeningsTable } from '@/components/overview/OpeningsTable';
import { Button, Card } from '@/components/ui/primitives';

export default function StoresIndexPage() {
  const m = useModel();
  const router = useRouter();
  const last = useApp((s) => s.prefs.lastStore) as string | undefined;
  const openNewStore = useApp((s) => s.openNewStore);
  const presentation = useApp((s) => s.presentation);
  useEffect(() => {
    if (presentation && last && m.storesById.has(last)) router.replace(`/stores/${last}`);
  }, [presentation, last, m.storesById, router]);
  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-6 py-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">What do we need to discuss for this opening?</div>
          <h1 className="mt-0.5 text-[1.6rem] font-semibold tracking-tight">Store SAL</h1>
          <p className="mt-1 text-[13px] text-ink-3">Select an opening to run its SAL.{last && m.storesById.has(last) && <> Last opened: <button type="button" className="font-medium text-sand-700 hover:underline" onClick={() => router.push(`/stores/${last}`)}>{m.storesById.get(last)!.Store_Name}</button></>}</p>
        </div>
        {!presentation && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openNewStore}>New opening</Button>}
      </div>
      <Card>
        <OpeningsTable stats={m.stores.map((s) => m.storeStats.get(s.Store_ID)!)} />
      </Card>
    </div>
  );
}
