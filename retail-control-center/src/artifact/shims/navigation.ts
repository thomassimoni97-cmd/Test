// Replacement for 'next/navigation' in the artifact edition.
import { createContext, useContext, useMemo } from 'react';
import { navigate, useLocation } from './router';

export const ParamsContext = createContext<Record<string, string>>({});

export function useRouter() {
  return { push: (h: string) => navigate(h), replace: (h: string) => navigate(h), back: () => undefined, refresh: () => undefined, prefetch: () => undefined };
}
export function usePathname() {
  return useLocation().path;
}
export function useSearchParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}
export function useParams<T extends Record<string, string>>(): T {
  return useContext(ParamsContext) as T;
}
