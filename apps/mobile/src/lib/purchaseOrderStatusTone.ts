import type { Ionicons } from "@expo/vector-icons";

import { PurchaseOrderStatus } from "@stockflow/core/api/enums";
import type { ThemeColors } from "@/lib/theme/colors";

export interface StatusTone {
  icon: keyof typeof Ionicons.glyphMap;
  badgeClass: string;
  textClass: string;
  iconColor: string;
}

export function purchaseOrderStatusTone(status: PurchaseOrderStatus, colors: ThemeColors): StatusTone {
  switch (status) {
    case PurchaseOrderStatus.Pending:
      return { icon: "time-outline", badgeClass: "bg-accent-amber-soft", textClass: "text-accent-amber", iconColor: colors.accentAmber };
    case PurchaseOrderStatus.PartiallyReceived:
      return { icon: "sync-outline", badgeClass: "bg-primary/10", textClass: "text-primary", iconColor: colors.primary };
    case PurchaseOrderStatus.Received:
      return { icon: "checkmark-circle-outline", badgeClass: "bg-success/15", textClass: "text-success", iconColor: colors.success };
    default:
      return { icon: "close-circle-outline", badgeClass: "bg-border", textClass: "text-text-secondary", iconColor: colors.textSecondary };
  }
}
