// In-memory router for the single-page artifact edition (the artifact frame keeps no URL state).
import { useSyncExternalStore } from 'react';

type Loc = { path: string; search: string };
const KEY = 'gg-roc-route';
function initial(): Loc {
  try {
    const s = sessionStorage.getItem(KEY);
    if (s) return JSON.parse(s) as Loc;
  } catch {
    /* storage unavailable */
  }
  return { path: '/stores/AMS', search: '' };
}
let loc: Loc = initial();
const listeners = new Set<() => void>();

export function navigate(href: string) {
  const [path, search = ''] = href.split('?');
  loc = { path: path || '/', search };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(loc));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
  document.getElementById('main')?.scrollTo({ top: 0 });
}

export function useLocation(): Loc {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => loc,
  );
}
