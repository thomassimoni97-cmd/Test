'use client';

import { Check, CloudOff, Loader2, MonitorPlay, RefreshCw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fmtTimestamp } from '@/lib/domain/dates';
import { useApp } from '@/lib/client/store';
import { Button, Kbd, cn } from '@/components/ui/primitives';

export function SyncBadge() {
  const sync = useApp((s) => s.sync);
  const lastSync = useApp((s) => s.lastSync);
  const syncError = useApp((s) => s.syncError);
  const pending = useApp((s) => s.pending.length);
  const load = useApp((s) => s.load);
  const retry = useApp((s) => s.retryPending);
  const source = useApp((s) => s.snapshot?.meta.source);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const time = lastSync ? fmtTimestamp(lastSync, 'HH:mm') : '—';
  let label: React.ReactNode;
  let cls = 'text-ink-2';
  if (sync === 'syncing') label = (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…</>);
  else if (pending) {
    label = (<><CloudOff className="h-3.5 w-3.5" /> {pending} unsaved change{pending > 1 ? 's' : ''}</>);
    cls = 'text-st-amber';
  } else if (sync === 'error') {
    label = (<><CloudOff className="h-3.5 w-3.5" /> Sync error</>);
    cls = 'text-st-red';
  } else label = (<><Check className="h-3.5 w-3.5 text-st-green" /> Synced {time}</>);

  return (
    <div className="flex items-center gap-1">
      <div className={cn('flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium', cls)} title={syncError || `Source: ${source === 'sheets' ? 'Google Sheets' : source === 'browser' ? 'this Claude artifact' : 'Local demo file'} · last synchronization ${lastSync ? fmtTimestamp(lastSync) : '—'}`}>
        {label}
        <span className="hidden text-2xs font-normal text-ink-4 xl:inline">· {source === 'sheets' ? 'Google Sheets' : source === 'browser' ? 'Saved in Claude' : 'Demo data'}</span>
      </div>
      {pending > 0 ? (
        <Button size="sm" variant="secondary" onClick={() => retry()}>
          Retry
        </Button>
      ) : (
        <button type="button" onClick={() => load({ force: true })} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-wash hover:text-ink" title="Refresh from source" aria-label="Refresh">
          <RefreshCw className={cn('h-3.5 w-3.5', sync === 'syncing' && 'animate-spin')} />
        </button>
      )}
    </div>
  );
}

export function TopBar() {
  const presentation = useApp((s) => s.presentation);
  const setPresentation = useApp((s) => s.setPresentation);
  const setSearchOpen = useApp((s) => s.setSearchOpen);
  const settings = useApp((s) => s.snapshot?.settings);
  const userName = useApp((s) => s.userName) || 'PMO Admin';
  const initials = userName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className={cn('no-print flex shrink-0 items-center gap-3 border-b border-line bg-paper/80 px-4 backdrop-blur', presentation ? 'h-12' : 'h-14')}>
      {presentation && (
        <div className="mr-2 leading-tight">
          <div className="text-[12px] font-bold uppercase tracking-[0.28em]">Golden Goose</div>
          <div className="text-2xs uppercase tracking-[0.12em] text-sand-700">Retail Opening Control Center</div>
        </div>
      )}
      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <span className="truncate text-[13px] font-semibold text-ink">{settings?.Program_Name ?? 'Retail Opening Program'}</span>
        <span className="rounded-full border border-sand-300 bg-sand-50 px-2 py-0.5 text-2xs font-semibold tracking-wide text-sand-700">{settings?.Program_Year ?? ''}</span>
      </div>
      <div className="flex flex-1 justify-center">
        {!presentation && (
          <button type="button" onClick={() => setSearchOpen(true)} className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-line-strong bg-ivory px-3 text-left text-[13px] text-ink-3 hover:border-ink-4">
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">Search tasks, stores, owners, notes…</span>
            <Kbd>⌘K</Kbd>
          </button>
        )}
      </div>
      <SyncBadge />
      {presentation ? (
        <Button variant="secondary" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={() => setPresentation(false)} title="Exit presentation (Esc)">
          Exit presentation
        </Button>
      ) : (
        <Button variant="primary" size="sm" icon={<MonitorPlay className="h-3.5 w-3.5" />} onClick={() => setPresentation(true)} title="Presentation mode (Shift+P)">
          Present
        </Button>
      )}
      {!presentation && (
        <Link href="/settings?section=display" className="flex h-8 w-8 items-center justify-center rounded-full bg-sand-100 text-2xs font-bold text-sand-700 ring-1 ring-sand-200" title={`${userName} — change in Settings › Display`}>
          {initials}
        </Link>
      )}
    </header>
  );
}
