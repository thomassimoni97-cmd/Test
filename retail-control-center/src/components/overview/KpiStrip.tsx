'use client';

import { cn } from '@/components/ui/primitives';

export interface Kpi {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'red' | 'amber' | 'violet' | 'green' | 'ink';
  onClick?: () => void;
  title?: string;
}

/** Compact executive indicator row — no oversized cards. */
export function KpiStrip({ items, className }: { items: Kpi[]; className?: string }) {
  return (
    <div className={cn('grid overflow-hidden rounded-lg border border-line bg-paper', className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((k, i) => {
        const Tag = k.onClick ? 'button' : 'div';
        return (
          <Tag
            key={k.label}
            type={k.onClick ? 'button' : undefined}
            onClick={k.onClick}
            title={k.title}
            className={cn('flex min-w-0 flex-col gap-1 px-4 py-3 text-left', i > 0 && 'border-l border-line', k.onClick && 'transition-colors hover:bg-wash/70')}
          >
            <span className="line-clamp-2 min-h-[2rem] text-2xs font-semibold uppercase leading-4 tracking-[0.06em] text-ink-3">{k.label}</span>
            <span
              className={cn(
                'tnum text-[1.7rem] font-semibold leading-none',
                k.tone === 'red' && 'text-st-red',
                k.tone === 'amber' && 'text-st-amber',
                k.tone === 'violet' && 'text-st-violet',
                k.tone === 'green' && 'text-st-green',
              )}
            >
              {k.value}
            </span>
            {k.sub && <span className="truncate text-2xs text-ink-3">{k.sub}</span>}
          </Tag>
        );
      })}
    </div>
  );
}
