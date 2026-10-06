import { ApiError } from "@stockflow/core/api/client";
import { companiesApi } from "@stockflow/core/api/endpoints/companies";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { CapabilitiesSection, ContactSection, CountrySection, IdentitySection, RewardsSection, RulesSection, TaxSection } from "@/components/companyForm/CompanyFormSections";
import { useCompanyForm } from "@/components/companyForm/useCompanyForm";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";
import { toast } from "@/lib/toast";

type Tab = "business" | "tax" | "rewards" | "manage" | "rules";

export function CompanySettings() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const t = useT();

  const { data: company } = useQuery({ queryKey: ["company-settings", companyId], queryFn: () => companiesApi.get(companyId) });

  const [tab, setTab] = useState<Tab>("business");
  const f = useCompanyForm();
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (company) f.load(company);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  async function convert() {
    if (converting || !company) return;
    const ok = await confirmDialog({
      title: t("Convert currency"),
      message: `${company.currency} → ${f.currency}. ${t("Product prices, batch costs, customer credit, loyalty & gift-card balances will be recalculated at today's rate. Past sales and cash-register history are NOT changed. Needs an internet connection.")}`,
      confirmLabel: t("Convert"),
    });
    if (!ok) return;
    setConverting(true);
    try {
      const r = await companiesApi.convertCurrency(companyId, f.currency);
      await runSync();
      await queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      await queryClient.invalidateQueries();
      toast(`✓ ${r.fromCurrency}→${r.toCurrency} @ ${r.rate} · ${r.products} ${t("products")}, ${r.customers} ${t("customers")}, ${r.giftCards} ${t("gift cards")}`, "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Currency conversion failed."), "error");
    } finally {
      setConverting(false);
    }
  }

  async function save() {
    if (saving || !company) return;
    setSaving(true);
    try {
      await companiesApi.update(
        companyId,
        // Loyalty points are hidden but preserved as-is.
        f.toRequest({
          loyaltyEnabled: company.loyaltyEnabled,
          loyaltyEarnRateAmount: company.loyaltyEarnRateAmount,
          loyaltyPointValue: company.loyaltyPointValue,
          servicesModuleEnabled: company.servicesModuleEnabled,
          setupCompleted: company.setupCompleted,
        }),
      );
      await runSync();
      await queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      toast(t("Settings saved."), "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Could not save settings."), "error");
    } finally {
      setSaving(false);
    }
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "business", label: t("Business"), icon: "🏢" },
    { id: "tax", label: t("Tax & currency"), icon: "💱" },
    { id: "rewards", label: t("Loyalty & rewards"), icon: "🎁" },
    { id: "manage", label: t("What you manage"), icon: "📦" },
    { id: "rules", label: t("Data-entry rules"), icon: "📋" },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
              tab === x.id ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:bg-surface"
            }`}
          >
            {x.icon} {x.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        {tab === "business" ? (
          <>
            <div className="flex items-center justify-between rounded-xl bg-background px-4 py-3">
              <div>
                <span className="block text-sm text-text-secondary">{t("Invite code")}</span>
                <span className="text-[11px] text-text-secondary">{t("Share this so a teammate can join your company.")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-text-primary">{company?.uniqueCode ?? "…"}</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!company?.uniqueCode) return;
                    try {
                      await navigator.clipboard.writeText(company.uniqueCode);
                      toast(t("Invite code copied."), "success");
                    } catch {
                      toast(t("Could not copy. Copy it manually."), "error");
                    }
                  }}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-bold text-primary transition hover:border-primary"
                >
                  📋 {t("Copy")}
                </button>
              </div>
            </div>

            <IdentitySection f={f} />
            <ContactSection f={f} />
          </>
        ) : null}

        {tab === "tax" ? (
          <>
            <CountrySection f={f} />
            <TaxSection f={f} />
            {company && f.currency !== company.currency ? (
              <div className="rounded-lg bg-accent-amber/10 px-3 py-2.5 text-xs text-accent-amber">
                <p>⚠ {t("Changing the currency only relabels amounts. Existing prices and balances keep their numbers and are NOT converted to")} {f.currency}.</p>
                <button
                  type="button"
                  onClick={convert}
                  disabled={converting}
                  className="mt-1.5 rounded-lg bg-accent-amber/20 px-2.5 py-1 font-bold text-accent-amber transition hover:bg-accent-amber/30 disabled:opacity-50"
                >
                  {converting ? t("Converting…") : `🔄 ${t("Convert prices & balances at today's rate")}`}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "rewards" ? <RewardsSection f={f} /> : null}
        {tab === "manage" ? <CapabilitiesSection f={f} /> : null}
        {tab === "rules" ? <RulesSection f={f} /> : null}

        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={save} loading={saving} disabled={!f.name.trim()}>
            {t("Save settings")}
          </Button>
        </div>
      </div>
    </div>
  );
}
