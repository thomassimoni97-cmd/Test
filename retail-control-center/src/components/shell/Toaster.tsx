'use client';

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToasts } from '@/lib/client/toasts';
import { cn } from '@/components/ui/primitives';

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[80] flex w-96 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : t.tone === 'warning' ? AlertTriangle : Info;
        return (
          <div key={t.id} className="pointer-events-auto flex animate-slidein items-start gap-3 rounded-lg border border-line bg-paper p-3 shadow-pop">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.tone === 'success' && 'text-st-green', t.tone === 'error' && 'text-st-red', t.tone === 'warning' && 'text-st-amber', t.tone === 'info' && 'text-st-blue')} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-ink-2">{t.body}</p>}
              {t.action && (
                <button
                  type="button"
                  className="mt-1.5 text-xs font-semibold text-sand-700 underline-offset-2 hover:underline"
                  onClick={() => {
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="text-ink-4 hover:text-ink" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
