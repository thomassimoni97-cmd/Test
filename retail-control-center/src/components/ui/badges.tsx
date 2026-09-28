'use client';

import { AlertOctagon, CalendarCheck2, CalendarClock, CalendarX2, Gavel, Plane } from 'lucide-react';
import { fmtDate } from '@/lib/domain/dates';
import { useApp } from '@/lib/client/store';
import type { RiskLevel, StatusTone } from '@/lib/domain/types';
import { cn } from './primitives';

export const TONE: Record<StatusTone, { fg: string; bg: string; dot: string; bar: string }> = {
  green: { fg: 'text-st-green', bg: 'bg-st-greenBg', dot: 'bg-st-green', bar: 'bg-st-green' },
  blue: { fg: 'text-st-blue', bg: 'bg-st-blueBg', dot: 'bg-st-blue', bar: 'bg-st-blue' },
  amber: { fg: 'text-st-amber', bg: 'bg-st-amberBg', dot: 'bg-st-amber', bar: 'bg-st-amber' },
  red: { fg: 'text-st-red', bg: 'bg-st-redBg', dot: 'bg-st-red', bar: 'bg-st-red' },
  grey: { fg: 'text-st-grey', bg: 'bg-st-greyBg', dot: 'bg-st-grey', bar: 'bg-st-grey' },
  neutral: { fg: 'text-st-neutral', bg: 'bg-st-neutralBg', dot: 'bg-st-neutral', bar: 'bg-st-neutral' },
  violet: { fg: 'text-st-violet', bg: 'bg-st-violetBg', dot: 'bg-st-violet', bar: 'bg-st-violet' },
  teal: { fg: 'text-st-teal', bg: 'bg-st-tealBg', dot: 'bg-st-teal', bar: 'bg-st-teal' },
};

export function useStatusTone(status: string): StatusTone {
  return useApp((s) => s.snapshot?.settings.Statuses.find((x) => x.name === status)?.tone ?? 'grey');
}

/** Status pill: dot + text (never colour only). */
export function StatusPill({ status, size = 'md', className }: { status: string; size?: 'sm' | 'md'; className?: string }) {
  const tone = TONE[useStatusTone(status)];
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full font-medium', tone.bg, tone.fg, size === 'sm' ? 'h-5 px-2 text-2xs' : 'h-6 px-2.5 text-xs', className)}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot, status === 'Blocked' && 'h-2 w-2 rounded-[2px]')} aria-hidden />
      <span className="truncate">{status}</span>
    </span>
  );
}

const RISK_STYLE: Record<RiskLevel, { fg: string; bars: number; bg: string }> = {
  Low: { fg: 'text-st-green', bars: 1, bg: 'bg-st-greenBg' },
  Medium: { fg: 'text-st-amber', bars: 2, bg: 'bg-st-amberBg' },
  High: { fg: 'text-st-red', bars: 3, bg: 'bg-st-redBg' },
};

/** Risk: signal-bars glyph + text. */
export function RiskBadge({ level, variant = 'plain', className, label = true }: { level: RiskLevel | null | undefined; variant?: 'plain' | 'solid'; className?: string; label?: boolean }) {
  if (!level) return <span className="text-xs text-ink-4">—</span>;
  const s = RISK_STYLE[level];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium', s.fg, variant === 'solid' && cn('h-6 rounded-full px-2.5', s.bg), className)} title={`${level} risk`}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('w-[3px] rounded-[1px]', i <= s.bars ? 'bg-current' : 'bg-current opacity-20')} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {label && level}
    </span>
  );
}

export function ProgressBar({ value, className, tone = 'gold', height = 6, showLabel = false, labelClass }: { value: number; className?: string; tone?: 'gold' | 'ink' | 'green' | 'red'; height?: number; showLabel?: boolean; labelClass?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const fill = { gold: 'bg-sand-500', ink: 'bg-ink', green: 'bg-st-green', red: 'bg-st-red' }[tone];
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative w-full overflow-hidden rounded-full bg-sand-100" style={{ height }} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('absolute inset-y-0 left-0 rounded-full', fill)} style={{ width: `${v}%` }} />
      </div>
      {showLabel && <span className={cn('tnum w-9 shrink-0 text-right text-xs font-semibold text-ink', labelClass)}>{v}%</span>}
    </div>
  );
}

export function DelayBadge({ days, late }: { days: number | null; late?: number | null }) {
  if (days) return <span className="tnum inline-flex items-center rounded bg-st-redBg px-1.5 text-xs font-semibold text-st-red" title={`${days} days overdue`}>+{days}d</span>;
  if (late) return <span className="tnum whitespace-nowrap text-2xs text-ink-3" title={`Completed ${late} days after due date`}>late +{late}d</span>;
  return <span className="text-xs text-ink-4">—</span>;
}

export function OpeningDate({ date, status, className, withIcon = true }: { date: string; status: string; className?: string; withIcon?: boolean }) {
  const Icon = status === 'Confirmed' ? CalendarCheck2 : status === 'Tentative' ? CalendarClock : CalendarX2;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)} title={`Opening date ${status.toLowerCase()}`}>
      {withIcon && <Icon className={cn('h-3.5 w-3.5 shrink-0', status === 'Confirmed' ? 'text-ink-2' : 'text-sand-600')} />}
      <span className={cn('tnum', status !== 'Confirmed' && 'italic')}>{date ? fmtDate(date) : 'TBD'}</span>
      {status !== 'Confirmed' && <span className="rounded-sm border border-sand-300 px-1 text-2xs font-semibold uppercase not-italic tracking-wide text-sand-700">{status}</span>}
    </span>
  );
}

export function AirportMark({ className }: { className?: string }) {
  return <Plane className={cn('inline h-3.5 w-3.5 -rotate-45 text-sand-600', className)} aria-label="Airport store" />;
}

export function BlockerMark({ className }: { className?: string }) {
  return <AlertOctagon className={cn('inline h-3.5 w-3.5 text-st-red', className)} aria-label="Blocker" />;
}

export function DecisionMark({ className }: { className?: string }) {
  return <Gavel className={cn('inline h-3.5 w-3.5 text-st-violet', className)} aria-label="Decision required" />;
}

export function DaysTo({ days }: { days: number | null }) {
  if (days === null) return <span className="text-ink-4">—</span>;
  if (days < 0) return <span className="tnum text-ink-3">opened {Math.abs(days)}d ago</span>;
  return (
    <span className="tnum">
      <span className="font-semibold">{days}</span>
      <span className="text-ink-3"> d</span>
    </span>
  );
}
