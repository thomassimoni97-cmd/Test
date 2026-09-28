'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { sectionNumbers, uid, type MinutesBullet, type MinutesDoc, type MinutesGroup, type MinutesSection } from '@/lib/domain/minutes';
import { Button, Textarea, cn } from '@/components/ui/primitives';

function AutoText({ value, onChange, className, placeholder, onEnter }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; onEnter?: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      className={cn('w-full resize-none overflow-hidden rounded border border-transparent bg-transparent px-1.5 py-0.5 leading-relaxed text-ink hover:border-line focus:border-sand-500 focus:bg-paper focus:outline-none', className)}
    />
  );
}

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const IconBtn = ({ onClick, title, children, disabled }: { onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean }) => (
  <button type="button" onClick={onClick} title={title} aria-label={title} disabled={disabled} className="flex h-6 w-6 items-center justify-center rounded text-ink-4 hover:bg-wash hover:text-ink disabled:opacity-30">
    {children}
  </button>
);

/** Structured editor: sections → groups → bullets. Everything is editable, reorderable and deletable. */
export function MinutesEditor({ doc, onChange }: { doc: MinutesDoc; onChange: (d: MinutesDoc) => void }) {
  const nums = sectionNumbers(doc);
  const setSections = (sections: MinutesSection[]) => onChange({ ...doc, sections });
  const setSection = (i: number, s: MinutesSection) => setSections(doc.sections.map((x, k) => (k === i ? s : x)));
  const setGroup = (si: number, gi: number, g: MinutesGroup) => setSection(si, { ...doc.sections[si], groups: doc.sections[si].groups.map((x, k) => (k === gi ? g : x)) });
  const setBullets = (si: number, gi: number, bullets: MinutesBullet[]) => setGroup(si, gi, { ...doc.sections[si].groups[gi], bullets });

  const focusLater = (id: string) => setTimeout(() => (document.querySelector(`[data-bullet="${id}"] textarea`) as HTMLTextAreaElement | null)?.focus(), 20);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-paper p-4">
        <AutoText value={doc.title} onChange={(v) => onChange({ ...doc, title: v })} className="font-display text-2xl font-semibold uppercase tracking-wide" />
        <AutoText value={doc.headerLines.join('\n')} onChange={(v) => onChange({ ...doc, headerLines: v.split('\n') })} className="text-[13px] text-ink-2" />
      </div>

      {doc.sections.map((s, si) => (
        <div key={s.id} className="group/section rounded-lg border border-line bg-paper">
          <div className="flex items-center gap-2 border-b border-line bg-wash/60 px-3 py-1.5">
            <span className="tnum w-6 text-right text-[13px] font-semibold text-ink-3">{nums.has(s.id) ? `${nums.get(s.id)}.` : ''}</span>
            <input
              value={s.title}
              onChange={(e) => setSection(si, { ...s, title: e.target.value })}
              className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-[0.06em] hover:border-line focus:border-sand-500 focus:bg-paper focus:outline-none"
              aria-label="Section title"
            />
            <label className="flex items-center gap-1 text-2xs text-ink-3" title="Include in numbering">
              <input type="checkbox" className="accent-[#231D19]" checked={s.numbered} onChange={(e) => setSection(si, { ...s, numbered: e.target.checked })} /> numbered
            </label>
            <IconBtn title="Move section up" onClick={() => setSections(move(doc.sections, si, -1))} disabled={si === 0}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn title="Move section down" onClick={() => setSections(move(doc.sections, si, 1))} disabled={si === doc.sections.length - 1}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn title="Delete section" onClick={() => setSections(doc.sections.filter((_, k) => k !== si))}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
          </div>
          <div className="space-y-2 px-3 py-2">
            {s.groups.map((g, gi) => (
              <div key={g.id}>
                {(g.subtitle || (s.groups.length > 1 && gi > 0)) && (
                  <div className="flex items-center gap-1">
                    <input
                      value={g.subtitle}
                      placeholder="Sub-heading (optional)"
                      onChange={(e) => setGroup(si, gi, { ...g, subtitle: e.target.value })}
                      className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:border-line focus:border-sand-500 focus:outline-none"
                    />
                    <IconBtn title="Move group up" onClick={() => setSection(si, { ...s, groups: move(s.groups, gi, -1) })} disabled={gi === 0}><ArrowUp className="h-3 w-3" /></IconBtn>
                    <IconBtn title="Move group down" onClick={() => setSection(si, { ...s, groups: move(s.groups, gi, 1) })} disabled={gi === s.groups.length - 1}><ArrowDown className="h-3 w-3" /></IconBtn>
                    <IconBtn title="Delete group" onClick={() => setSection(si, { ...s, groups: s.groups.filter((_, k) => k !== gi) })}><Trash2 className="h-3 w-3" /></IconBtn>
                  </div>
                )}
                <ul className="space-y-0.5">
                  {g.bullets.map((b, bi) => (
                    <li key={b.id} data-bullet={b.id} className="group/bullet flex items-start gap-1">
                      <span className="mt-[5px] w-4 shrink-0 text-center text-ink-3">•</span>
                      <AutoText
                        value={b.text}
                        onChange={(v) => setBullets(si, gi, g.bullets.map((x) => (x.id === b.id ? { ...x, text: v } : x)))}
                        className="text-[13px]"
                        placeholder="Write the update…"
                        onEnter={() => {
                          const nb = { id: uid('b'), text: '' };
                          const list = [...g.bullets];
                          list.splice(bi + 1, 0, nb);
                          setBullets(si, gi, list);
                          focusLater(nb.id);
                        }}
                      />
                      <div className="flex shrink-0 opacity-0 transition-opacity group-hover/bullet:opacity-100 focus-within:opacity-100">
                        {b.taskId && <span className="mr-1 mt-1 font-mono text-[10px] text-ink-4">{b.taskId}</span>}
                        <IconBtn title="Move up" onClick={() => setBullets(si, gi, move(g.bullets, bi, -1))} disabled={bi === 0}><ArrowUp className="h-3 w-3" /></IconBtn>
                        <IconBtn title="Move down" onClick={() => setBullets(si, gi, move(g.bullets, bi, 1))} disabled={bi === g.bullets.length - 1}><ArrowDown className="h-3 w-3" /></IconBtn>
                        <IconBtn title="Delete bullet" onClick={() => setBullets(si, gi, g.bullets.filter((x) => x.id !== b.id))}><Trash2 className="h-3 w-3" /></IconBtn>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex gap-3 pl-5 pt-1 opacity-60 transition-opacity group-hover/section:opacity-100">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-2xs font-medium text-sand-700 hover:underline"
                onClick={() => {
                  const gi = Math.max(0, s.groups.length - 1);
                  const nb = { id: uid('b'), text: '' };
                  if (!s.groups.length) setSection(si, { ...s, groups: [{ id: uid('g'), subtitle: '', bullets: [nb] }] });
                  else setBullets(si, gi, [...s.groups[gi].bullets, nb]);
                  focusLater(nb.id);
                }}
              >
                <Plus className="h-3 w-3" /> Add bullet
              </button>
              <button type="button" className="inline-flex items-center gap-1 text-2xs font-medium text-ink-3 hover:underline" onClick={() => setSection(si, { ...s, groups: [...s.groups, { id: uid('g'), subtitle: 'New sub-heading', bullets: [{ id: uid('b'), text: '' }] }] })}>
                <Plus className="h-3 w-3" /> Add sub-heading
              </button>
            </div>
          </div>
        </div>
      ))}

      <Button
        size="sm"
        icon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => setSections([...doc.sections, { id: uid('s'), kind: 'custom', title: 'NEW SECTION', numbered: true, groups: [{ id: uid('g'), subtitle: '', bullets: [{ id: uid('b'), text: '' }] }] }])}
      >
        Add section
      </Button>

      <div className="rounded-lg border border-line bg-paper p-3">
        <div className="eyebrow mb-1.5">Comments</div>
        <Textarea rows={3} value={doc.comments} onChange={(e) => onChange({ ...doc, comments: e.target.value })} placeholder="Additional comments, attendees, next SAL date…" />
      </div>
    </div>
  );
}

/** Read-only rendering (history, print). */
export function MinutesView({ doc, className }: { doc: MinutesDoc; className?: string }) {
  const nums = sectionNumbers(doc);
  return (
    <article className={cn('text-[13px] leading-relaxed text-ink', className)}>
      <h2 className="font-display text-2xl font-semibold uppercase tracking-wide">{doc.title}</h2>
      <div className="mt-1 text-ink-2">
        {doc.headerLines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      {doc.sections.map((s) => {
        const has = s.groups.some((g) => g.bullets.some((b) => b.text.trim()));
        if (!has) return null;
        return (
          <section key={s.id} className="mt-4 break-inside-avoid">
            <h3 className="font-semibold uppercase tracking-[0.05em]">{nums.has(s.id) ? `${nums.get(s.id)}. ` : ''}{s.title}</h3>
            {s.groups.map((g) => (
              <div key={g.id} className="mt-1">
                {g.subtitle && <div className="mt-1.5 font-medium underline decoration-line-strong underline-offset-4">{g.subtitle}</div>}
                <ul className="ml-5 list-disc">
                  {g.bullets.filter((b) => b.text.trim()).map((b) => <li key={b.id}>{b.text}</li>)}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
      {doc.comments.trim() && (
        <section className="mt-4">
          <h3 className="font-semibold uppercase tracking-[0.05em]">Comments</h3>
          <p className="whitespace-pre-wrap">{doc.comments}</p>
        </section>
      )}
    </article>
  );
}
