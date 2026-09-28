// Rendering of an (edited) MinutesDoc into clean plain text and minimal HTML (Outlook / Teams / Word).

import type { MinutesDoc } from './types';

export function sectionNumbers(doc: MinutesDoc): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const s of doc.sections) if (s.numbered) map.set(s.id, ++n);
  return map;
}

export function renderText(doc: MinutesDoc): string {
  const nums = sectionNumbers(doc);
  const out: string[] = [doc.title, ...doc.headerLines, ''];
  for (const s of doc.sections) {
    const bullets = s.groups.reduce((n, g) => n + g.bullets.filter((b) => b.text.trim()).length, 0);
    if (!bullets && !s.title.trim()) continue;
    out.push(`${nums.has(s.id) ? `${nums.get(s.id)}. ` : ''}${s.title}`);
    const groups = s.groups.filter((g) => g.subtitle || g.bullets.some((b) => b.text.trim()));
    groups.forEach((g, i) => {
      if (g.subtitle) out.push(g.subtitle);
      for (const b of g.bullets) if (b.text.trim()) out.push(`• ${b.text.trim()}`);
      if (i < groups.length - 1) out.push('');
    });
    if (out[out.length - 1] !== '') out.push('');
  }
  if (doc.comments.trim()) out.push('COMMENTS', doc.comments.trim(), '');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Minimal inline-styled HTML — pastes cleanly in Outlook, Teams and Word. */
export function renderHtml(doc: MinutesDoc): string {
  const nums = sectionNumbers(doc);
  const font = 'font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1f1b18;';
  const parts: string[] = [`<div style="${font}">`];
  parts.push(`<p style="margin:0 0 4px 0;font-size:14pt;"><b>${esc(doc.title)}</b></p>`);
  parts.push(`<p style="margin:0 0 12px 0;">${doc.headerLines.map(esc).join('<br>')}</p>`);
  for (const s of doc.sections) {
    const hasBullets = s.groups.some((g) => g.bullets.some((b) => b.text.trim()));
    if (!hasBullets && !s.title.trim()) continue;
    parts.push(`<p style="margin:12px 0 4px 0;"><b>${nums.has(s.id) ? `${nums.get(s.id)}. ` : ''}${esc(s.title)}</b></p>`);
    for (const g of s.groups) {
      const list = g.bullets.filter((b) => b.text.trim());
      if (g.subtitle) parts.push(`<p style="margin:6px 0 2px 0;"><u>${esc(g.subtitle)}</u></p>`);
      if (list.length) parts.push(`<ul style="margin:0 0 4px 0;">${list.map((b) => `<li>${esc(b.text.trim())}</li>`).join('')}</ul>`);
    }
  }
  if (doc.comments.trim()) parts.push(`<p style="margin:12px 0 4px 0;"><b>COMMENTS</b></p><p style="margin:0;">${esc(doc.comments.trim()).replace(/\n/g, '<br>')}</p>`);
  parts.push('</div>');
  return parts.join('');
}
