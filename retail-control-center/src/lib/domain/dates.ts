import { addDays, differenceInCalendarDays, format, isValid, parse, parseISO } from 'date-fns';
import type { ISODate } from './types';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toISODate(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd');
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function isISODate(v: string): boolean {
  return ISO_RE.test(v) && isValid(parseISO(v));
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  return toISODate(addDays(parseISO(iso), days));
}

/** b - a in calendar days. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

const LOOSE_FORMATS = ['dd/MM/yyyy', 'd/M/yyyy', 'dd.MM.yyyy', 'd MMM yyyy', 'dd MMM yyyy', 'd MMMM yyyy', 'MMM d, yyyy', 'yyyy/MM/dd'];

/**
 * Parses whatever a Google Sheet cell may contain into an ISO date.
 * Returns { value: '' , ok: true } for blank cells, ok:false for unparseable input.
 */
export function parseLooseDate(input: unknown): { value: ISODate; ok: boolean } {
  if (input === null || input === undefined) return { value: '', ok: true };
  if (typeof input === 'number' && Number.isFinite(input)) {
    // Google Sheets / Excel serial date (days since 1899-12-30)
    if (input > 20000 && input < 80000) {
      const ms = Math.round((input - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return { value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`, ok: true };
    }
    return { value: '', ok: false };
  }
  const s = String(input).trim();
  if (!s) return { value: '', ok: true };
  if (ISO_RE.test(s)) return isValid(parseISO(s)) ? { value: s, ok: true } : { value: '', ok: false };
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = parseISO(s);
    return isValid(d) ? { value: toISODate(d), ok: true } : { value: '', ok: false };
  }
  for (const f of LOOSE_FORMATS) {
    const d = parse(s, f, new Date(2000, 0, 1));
    if (isValid(d) && d.getFullYear() > 1990) return { value: toISODate(d), ok: true };
  }
  return { value: '', ok: false };
}

export function fmtDate(iso: string | undefined | null, pattern = 'dd MMM yyyy'): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  return isValid(d) ? format(d, pattern) : '—';
}

export const fmtShort = (iso: string | undefined | null) => fmtDate(iso, 'dd MMM');

export function fmtTimestamp(ts: string | undefined | null, pattern = 'dd MMM yyyy, HH:mm'): string {
  if (!ts) return '—';
  const d = parseISO(ts);
  return isValid(d) ? format(d, pattern) : '—';
}

/** "Today 14:32", "Yesterday 09:10", "24 Sep 11:04" */
export function fmtRelativeTs(ts: string, now: Date = new Date()): string {
  const d = parseISO(ts);
  if (!isValid(d)) return '—';
  const diff = differenceInCalendarDays(now, d);
  if (diff === 0) return `Today ${format(d, 'HH:mm')}`;
  if (diff === 1) return `Yesterday ${format(d, 'HH:mm')}`;
  if (d.getFullYear() === now.getFullYear()) return format(d, 'dd MMM HH:mm');
  return format(d, 'dd MMM yyyy');
}

export function nowTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}

/** Local calendar date of a timestamp. */
export function tsToISODate(ts: string): ISODate {
  const d = parseISO(ts);
  return isValid(d) ? toISODate(d) : '';
}
