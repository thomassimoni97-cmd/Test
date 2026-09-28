// Meeting-minutes templates: the ONLY place that knows wording and layout.
// Input: StructuredMinutes (from the change detection engine). Output: an editable MinutesDoc.
// A future optional AI rewriting layer would implement the same MinutesTemplate contract.

import { fmtDate, fmtShort } from '../dates';
import { FIELD_LABELS } from '../mutations';
import { CORE_STATUS, type Task } from '../types';
import type { FieldChange, MinutesBullet, MinutesGroup, MinutesItem, MinutesSection, MinutesTemplate, StructuredMinutes } from './types';

let seq = 0;
export const uid = (p = 'm') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const trimDot = (s: string) => s.trim().replace(/[.;:\s]+$/, '');
const lcFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

function ownerTail(t: Task): string {
  return ` → ${t.Status} | Owner: ${t.Owner || 'TBD'}`;
}

function change(item: MinutesItem, field: string): FieldChange | undefined {
  return item.changes.find((c) => c.field === field);
}

function dueClause(c: FieldChange): string {
  if (!c.from && c.to) return `deadline set to ${fmtShort(c.to)}`;
  if (c.from && !c.to) return 'deadline removed';
  return `deadline moved from ${fmtShort(c.from)} to ${fmtShort(c.to)}`;
}

/** Consolidated parts of one task update: head (title), clauses and notes. */
export function partsFor(item: MinutesItem): { head: string; clauses: string[]; notes: string } {
  const t = item.task;
  const s = new Set(item.signals);
  const clauses: string[] = [];
  let head = t.Task_Title;

  if (s.has('recap')) {
    if (s.has('newBlocker')) clauses.push(item.blockerText ? `blocked – ${trimDot(item.blockerText)}` : 'blocked');
    if (s.has('overdue') && item.overdueDays) clauses.push(`overdue by ${item.overdueDays} days (due ${fmtShort(t.Due_Date)})`);
    else if (t.Due_Date && t.Status !== CORE_STATUS.completed) clauses.push(`due ${fmtShort(t.Due_Date)}`);
    if (s.has('newDecision')) clauses.push(item.decisionText ? `decision required: ${lcFirst(trimDot(item.decisionText))}` : 'decision required');
    if (t.Progress_Percentage > 0 && t.Status !== CORE_STATUS.completed) clauses.push(`${t.Progress_Percentage}% complete`);
    return { head, clauses, notes: '' };
  }

  if (s.has('created')) head = `New activity – ${head}`;
  if (s.has('completed')) clauses.push('completed');
  if (s.has('archived')) clauses.push('removed from the plan');
  if (s.has('newBlocker')) clauses.push(item.blockerText ? `blocked – ${lcFirst(trimDot(item.blockerText))}` : 'now blocked');
  if (s.has('overdue') && item.overdueDays) clauses.push(`overdue by ${item.overdueDays} day${item.overdueDays === 1 ? '' : 's'} (due ${fmtShort(t.Due_Date)})`);
  if (s.has('newDecision')) clauses.push(item.decisionText ? `decision required: ${lcFirst(trimDot(item.decisionText))}` : 'decision required');
  const due = change(item, 'Due_Date');
  if (due) clauses.push(dueClause(due));
  const st = change(item, 'Status');
  const prog = change(item, 'Progress_Percentage');
  const impliedStart = !!st && st.from === CORE_STATUS.notStarted && st.to === CORE_STATUS.inProgress;
  if (s.has('status') && st) {
    if (st.to === CORE_STATUS.blocked) clauses.push('now blocked');
    else if (impliedStart) clauses.push(prog ? 'started' : 'activity started');
    else clauses.push(`status moved from ${st.from || '—'} to ${st.to}`);
  }
  const own = change(item, 'Owner');
  if (own) clauses.push(`ownership moved to ${own.to || 'TBD'}${own.from ? ` (from ${own.from})` : ''}`);
  const risk = change(item, 'Risk_Level');
  if (risk) {
    const up = ['Low', 'Medium', 'High'].indexOf(risk.to) > ['Low', 'Medium', 'High'].indexOf(risk.from);
    clauses.push(`risk ${up ? 'raised' : 'lowered'} to ${risk.to}`);
  }
  const pr = change(item, 'Priority');
  if (pr) clauses.push(`priority set to ${pr.to}`);
  if (s.has('resolvedBlocker')) clauses.push('blocker resolved');
  if (s.has('resolvedDecision')) clauses.push('decision taken');
  if (s.has('progress') && prog) {
    const from = Number(prog.from) || 0;
    const to = Number(prog.to) || 0;
    clauses.push(to >= from ? `progressed to ${to}% (from ${from}%)` : `progress revised to ${to}% (from ${from}%)`);
  }
  if (s.has('created') && !clauses.length && t.Due_Date) clauses.push(`due ${fmtShort(t.Due_Date)}`);

  const notes = item.notes.map((n) => trimDot(n.text)).filter(Boolean).join('; ');
  return { head, clauses, notes };
}

