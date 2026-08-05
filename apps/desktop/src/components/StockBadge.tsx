import type { StockStatus } from "@stockflow/core/api/enums";

import { useT } from "@/lib/i18n";

const MAP: Record<StockStatus, { label: string; cls: string }> = {
  in_stock: { label: "In stock", cls: "bg-success/15 text-success" },
  low_stock: { label: "Low stock", cls: "bg-accent-amber/15 text-accent-amber" },
  out_of_stock: { label: "Out of stock", cls: "bg-error/15 text-error" },
};

export function StockBadge({ status }: { status: StockStatus }) {
  const t = useT();
  const m = MAP[status];
  return <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-semibold ${m.cls}`}>{t(m.label)}</span>;
}
