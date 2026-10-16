import { ApiError } from "@stockflow/core/api/client";
import { companiesApi } from "@stockflow/core/api/endpoints/companies";
import { starterKitDraft } from "@stockflow/core/setup/starterKit";
import { useState } from "react";

import { Button } from "@/components/Button";
import { EditableChips } from "@/components/companyForm/StarterKitSection";
import { BUSINESS_PRESETS } from "@/lib/businessTypes";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore, useLanguageStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";
import { toast } from "@/lib/toast";
import { useCompany } from "@/lib/useCompany";

/** "Suggested categories" for a shop that already exists: the business type's
 * starter categories not yet in the shop, editable, created in one click. */
export function SuggestedCategories({ existing }: { existing: string[] }) {
  const t = useT();
  const companyId = useAuthStore((s) => s.companyId)!;
  const language = useLanguageStore((s) => s.language);
  const company = useCompany().data;
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const have = new Set(existing.map((n) => n.trim().toLowerCase()));
  const suggestFor = (bt: string | null) => starterKitDraft(bt, language).categories.filter((n) => !have.has(n.toLowerCase()));

  function start() {
    const bt = company?.businessType ?? null;
    setType(bt);
    setNames(suggestFor(bt));
    setOpen(true);
  }

  async function create() {
    setSaving(true);
    try {
      const res = await companiesApi.applyStarterKit(companyId, type, { categories: names, services: [], defaultSupplierName: null, demoProducts: [] });
      await queryClient.invalidateQueries({ queryKey: ["categories", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      void runSync().catch(() => {});
      toast(`${t("Categories created")}: ${res.categories}`, "success");
      setOpen(false);
    } catch (e) {
      await confirmDialog({
        title: t("Could not add the categories"),
        message: e instanceof ApiError ? e.message : t("Check your internet connection."),
        cancelLabel: t("Close"),
      });
    } finally {
      setSaving(false);
    }
  }

  if (!open)
    return (
      <button type="button" onClick={start} className="mb-4 text-sm font-semibold text-primary hover:brightness-110">
        ✨ {t("Add suggested categories")}
      </button>
    );

  return (
    <div className="mb-4 space-y-3 rounded-card border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text-primary">✨ {t("Suggested categories")}</span>
        <select
          value={type ?? "general"}
          onChange={(e) => {
            setType(e.target.value);
            setNames(suggestFor(e.target.value));
          }}
          className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text-primary"
        >
          {BUSINESS_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.icon} {t(p.label)}</option>
          ))}
        </select>
      </div>
      {names.length === 0 ? <p className="text-xs text-text-secondary">{t("You already have all the suggested categories. Add your own below.")}</p> : null}
      <EditableChips values={names} onChange={setNames} placeholder={t("Add a category")} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
        <Button onClick={create} loading={saving} disabled={names.length === 0}>
          {t("Create")} ({names.length})
        </Button>
      </div>
    </div>
  );
}