function joinParts(clauses: string[], notes: string): string {
  let text = clauses.join('; ');
  if (notes) text += clauses.length ? `. Update: ${notes}` : notes;
  return text;
}

/** One consolidated, readable sentence per task. */
export function sentenceFor(item: MinutesItem): string {
  const { head, clauses, notes } = partsFor(item);
  const rest = joinParts(clauses, notes);
  return `${head}${rest ? `: ${rest}` : ''}${ownerTail(item.task)}`;
}

/** The change description alone (no title, status or owner) — used in the UI. */
export function summaryFor(item: MinutesItem): string {
  const { clauses, notes } = partsFor(item);
  const text = joinParts(clauses, notes);
  return text ? text[0].toUpperCase() + text.slice(1) : 'Updated';
}


function storeChangeText(c: FieldChange): string {
  const label = FIELD_LABELS[c.field] ?? c.field;
  if (c.field === 'Opening_Date') return c.from ? `Opening date moved from ${fmtDate(c.from)} to ${fmtDate(c.to)}` : `Opening date set to ${fmtDate(c.to)}`;
  if (c.field === 'Risk_Level') return `Opening risk level changed from ${c.from || '—'} to ${c.to}`;
  return `${label} changed from ${c.from || '—'} to ${c.to || '—'}`;
}

const bullet = (text: string, taskId?: string): MinutesBullet => ({ id: uid('b'), text, taskId });
const group = (subtitle: string, bullets: MinutesBullet[]): MinutesGroup => ({ id: uid('g'), subtitle, bullets });

function header(d: StructuredMinutes): string[] {
  const s = d.store;
  const lines = [
    `Opening ${s.Program_Type === 'New Company' ? 'Company' : 'Store'}: ${s.Opening_Date ? fmtDate(s.Opening_Date) : 'TBD'}${s.Opening_Date && s.Opening_Date_Status !== 'Confirmed' ? ` (${s.Opening_Date_Status})` : ''}`,
    `Last SAL: ${d.baseline.previousSalDate ? fmtDate(d.baseline.previousSalDate) : d.baseline.isFirst ? '— (first SAL baseline)' : '—'}`,
    `Current SAL: ${fmtDate(d.salDate)}`,
    `Overall completion: ${d.kpis.progress}%${d.kpis.daysToOpening !== null ? ` · Days to opening: ${d.kpis.daysToOpening}` : ''}`,
  ];
  if (d.baseline.isFirst) lines.push(d.baseline.mode === 'recap' ? 'First SAL — current-state recap (new baseline)' : `First SAL — changes since ${fmtDate(d.baseline.previousSalDate)} (new baseline)`);
  return lines;
}

function areaSections(d: StructuredMinutes): MinutesSection[] {
  const sections: MinutesSection[] = [];
  const byGroup = new Map<string, MinutesSection>();
  for (const a of d.areas) {
    const key = a.group;
    let sec = byGroup.get(key);
    if (!sec) {
      sec = { id: uid('s'), kind: 'area', title: key.toUpperCase(), numbered: true, groups: [] };
      byGroup.set(key, sec);
      sections.push(sec);
    }
    const subtitle = a.area.Area_Name === key ? '' : a.area.Area_Name;
    sec.groups.push(group(subtitle, a.items.map((it) => bullet(sentenceFor(it), it.task.Task_ID))));
  }
  // parent-area bullets (no subtitle) first within a group
  for (const s of sections) s.groups.sort((x, y) => (x.subtitle ? 1 : 0) - (y.subtitle ? 1 : 0));
  return sections;
}

