// Entry point of the Claude-artifact edition: same pages and components, in-memory routing,
// data in the artifact's private document store.
import { createRoot } from 'react-dom/client';
import { useEffect, useState, type ComponentType } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { Button } from '@/components/ui/primitives';
import { useApp } from '@/lib/client/store';
import { api, useStorage } from './api-browser';
import { ParamsContext } from './shims/navigation';
import { useLocation } from './shims/router';
import Overview from '@/app/page';
import Stores from '@/app/stores/page';
import StoreSal from '@/app/stores/[storeId]/page';
import MinutesGen from '@/app/stores/[storeId]/minutes/page';
import Areas from '@/app/areas/page';
import AreaPage from '@/app/areas/[areaId]/page';
import Actions from '@/app/actions/page';
import Kanban from '@/app/kanban/page';
import Calendar from '@/app/calendar/page';
import Timeline from '@/app/timeline/page';
import Minutes from '@/app/minutes/page';
import History from '@/app/history/page';
import SettingsPage from '@/app/settings/page';

(window as unknown as { __GG_ARTIFACT__: boolean }).__GG_ARTIFACT__ = true;

const ROUTES: [RegExp, ComponentType, string[]][] = [
  [/^\/$/, Overview, []],
  [/^\/stores$/, Stores, []],
  [/^\/stores\/([^/]+)\/minutes$/, MinutesGen, ['storeId']],
  [/^\/stores\/([^/]+)$/, StoreSal, ['storeId']],
  [/^\/areas$/, Areas, []],
  [/^\/areas\/([^/]+)$/, AreaPage, ['areaId']],
  [/^\/actions$/, Actions, []],
  [/^\/kanban$/, Kanban, []],
  [/^\/calendar$/, Calendar, []],
  [/^\/timeline$/, Timeline, []],
  [/^\/minutes$/, Minutes, []],
  [/^\/history$/, History, []],
  [/^\/settings$/, SettingsPage, []],
];

function Router() {
  const { path } = useLocation();
  for (const [re, Page, names] of ROUTES) {
    const m = path.match(re);
    if (m) {
      const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      return (
        <ParamsContext.Provider value={params}>
          <Page key={path} />
        </ParamsContext.Provider>
      );
    }
  }
  return <Overview />;
}

function Welcome() {
  const load = useApp((s) => s.load);
  const [busy, setBusy] = useState<'' | 'demo' | 'empty'>('');
  const [err, setErr] = useState('');
  const run = async (kind: 'demo' | 'empty') => {
    setBusy(kind);
    setErr('');
    try {
      if (kind === 'demo') await api.resetDemo();
      else await api.startEmpty();
      await load({ force: true });
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy('');
  };
  return (
    <div className="mx-auto mt-20 max-w-xl rounded-lg border border-line bg-paper p-8">
      <div className="eyebrow">First start</div>
      <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">Retail Opening Control Center</h1>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
        Your program data is saved privately inside this artifact. Load the demo program (19 openings, Amsterdam Airport with three confirmed SALs) to explore the SAL workflow, or start from an empty program with the default functional areas.
      </p>
      {err && <p className="mt-3 text-xs text-st-red">{err}</p>}
      <div className="mt-6 flex gap-2">
        <Button variant="gold" size="lg" disabled={!!busy} onClick={() => run('demo')}>{busy === 'demo' ? 'Loading demo…' : 'Load demo program'}</Button>
        <Button size="lg" disabled={!!busy} onClick={() => run('empty')}>{busy === 'empty' ? 'Preparing…' : 'Start empty'}</Button>
      </div>
    </div>
  );
}

function Gate() {
  const storage = useStorage();
  const stores = useApp((s) => s.snapshot?.stores.length ?? 0);
  if (storage.mode === 'saved' && storage.empty && stores === 0) return <Welcome />;
  return (
    <>
      {storage.mode === 'memory' && (
        <div className="no-print border-b border-st-amber/30 bg-st-amberBg px-6 py-1.5 text-xs text-st-amber">
          Preview with demo data — this view cannot save. Open the artifact in Claude to keep your changes.
        </div>
      )}
      <Router />
    </>
  );
}

function App() {
  useEffect(() => {
    document.title = 'Retail Opening Control Center';
  }, []);
  return (
    <AppShell>
      <Gate />
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
