'use client';

export type ExportRow = Record<string, string | number>;

import { isArtifact } from './env';
import { toast } from './toasts';

async function download(blob: Blob, filename: string) {
  if (isArtifact()) {
    // the artifact frame blocks page-initiated downloads: hand the file to the viewer through the runtime
    const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<{ save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null> } }).claude;
    const downloads = claude?.use ? await claude.use('downloads') : null;
    if (!downloads) return toast.error('Export not available in this view', 'Open the artifact in Claude to download files.');
    try {
      await downloads.save({ filename, data: blob });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'declined') toast.error('Export failed', (e as Error).message ?? String(code));
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: string | number) => {
  const s = String(v ?? '');
  // neutralise spreadsheet formula injection
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportCsv(rows: ExportRow[], columns: string[], filename: string) {
  const lines = [columns.map(csvCell).join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c] ?? '')).join(','))];
  await download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

export async function exportXlsx(rows: ExportRow[], columns: string[], filename: string, sheetName = 'Action Log') {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Golden Goose — Retail Opening Control Center';
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c, key: c, width: Math.min(60, Math.max(10, c.length + 4, ...rows.slice(0, 200).map((r) => String(r[c] ?? '').length * 0.9))) }));
  rows.forEach((r) => ws.addRow(r));
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EADC' } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  const buf = await wb.xlsx.writeBuffer();
  await download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
