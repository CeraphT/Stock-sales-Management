import { PurchaseOrderStatus } from "@stockflow/core/api/enums";

import { useT } from "@/lib/i18n";

const TONE: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.Pending]: "bg-accent-amber/15 text-accent-amber",
  [PurchaseOrderStatus.PartiallyReceived]: "bg-accent-blue/15 text-accent-blue",
  [PurchaseOrderStatus.Received]: "bg-success/15 text-success",
  [PurchaseOrderStatus.Cancelled]: "bg-text-secondary/15 text-text-secondary",
};

export function PoStatusBadge({ status, label }: { status: PurchaseOrderStatus; label: string }) {
  const t = useT();
  return <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-semibold ${TONE[status]}`}>{t(label)}</span>;
}
