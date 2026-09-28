'use client';

import { create } from 'zustand';

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
  ttl?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
}

let n = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++n;
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    const ttl = t.ttl ?? (t.tone === 'error' || t.action ? 9000 : 3500);
    if (ttl > 0) setTimeout(() => get().dismiss(id), ttl);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export const toast = {
  info: (title: string, body?: string) => useToasts.getState().push({ tone: 'info', title, body }),
  success: (title: string, body?: string) => useToasts.getState().push({ tone: 'success', title, body }),
  warning: (title: string, body?: string, action?: Toast['action']) => useToasts.getState().push({ tone: 'warning', title, body, action }),
  error: (title: string, body?: string, action?: Toast['action']) => useToasts.getState().push({ tone: 'error', title, body, action }),
};