function nextStepText(t: Task, overdueDays: number | null): string {
  return `${t.Task_Title} | Owner: ${t.Owner || 'TBD'} | Due Date: ${fmtDate(t.Due_Date)}${overdueDays ? ` (overdue +${overdueDays}d)` : ''}`;
}

function blockerSection(d: StructuredMinutes): MinutesSection | null {
  const bullets: MinutesBullet[] = [];
  for (const t of d.blockers) {
    const txt = t.Blocker && !/^(true|yes|x|1)$/i.test(t.Blocker.trim()) ? `: ${trimDot(t.Blocker)}` : '';
    bullets.push(bullet(`BLOCKER – ${t.Task_Title}${txt} | Owner: ${t.Owner || 'TBD'}`, t.Task_ID));
  }
  for (const t of d.decisions) {
    const txt = t.Decision_Required && !/^(true|yes|x|1)$/i.test(t.Decision_Required.trim()) ? `: ${trimDot(t.Decision_Required)}` : '';
    bullets.push(bullet(`DECISION – ${t.Task_Title}${txt} | Owner: ${t.Owner || 'TBD'}`, t.Task_ID));
  }
  return bullets.length ? { id: uid('s'), kind: 'blockers', title: 'BLOCKERS / DECISIONS REQUIRED', numbered: false, groups: [group('', bullets)] } : null;
}

export const standardTemplate: MinutesTemplate = {
  id: 'standard',
  label: 'Standard SAL minutes',
  description: 'Area-by-area updates, next steps and blockers/decisions. Only areas with relevant changes are listed.',
  build(d) {
    const sections: MinutesSection[] = [];
    if (d.storeChanges.length) {
      sections.push({ id: uid('s'), kind: 'store', title: 'OPENING UPDATES', numbered: false, groups: [group('', d.storeChanges.map((c) => bullet(storeChangeText(c))))] });
    }
    sections.push(...areaSections(d));
    if (!d.areas.length) {
      sections.push({ id: uid('s'), kind: 'custom', title: 'GENERAL', numbered: true, groups: [group('', [bullet('No relevant changes recorded since the previous SAL.')])] });
    }
    sections.push({
      id: uid('s'),
      kind: 'next',
      title: 'NEXT STEPS / OPEN POINTS',
      numbered: false,
      groups: [group('', d.nextSteps.length ? d.nextSteps.map(({ task, overdueDays }) => bullet(nextStepText(task, overdueDays), task.Task_ID)) : [bullet('No open actions due in the coming weeks.')])],
    });
    const b = blockerSection(d);
    if (b) sections.push(b);
    return { title: d.store.Store_Name.toUpperCase(), headerLines: header(d), sections, comments: '', templateId: 'standard' };
  },
};

export const executiveTemplate: MinutesTemplate = {
  id: 'executive',
  label: 'Executive summary',
  description: 'Short version for steering committees: key changes (top 3 per area), blockers and decisions only.',
  build(d) {
    const sections: MinutesSection[] = [];
    if (d.storeChanges.length) sections.push({ id: uid('s'), kind: 'store', title: 'OPENING UPDATES', numbered: false, groups: [group('', d.storeChanges.map((c) => bullet(storeChangeText(c))))] });
    const keyItems = d.areas.flatMap((a) => a.items.filter((i) => i.rank <= 6).slice(0, 3).map((i) => ({ a, i })));
    sections.push({
      id: uid('s'),
      kind: 'custom',
      title: 'KEY CHANGES',
      numbered: true,
      groups: [group('', keyItems.length ? keyItems.map(({ a, i }) => bullet(`${a.area.Area_Name} – ${sentenceFor(i)}`, i.task.Task_ID)) : [bullet('No material changes since the previous SAL.')])],
    });
    const b = blockerSection(d);
    if (b) sections.push(b);
    return { title: d.store.Store_Name.toUpperCase(), headerLines: header(d), sections, comments: '', templateId: 'executive' };
  },
};

export const MINUTES_TEMPLATES: MinutesTemplate[] = [standardTemplate, executiveTemplate];

export function getTemplate(id: string): MinutesTemplate {
  return MINUTES_TEMPLATES.find((t) => t.id === id) ?? standardTemplate;
}
