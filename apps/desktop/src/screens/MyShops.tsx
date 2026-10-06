import { ApiError } from "@stockflow/core/api/client";
import { companiesApi } from "@stockflow/core/api/endpoints/companies";
import { membershipsApi } from "@stockflow/core/api/endpoints/memberships";
import { DevicePlatform, MembershipStatus, UserRole } from "@stockflow/core/api/enums";
import type { LocationResponse } from "@stockflow/core/api/types/auth";
import type { MyCompanyResponse } from "@stockflow/core/api/types/membership";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import {
  BusinessTypeSection,
  CapabilitiesSection,
  ContactSection,
  CountrySection,
  IdentitySection,
  RewardsSection,
  RulesSection,
  TaxSection,
} from "@/components/companyForm/CompanyFormSections";
import { useCompanyForm } from "@/components/companyForm/useCompanyForm";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { chooseLocation, logout, openShop } from "@/lib/session";
import { useAuthStore, useLanguageStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { deviceName } from "@/platform";

type Panel = "create" | "join";
type Step = 0 | 1 | 2;

/**
 * "My shops": after signing in, the person sees every business they belong to
 * (right) and can open one in a click, create a new one with a 3-step wizard, or
 * ask to join one with its code (left). Everything filled in the wizard is saved
 * on the business, so "My business" shows it afterwards.
 */
export function MyShops() {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const [panel, setPanel] = useState<Panel>("create");
  const [opening, setOpening] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ companyId: string; locations: LocationResponse[] } | null>(null);

  useEffect(() => {
    document.title = "StockFlow";
  }, []);

  const { data: shops, isLoading, refetch } = useQuery({
    queryKey: ["my-companies"],
    queryFn: () => membershipsApi.myCompanies(),
    // Picks up a join request being accepted without a manual refresh.
    refetchInterval: 30_000,
  });

  async function open(companyId: string, discardUnsynced = false) {
    if (opening) return;
    setOpening(companyId);
    try {
      const r = await openShop(companyId, { discardUnsynced });
      if (r.kind === "opened") navigate("/dashboard", { replace: true });
      else if (r.kind === "pickLocation") setBranches({ companyId, locations: r.locations });
      else {
        const ok = await confirmDialog({
          title: t("Unsent work on this device"),
          message: `${r.count} ${t("operation(s) from your previous shop have not reached the server yet (no internet?). Opening another shop erases them from this device. Reconnect and reopen the previous shop to send them, or erase them now.")}`,
          confirmLabel: t("Erase and open"),
          danger: true,
        });
        if (ok) {
          setOpening(null);
          await open(companyId, true);
          return;
        }
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Could not open this shop. Check your internet connection."), "error");
    } finally {
      setOpening(null);
    }
  }

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const firstName = (user?.name ?? "").split(" ")[0];

  return (
    <div className="relative min-h-screen p-4 sm:px-8 sm:py-5">
      <header className="mx-auto mb-4 flex max-w-6xl items-center gap-3">
        <BrandLogo size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-text-primary sm:text-2xl">
            {t("Hello")}, {firstName} 👋
          </h1>
          <p className="text-sm text-text-secondary">{t("Open a shop, create a new one, or join a team.")}</p>
        </div>
        <button
          onClick={() => setLanguage(language === "fr" ? "en" : "fr")}
          className="rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs font-bold text-text-secondary backdrop-blur transition hover:text-text-primary"
        >
          {language === "fr" ? "EN" : "FR"}
        </button>
        <Button variant="secondary" onClick={onLogout}>
          {t("Log out")}
        </Button>
      </header>

      <div className="mx-auto grid max-w-6xl items-start gap-6 lg:grid-cols-[3fr_1fr]">
        {/* Left: create / join (below the list on narrow screens, where your shops come first) */}
        <section className="card-in order-2 rounded-card lg:order-1 border border-white/50 bg-surface/85 p-5 shadow-2xl backdrop-blur-xl sm:p-5">
          <div className="mb-4 grid grid-cols-2 rounded-full border border-border bg-background p-1 text-sm font-semibold" role="tablist">
            {(["create", "join"] as const).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={panel === p}
                onClick={() => setPanel(p)}
                className={`rounded-full py-2 transition ${panel === p ? "bg-primary text-white shadow" : "text-text-secondary hover:text-text-primary"}`}
              >
                {p === "create" ? `➕ ${t("Create a shop")}` : `🔑 ${t("Join with a code")}`}
              </button>
            ))}
          </div>
          {panel === "create" ? <CreateShopWizard onCreated={(id) => void open(id)} /> : <JoinShop onJoined={() => void refetch()} onOpen={(id) => void open(id)} />}
        </section>

        {/* Right: my shops */}
        <section className="card-in order-1 rounded-card lg:order-2 border border-white/50 bg-surface/85 p-5 shadow-2xl backdrop-blur-xl sm:p-5">
          <h2 className="mb-4 text-base font-bold text-text-primary">
            {t("Your shops")} {shops ? `(${shops.length})` : ""}
          </h2>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-background" />
              ))}
            </div>
          ) : !shops || shops.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <div className="text-3xl">🏪</div>
              <p className="mt-2 text-sm text-text-secondary">{t("No shop yet. Create one, or join a team with the code your manager gives you.")}</p>
            </div>
          ) : (
            <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {shops.map((s) => (
                <ShopRow key={s.companyId} shop={s} busy={opening === s.companyId} onOpen={() => void open(s.companyId)} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {branches ? (
        <BranchPicker
          locations={branches.locations}
          onPick={(l) => {
            chooseLocation(branches.companyId, l);
            setBranches(null);
            navigate("/dashboard", { replace: true });
          }}
        />
      ) : null}
    </div>
  );
}

function ShopRow({ shop, busy, onOpen }: { shop: MyCompanyResponse; busy: boolean; onOpen: () => void }) {
  const t = useT();
  const usable = shop.status === MembershipStatus.Active && shop.companyActive;
  const badge =
    shop.status === MembershipStatus.Pending
      ? { text: t("Waiting for the manager's approval"), cls: "bg-accent-amber/15 text-accent-amber" }
      : shop.status === MembershipStatus.Disabled
        ? { text: t("Access disabled"), cls: "bg-error/10 text-error" }
        : !shop.companyActive
          ? { text: t("Shop deactivated"), cls: "bg-error/10 text-error" }
          : null;
  const meta = [
    shop.role === UserRole.CompanyAdmin ? t("Manager") : t("Cashier"),
    shop.currency,
    shop.locationCount > 1 ? `${shop.locationCount} ${t("branches")}` : null,
    shop.uniqueCode ? `${t("Code")} ${shop.uniqueCode}` : null,
  ].filter(Boolean);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        disabled={!usable || busy}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3 text-left transition hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:border-border disabled:hover:bg-surface"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/10 text-xl">
          {shop.logoUrl ? <img src={shop.logoUrl} alt="" className="h-full w-full object-cover" /> : "🏪"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-text-primary">{shop.name}</div>
          <div className="truncate text-xs text-text-secondary">{meta.join(" · ")}</div>
          {badge ? <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.text}</span> : null}
        </div>
        {shop.pendingRequests > 0 ? (
          <span className="shrink-0 rounded-full bg-accent-amber px-2 py-0.5 text-[11px] font-bold text-white" title={t("Join requests waiting")}>
            {shop.pendingRequests} {shop.pendingRequests === 1 ? t("request") : t("requests")}
          </span>
        ) : null}
        <span className="shrink-0 text-lg text-text-secondary">{busy ? "…" : usable ? "→" : ""}</span>
      </button>
    </li>
  );
}

/** Three steps (General → The shop → Equipment) over the "My business" fields,
 * with Next / Next / Create. The step pills are clickable too. */
function CreateShopWizard({ onCreated }: { onCreated: (companyId: string) => void }) {
  const t = useT();
  const f = useCompanyForm();
  const [step, setStep] = useState<Step>(0);
  const [preset, setPreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const STEPS: { label: string; icon: string }[] = [
    { label: t("General"), icon: "🏷️" },
    { label: t("The shop"), icon: "🏪" },
    { label: t("Equipment"), icon: "🧰" },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Enter on an earlier step only moves forward.
    if (step < 2) {
      setStep((s) => (s + 1) as Step);
      return;
    }
    if (!f.name.trim()) {
      setStep(0);
      setError(t("Give your shop a name."));
      return;
    }
    setSaving(true);
    try {
      const { deviceId } = useAuthStore.getState();
      const res = await companiesApi.createForAccount({
        name: f.name.trim(),
        description: f.description.trim() || null,
        currency: f.currency || "XAF",
        deviceId,
        deviceName,
        platform: DevicePlatform.Desktop,
        capabilities: f.capabilities,
        settings: f.toRequest({
          loyaltyEnabled: false,
          loyaltyEarnRateAmount: 0,
          loyaltyPointValue: 0,
          servicesModuleEnabled: false,
          // Configured here, so the post-creation setup wizard never shows.
          setupCompleted: true,
        }),
      });
      toast(`${t("Shop created")}: ${res.company.name}`, "success");
      onCreated(res.company.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not create the shop. Check your internet connection."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStep(i as Step)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
              step === i ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary hover:bg-background"
            }`}
          >
            <span aria-hidden>{s.icon}</span> {i + 1}. {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {step === 0 ? (
          <>
            <BusinessTypeSection f={f} selected={preset} onSelect={setPreset} />
            <IdentitySection f={f} nameLabel={t("Shop name")} />
            <CountrySection f={f} />
          </>
        ) : null}
        {step === 1 ? (
          <>
            <ContactSection f={f} />
            <TaxSection f={f} />
          </>
        ) : null}
        {step === 2 ? (
          <>
            <CapabilitiesSection f={f} />
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <RewardsSection f={f} />
              <div className="space-y-4">
                <RulesSection f={f} />
              </div>
            </div>
          </>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-error">{error}</p> : null}

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep((s) => (s - 1) as Step)}>
            ← {t("Back")}
          </Button>
        ) : null}
        <div className="flex-1" />
        {step < 2 ? (
          <Button type="submit">{t("Next")} →</Button>
        ) : (
          <Button type="submit" loading={saving} disabled={!f.name.trim()}>
            ✓ {t("Create the shop")}
          </Button>
        )}
      </div>
    </form>
  );
}

function JoinShop({ onJoined, onOpen }: { onJoined: () => void; onOpen: (companyId: string) => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(null);
    setLoading(true);
    try {
      const r = await membershipsApi.join(code.trim());
      if (r.status === MembershipStatus.Active) {
        onOpen(r.companyId);
        return;
      }
      setSent(r.companyName);
      setCode("");
      onJoined();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not send the request. Check your internet connection."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="text-sm text-text-secondary">
        {t("Ask the shop manager for the invite code (in My business). Your request is sent to them; you can open the shop as soon as they accept it.")}
      </p>
      <TextField
        label={t("Invite code")}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="PHRM-XXXXX"
        className="font-mono tracking-wider"
        autoFocus
      />
      {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
      {sent ? (
        <div className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">
          ✓ {t("Request sent to")} <b>{sent}</b>. {t("It appears in your shops as waiting until the manager accepts it.")}
        </div>
      ) : null}
      <Button type="submit" loading={loading} disabled={code.trim().length < 5}>
        {t("Send the request")}
      </Button>
    </form>
  );
}

export function BranchPicker({ locations, onPick, onClose }: { locations: LocationResponse[]; onPick: (l: LocationResponse) => void; onClose?: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-text-primary">{t("Which branch are you working at?")}</h3>
        <p className="mt-1 text-xs text-text-secondary">{t("Remembered on this device. You can change it later.")}</p>
        <ul className="mt-4 space-y-2">
          {locations.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => onPick(l)}
                className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition hover:border-primary hover:bg-primary/5"
              >
                <span className="text-lg">📍</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text-primary">{l.name}</span>
                  {l.address ? <span className="block truncate text-xs text-text-secondary">{l.address}</span> : null}
                </span>
                <span className="text-text-secondary">→</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
