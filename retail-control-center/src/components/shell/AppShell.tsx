'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useApp } from '@/lib/client/store';
import { Button, Skeleton } from '@/components/ui/primitives';
import { DrawerHost } from '@/components/tasks/DrawerHost';
import { GlobalSearch } from './GlobalSearch';
import { Sidebar } from './Sidebar';
import { Toaster } from './Toaster';
import { TopBar } from './TopBar';

function useSyncEngine() {
  const load = useApp((s) => s.load);
  const interval = useApp((s) => s.snapshot?.settings.Refresh_Interval_Seconds ?? 60);
  const pending = useApp((s) => s.pending.length);

  useEffect(() => {
    load();
  }, [load]);

  // periodic refresh (ETag based → cheap when nothing changed)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load({ silent: true });
    }, interval * 1000);
    const onFocus = () => load({ silent: true });
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [interval, load]);

  // never lose edits silently
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useApp.getState();
      if (s.pending.length || s.inflight) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pending]);
}

function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      const target = e.target as HTMLElement;
      const typing = /input|textarea|select/i.test(target.tagName) || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setSearchOpen(true);
        return;
      }
      if (typing) return;
      if (e.key === '/' ) {
        e.preventDefault();
        s.setSearchOpen(true);
      } else if (e.key === 'Escape') {
        if (s.searchOpen) s.setSearchOpen(false);
        else if (s.drawer) s.closeDrawer();
        else if (s.presentation) s.setPresentation(false);
      } else if (e.shiftKey && e.key.toLowerCase() === 'p') {
        s.setPresentation(!s.presentation);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function AppShell({ children }: { children: ReactNode }) {
  useSyncEngine();
  useGlobalKeys();
  const loadState = useApp((s) => s.loadState);
  const loadError = useApp((s) => s.loadError);
  const presentation = useApp((s) => s.presentation);
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const load = useApp((s) => s.load);
  const setUserName = useApp((s) => s.setUserName);

  useEffect(() => {
    document.documentElement.classList.toggle('presentation', presentation);
  }, [presentation]);

  useEffect(() => {
    try {
      const u = localStorage.getItem('gg-roc-user');
      if (u) setUserName(u);
    } catch {
      /* storage unavailable */
    }
  }, [setUserName]);

  return (
    <div className="flex h-screen overflow-hidden">
      {!presentation && <Sidebar collapsed={collapsed} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="print-full relative min-h-0 flex-1 overflow-auto" id="main">
          {loadState === 'loading' && <LoadingState />}
          {loadState === 'error' && (
            <div className="mx-auto mt-24 max-w-lg rounded-lg border border-st-red/30 bg-paper p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-st-red" />
                <div className="min-w-0">
                  <h1 className="text-sm font-semibold">Cannot reach the data source</h1>
                  <p className="mt-1 break-words text-[13px] text-ink-2">{loadError}</p>
                  <p className="mt-2 text-xs text-ink-3">
                    Check the Google Sheets connection (service account shared on the spreadsheet, GOOGLE_SHEETS_ID, credentials) or run the app in local demo mode (DATA_SOURCE=local). See README → Google Sheets connection.
                  </p>
                  <Button className="mt-4" variant="primary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => load({ force: true })}>
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          )}
          {loadState === 'ready' && children}
        </main>
      </div>
      {loadState === 'ready' && (
        <>
          <DrawerHost />
          <GlobalSearch />
        </>
      )}
      <Toaster />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-9 w-72" />
      <div className="grid grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="col-span-2 h-96" />
        <Skeleton className="h-96" />
      </div>
      <p className="text-xs text-ink-3">Loading program data…</p>
    </div>
  );
}
