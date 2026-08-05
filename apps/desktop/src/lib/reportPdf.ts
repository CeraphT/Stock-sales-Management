function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export interface ReportColumn {
  header: string;
  align?: "left" | "right";
}

/**
 * Renders a colored, print-ready PDF of a tabular report through a hidden
 * iframe + the OS print dialog (which doubles as "Save as PDF" for sharing).
 * The palette matches the app (indigo primary). Used for the filtered-sales
 * export and the purchase-order document — anything that's "header + table +
 * optional totals".
 */
export function printColoredReport(opts: {
  companyName: string;
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: string[][];
  totals?: (string | null)[];
  accent?: string;
  meta?: { label: string; value: string }[];
  logoUrl?: string | null;
  contact?: string | null;
  taxId?: string | null;
}): void {
  const accent = opts.accent ?? "#4F46E5";
  const th = opts.columns
    .map((c) => `<th style="text-align:${c.align ?? "left"}">${esc(c.header)}</th>`)
    .join("");
  const body = opts.rows
    .map(
      (r, i) =>
        `<tr style="background:${i % 2 ? "#F5F8F7" : "#FFFFFF"}">` +
        r.map((cell, j) => `<td style="text-align:${opts.columns[j]?.align ?? "left"}">${esc(cell)}</td>`).join("") +
        `</tr>`,
    )
    .join("");
  const foot = opts.totals
    ? `<tfoot><tr>${opts.totals
        .map((cell, j) => `<td style="text-align:${opts.columns[j]?.align ?? "left"}">${cell == null ? "" : esc(cell)}</td>`)
        .join("")}</tr></tfoot>`
    : "";
  const meta = (opts.meta ?? [])
    .map((m) => `<span class="chip"><b>${esc(m.label)}:</b> ${esc(m.value)}</span>`)
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>
    :root{--accent:${accent}}
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1F2937;margin:0;padding:28px}
    .band{background:var(--accent);color:#fff;border-radius:12px;padding:16px 18px;margin-bottom:14px;display:flex;gap:14px;align-items:center}
    .band img{height:46px;width:46px;border-radius:10px;object-fit:cover;background:#fff}
    .band .biz{font-size:12px;opacity:.85}
    .band .ttl{font-size:20px;font-weight:800;margin-top:2px}
    .band .sub{font-size:12px;opacity:.9;margin-top:3px}
    .meta{margin:0 2px 14px;display:flex;flex-wrap:wrap;gap:8px}
    .chip{background:#EEF0FE;color:#3730A3;border-radius:999px;padding:4px 10px;font-size:11px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead th{background:var(--accent);color:#fff;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
    td{padding:7px 10px;border-bottom:1px solid #E3E7E5}
    tfoot td{border-top:2px solid var(--accent);font-weight:800;font-size:13px;padding-top:10px}
    @media print{body{padding:0}.band{border-radius:0}}
  </style></head><body>
    <div class="band">${opts.logoUrl ? `<img src="${opts.logoUrl}" alt=""/>` : ""}<div><div class="biz">${esc(opts.companyName)}${
      opts.contact ? ` · ${esc(opts.contact)}` : ""
    }${opts.taxId ? ` · NIU ${esc(opts.taxId)}` : ""}</div><div class="ttl">${esc(opts.title)}</div>${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ""}</div></div>
    ${meta ? `<div class="meta">${meta}</div>` : ""}
    <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody>${foot}</table>
  </body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow!.focus();
  window.setTimeout(() => {
    iframe.contentWindow!.print();
    window.setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 250);
}
