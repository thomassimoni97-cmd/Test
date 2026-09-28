'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export const cn = clsx;

type BtnVariant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger' | 'quiet';
export function Button({ variant = 'secondary', size = 'md', className, icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-7 px-2.5 text-xs',
        size === 'md' && 'h-8 px-3 text-[13px]',
        size === 'lg' && 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-ink text-ivory hover:bg-ink-2',
        variant === 'gold' && 'bg-sand-500 text-white hover:bg-sand-600',
        variant === 'secondary' && 'border border-line-strong bg-paper text-ink hover:border-ink-4 hover:bg-wash',
        variant === 'ghost' && 'text-ink-2 hover:bg-wash hover:text-ink',
        variant === 'quiet' && 'text-ink-3 hover:text-ink',
        variant === 'danger' && 'border border-st-red/30 bg-paper text-st-red hover:bg-st-redBg',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('h-8 rounded-md border border-line-strong bg-paper px-2.5 text-[13px] text-ink placeholder:text-ink-4 focus:border-sand-500 focus:outline-none', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('w-full rounded-md border border-line-strong bg-paper px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-4 focus:border-sand-500 focus:outline-none', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-8 cursor-pointer appearance-none rounded-md border border-line-strong bg-paper bg-[length:14px] bg-[right_6px_center] bg-no-repeat pl-2.5 pr-7 text-[13px] text-ink focus:border-sand-500 focus:outline-none',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237F766D' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-md border border-line-strong bg-wash p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          title={o.title}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors',
            size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-[13px]',
            value === o.value ? 'bg-paper text-ink shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ToggleChip({ active, onClick, children, tone = 'ink', title }: { active: boolean; onClick: () => void; children: ReactNode; tone?: 'ink' | 'red' | 'amber' | 'blue' | 'violet'; title?: string }) {
  const tones = {
    ink: 'bg-ink text-ivory border-ink',
    red: 'bg-st-redBg text-st-red border-st-red/40',
    amber: 'bg-st-amberBg text-st-amber border-st-amber/40',
    blue: 'bg-st-blueBg text-st-blue border-st-blue/40',
    violet: 'bg-st-violetBg text-st-violet border-st-violet/40',
  };
  return (
    <button type="button" title={title} aria-pressed={active} onClick={onClick} className={cn('inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors', active ? tones[tone] : 'border-line-strong bg-paper text-ink-2 hover:border-ink-4')}>
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-paper px-1 font-sans text-2xs font-medium text-ink-3">{children}</kbd>;
}

export function Empty({ icon, title, body, action, compact }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-1 px-4 py-5' : 'gap-2 px-6 py-10')}>
      {icon && <div className="mb-1 text-sand-400">{icon}</div>}
      <p className={cn('font-medium text-ink-2', compact ? 'text-[13px]' : 'text-sm')}>{title}</p>
      {body && <p className="max-w-sm text-xs text-ink-3">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-line/70', className)} />;
}

export function Card({ className, children, title, actions, eyebrow, id }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; id?: string }) {
  return (
    <section id={id} className={cn('rounded-lg border border-line bg-paper', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h2 className="truncate text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Lightweight popover (click to open, click outside / Esc to close). */
export function Popover({ trigger, children, align = 'left', className }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      {open && <div className={cn('absolute z-40 mt-1 min-w-48 animate-fadein rounded-lg border border-line bg-paper p-1 shadow-pop', align === 'right' ? 'right-0' : 'left-0', className)}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-2xs text-ink-3">{hint}</span>}
    </label>
  );
}
