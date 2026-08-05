import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Generic colored, print-ready tabular PDF — the React Native counterpart of
// desktop's printColoredReport (apps/desktop/src/lib/reportPdf.ts). Used for the
// OHADA tax documents (VAT declaration, journals, cash book, income statement).
// Uses the same expo-print/expo-sharing path as the app's other PDFs.

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export interface ReportColumn {
  header: string;
  align?: 'left' | 'right';
}

export interface ColoredReport {
  companyName: string;
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: string[][];
  totals?: (string | null)[];
  meta?: { label: string; value: string }[];
  contact?: string | null;
  taxId?: string | null;
}

function buildHtml(o: ColoredReport): string {
  const accent = '#4F46E5';
  const th = o.columns.map((c) => `<th style="text-align:${c.align ?? 'left'}">${esc(c.header)}</th>`).join('');
  const body = o.rows
    .map(
      (r, i) =>
        `<tr style="background:${i % 2 ? '#F5F8F7' : '#FFFFFF'}">` +
        r.map((cell, j) => `<td style="text-align:${o.columns[j]?.align ?? 'left'}">${esc(cell)}</td>`).join('') +
        '</tr>',
    )
    .join('');
  const foot = o.totals
    ? `<tfoot><tr>${o.totals.map((cell, j) => `<td style="text-align:${o.columns[j]?.align ?? 'left'}">${cell == null ? '' : esc(cell)}</td>`).join('')}</tr></tfoot>`
    : '';
  const meta = (o.meta ?? []).map((m) => `<span class="chip"><b>${esc(m.label)}:</b> ${esc(m.value)}</span>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1F2937;margin:0;padding:24px}
    .band{background:${accent};color:#fff;border-radius:12px;padding:16px 18px;margin-bottom:14px}
    .biz{font-size:12px;opacity:.85}.ttl{font-size:20px;font-weight:800;margin-top:2px}.sub{font-size:12px;opacity:.9;margin-top:3px}
    .meta{margin:0 2px 14px;display:flex;flex-wrap:wrap;gap:8px}
    .chip{background:#EEF0FE;color:#3730A3;border-radius:999px;padding:4px 10px;font-size:11px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead th{background:${accent};color:#fff;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
    td{padding:7px 10px;border-bottom:1px solid #E3E7E5}
    tfoot td{border-top:2px solid ${accent};font-weight:800;font-size:13px;padding-top:10px}
  </style></head><body>
    <div class="band"><div class="biz">${esc(o.companyName)}${o.contact ? ` · ${esc(o.contact)}` : ''}${o.taxId ? ` · NIU ${esc(o.taxId)}` : ''}</div><div class="ttl">${esc(o.title)}</div>${o.subtitle ? `<div class="sub">${esc(o.subtitle)}</div>` : ''}</div>
    ${meta ? `<div class="meta">${meta}</div>` : ''}
    <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody>${foot}</table>
  </body></html>`;
}

/** Render + share the report as a PDF (share sheet → save / send to accountant).
 * Falls back to the print preview if sharing isn't available. */
export async function shareColoredReport(o: ColoredReport): Promise<void> {
  const html = buildHtml(o);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: o.title });
  } else {
    await Print.printAsync({ html });
  }
}
