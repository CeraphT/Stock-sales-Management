import { ApiError } from "@stockflow/core/api/client";
import { servicesApi } from "@stockflow/core/api/endpoints/services";
import { formatCurrency } from "@stockflow/core/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { TextField } from "@/components/TextField";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useCurrency } from "@/lib/useCompany";

export function Services() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const currency = useCurrency();
  const t = useT();
  const [adding, setAdding] = useState<{ name: string; price: string; category: string } | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ["services", companyId], queryFn: () => servicesApi.list(companyId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["services", companyId] });
  const onError = (e: unknown) => toast(e instanceof ApiError ? e.message : "Something went wrong.", "error");

  const createM = useMutation({
    mutationFn: (v: { name: string; price: string; category: string }) =>
      servicesApi.create(companyId, { name: v.name.trim(), fixedPrice: Number(v.price) || 0, category: v.category.trim() || null, stockLinks: null }),
    onSuccess: () => { setAdding(null); invalidate(); },
    onError,
  });
  const toggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => servicesApi.setActive(companyId, v.id, { active: v.active }),
    onSuccess: () => invalidate(),
    onError,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-text-secondary">{data.length} {t("services")}</span>
        {!adding ? <Button onClick={() => setAdding({ name: "", price: "", category: "" })}>{t("+ New service")}</Button> : null}
      </div>

      {adding ? (
        <div className="mb-4 space-y-3 rounded-card border border-border bg-surface p-5">
          <div className="text-sm font-bold text-text-primary">{t("New service")}</div>
          <TextField label={t("Name")} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label={t("Fixed price")} type="number" value={adding.price} onChange={(e) => setAdding({ ...adding, price: e.target.value })} />
            <TextField label={t("Category (optional)")} value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(null)}>{t("Cancel")}</Button>
            <Button onClick={() => createM.mutate(adding)} loading={createM.isPending} disabled={!adding.name.trim()}>{t("Save")}</Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {isLoading ? (
          <div className="p-10 text-center text-text-secondary">{t("Loading…")}</div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-text-secondary">{t("No services. (Requires the Services module — enable it in Company settings.)")}</div>
        ) : (
          data.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
              <div className="flex-1">
                <div className="font-medium text-text-primary">{s.name}</div>
                <div className="text-xs text-text-secondary">{[s.category, formatCurrency(s.fixedPrice, currency)].filter(Boolean).join(" · ")}</div>
              </div>
              <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${s.active ? "bg-success/15 text-success" : "bg-text-secondary/15 text-text-secondary"}`}>
                {s.active ? t("Active") : t("Inactive")}
              </span>
              <IconButton
                icon={s.active ? "🚫" : "✅"}
                label={s.active ? t("Deactivate") : t("Activate")}
                tone={s.active ? "danger" : "success"}
                onClick={() => toggleM.mutate({ id: s.id, active: !s.active })}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
