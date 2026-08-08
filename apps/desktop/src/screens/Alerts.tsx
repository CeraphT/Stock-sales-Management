import { productsApi } from "@stockflow/core/api/endpoints/products";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";

export function Alerts() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const navigate = useNavigate();
  const t = useT();

  const { data, isLoading } = useQuery({
    queryKey: ["alerts", companyId],
    queryFn: () => productsApi.alerts(companyId, 30),
    enabled: !!companyId,
  });

  const total =
    (data?.outOfStock.length ?? 0) + (data?.lowStock.length ?? 0) + (data?.expiringSoon.length ?? 0) + (data?.expired.length ?? 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-text-primary">🔔 {t("Alerts")}</h2>
        <span className="w-12" />
      </div>

      {isLoading ? (
        <div className="rounded-card border border-border bg-surface p-10 text-center text-text-secondary">{t("Loading…")}</div>
      ) : total === 0 ? (
        <div className="rounded-card border border-border bg-surface p-10 text-center text-text-secondary">
          ✅ {t("Nothing needs attention right now.")}
        </div>
      ) : (
        <div className="space-y-5">
          <Section title={`⛔ ${t("Out of stock")}`} count={data!.outOfStock.length}>
            {data!.outOfStock.map((p) => (
              <Row key={p.productId} onClick={() => navigate(`/products/${p.productId}/receive`)}
                left={p.name} right={t("Receive")} tone="error" />
            ))}
          </Section>

          <Section title={`⚠️ ${t("Low stock")}`} count={data!.lowStock.length}>
            {data!.lowStock.map((p) => (
              <Row key={p.productId} onClick={() => navigate(`/products/${p.productId}/receive`)}
                left={p.name} sub={`${p.currentStock} / ${p.lowStockThreshold}`} right={t("Receive")} tone="warn" />
            ))}
          </Section>

          <Section title={`⏰ ${t("Expired")}`} count={data!.expired.length}>
            {data!.expired.map((b) => (
              <Row key={b.batchId} onClick={() => navigate(`/products/${b.productId}/inventory`)}
                left={b.name} sub={`${t("batch")} ${b.batchNumber} · ${t("exp")} ${b.expiryDate.slice(0, 10)} · ${b.quantityInBaseUnits} ${t("units")}`}
                right={`${-b.daysUntilExpiry}${t("d ago")}`} tone="error" />
            ))}
          </Section>

          <Section title={`⏳ ${t("Expiring soon")}`} count={data!.expiringSoon.length}>
            {data!.expiringSoon.map((b) => (
              <Row key={b.batchId} onClick={() => navigate(`/products/${b.productId}/inventory`)}
                left={b.name} sub={`${t("batch")} ${b.batchNumber} · ${b.quantityInBaseUnits} ${t("units")}`}
                right={`${b.daysUntilExpiry}${t("d")}`} tone="warn" />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <div className="mb-2 text-sm font-bold text-text-primary">{title} <span className="text-text-secondary">({count})</span></div>
      <div className="overflow-hidden rounded-card border border-border bg-surface">{children}</div>
    </div>
  );
}

function Row({ left, sub, right, tone, onClick }: { left: string; sub?: string; right: string; tone: "error" | "warn"; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-left last:border-0 hover:bg-background">
      <div>
        <div className="text-sm font-medium text-text-primary">{left}</div>
        {sub ? <div className="text-xs text-text-secondary">{sub}</div> : null}
      </div>
      <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${tone === "error" ? "bg-error/10 text-error" : "bg-accent-amber/15 text-accent-amber"}`}>{right}</span>
    </button>
  );
}
