import { ApiError } from "@stockflow/core/api/client";
import { customersApi } from "@stockflow/core/api/endpoints/customers";
import { rewardsApi } from "@stockflow/core/api/endpoints/rewards";
import { PaymentMethod } from "@stockflow/core/api/enums";
import type { ProductSearchResult } from "@stockflow/core/api/types/catalog";
import { cartTotal, useCartStore } from "@stockflow/core/cart/store";
import { db } from "@stockflow/core/db/client";
import { giftCards } from "@stockflow/core/db/schema";
import { formatCurrency } from "@stockflow/core/format";
import { localCatalogQueryService } from "@stockflow/core/local/catalogQueryService";
import { localSalesService } from "@stockflow/core/local/salesService";
import { useQuery } from "@tanstack/react-query";
import { and, eq } from "drizzle-orm";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { SearchableSelect } from "@/components/SearchableSelect";
import { StockBadge } from "@/components/StockBadge";
import { TextField } from "@/components/TextField";
import { listProducts } from "@/data/products";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { usePrefsStore } from "@/lib/prefs";
import { printReceipt } from "@/lib/receipt";
import { printGiftCardVoucher } from "@/lib/giftCardVoucher";
import { runSync } from "@/lib/sync/runSync";
import { useScanGun } from "@/lib/useScanGun";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";
import { useCompany, useCurrency } from "@/lib/useCompany";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: PaymentMethod.Cash, label: "Cash" },
  { value: PaymentMethod.MobileMoney, label: "Mobile money" },
  { value: PaymentMethod.Credit, label: "Credit (pay later)" },
  { value: PaymentMethod.StoreCredit, label: "Store credit (prepaid)" },
  { value: PaymentMethod.GiftCard, label: "Gift card" },
];

export function Pos() {
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCurrency();
  const company = useCompany().data;
  const t = useT();

  const lines = useCartStore((s) => s.lines);
  const addLine = useCartStore((s) => s.addLine);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const clear = useCartStore((s) => s.clear);
  const customerId = useCartStore((s) => s.customerId);
  const setCustomer = useCartStore((s) => s.setCustomer);

  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.Cash);
  const [tendered, setTendered] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newCustomer, setNewCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [levelPick, setLevelPick] = useState<ProductSearchResult | null>(null);
  // Live gift-card lookup: null = idle, "notfound" = no such card, else its balance/status.
  const [giftCardInfo, setGiftCardInfo] = useState<{ remainingValue: number; active: boolean } | "notfound" | null>(null);

  const { data: results = [] } = useQuery({
    queryKey: ["pos-search", companyId, search],
    queryFn: () => localCatalogQueryService.searchProducts(companyId!, search),
    enabled: !!companyId && search.trim().length > 0,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", companyId],
    queryFn: () => customersApi.list(companyId!),
    enabled: !!companyId,
  });
  // Dependency guardrail: is there anything to sell at all? Only judge AFTER the
  // catalog query has actually resolved — `data` defaults to [] while loading,
  // which used to fire a bogus "no products" toast on every POS open.
  const { data: catalog = [], isSuccess: catalogLoaded } = useQuery({
    queryKey: ["products", companyId],
    queryFn: () => listProducts(companyId!),
    enabled: !!companyId,
  });
  const hasNoProducts = catalogLoaded && catalog.length === 0;
  const warnedNoProducts = useRef(false);
  useEffect(() => {
    if (hasNoProducts && !warnedNoProducts.current) {
      warnedNoProducts.current = true;
      toast(t("No products yet — add products (and receive stock) before selling."), "info");
    }
  }, [hasNoProducts, t]);

  const needsCustomer = method === PaymentMethod.Credit || method === PaymentMethod.StoreCredit;

  // Balances for the chosen customer (from the already-loaded list, so no extra fetch).
  const selectedCustomer = useMemo(() => customers.find((c) => c.id === customerId) ?? null, [customers, customerId]);

  // A business customer is billed VAT-on-top: total = net subtotal + VAT (at the
  // standard rate). An individual pays the VAT-inclusive subtotal as-is.
  const subtotal = cartTotal(lines);
  const taxRate = company?.defaultTaxRatePercent ?? 0;
  const taxAddedOnTop = !!selectedCustomer?.isBusiness && taxRate > 0;
  const vatAdded = taxAddedOnTop ? Math.round(subtotal * taxRate) / 100 : 0;
  const total = subtotal + vatAdded;
  const tenderedNum = Number.parseFloat(tendered) || 0;
  const change = method === PaymentMethod.Cash && tenderedNum > total ? tenderedNum - total : 0;
  const storeCreditAvailable = selectedCustomer?.loyaltyStoreCreditBalance ?? 0;
  const creditOwed = selectedCustomer?.creditBalance ?? 0;
  const storeCreditShort = method === PaymentMethod.StoreCredit && !!customerId && storeCreditAvailable < total;
  const giftCardBalance = giftCardInfo && giftCardInfo !== "notfound" ? giftCardInfo.remainingValue : null;
  const giftCardUsable = giftCardInfo && giftCardInfo !== "notfound" && giftCardInfo.active;
  const giftCardShort = method === PaymentMethod.GiftCard && !!giftCardUsable && giftCardBalance! < total;

  // Purchase-milestone reward: when a customer is picked and the program is on,
  // check (online) whether they're owed a reward gift card, so the cashier can
  // issue + print it and tell the customer to bring the code next time.
  const rewardQuery = useQuery({
    queryKey: ["reward-status", companyId, customerId],
    queryFn: () => rewardsApi.status(companyId!, customerId!),
    enabled: !!companyId && !!customerId && !!company?.rewardProgramEnabled,
    staleTime: 30_000,
    retry: false,
  });
  const reward = rewardQuery.data;
  const [issuingReward, setIssuingReward] = useState(false);

  async function issueReward() {
    if (!companyId || !customerId || issuingReward) return;
    setIssuingReward(true);
    try {
      const card = await rewardsApi.issue(companyId, customerId);
      printGiftCardVoucher({
        companyName: company?.name ?? "",
        code: card.code,
        value: card.remainingValue,
        currency,
        customerName: selectedCustomer?.name,
      });
      toast(`🎁 ${t("Reward issued")}: ${card.code} · ${formatCurrency(card.remainingValue, currency)}`, "success");
      await rewardQuery.refetch();
      await runSync().catch(() => {});
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Could not issue the reward."), "error");
    } finally {
      setIssuingReward(false);
    }
  }

  // Look the gift card up in the local mirror as the code is typed, so the
  // cashier sees the balance (and any problem) before charging — not after.
  useEffect(() => {
    if (method !== PaymentMethod.GiftCard || !companyId) {
      setGiftCardInfo(null);
      return;
    }
    const code = giftCardCode.trim().toUpperCase();
    if (code.length < 3) {
      setGiftCardInfo(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const row = await db.query.giftCards.findFirst({
          where: and(eq(giftCards.companyId, companyId), eq(giftCards.code, code)),
        });
        if (!cancelled) setGiftCardInfo(row ? { remainingValue: row.remainingValue, active: row.active } : "notfound");
      } catch {
        if (!cancelled) setGiftCardInfo(null);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [method, giftCardCode, companyId]);

  const todayIso = new Date().toISOString().slice(0, 10);

  function isExpired(p: ProductSearchResult): boolean {
    return p.earliestExpiry != null && p.earliestExpiry.slice(0, 10) < todayIso;
  }

  function addBase(p: ProductSearchResult) {
    addLine({
      key: `${p.productId}:base`,
      productId: p.productId,
      productName: p.name,
      packagingLevelId: null,
      packagingLevelName: null,
      unitPrice: p.salePrice,
    });
    setMsg(null);
  }

  function addLevel(p: ProductSearchResult, level: { id: string; unitName: string; unitPrice: number }) {
    addLine({
      key: `${p.productId}:${level.id}`,
      productId: p.productId,
      productName: p.name,
      packagingLevelId: level.id,
      packagingLevelName: level.unitName,
      unitPrice: level.unitPrice,
    });
    setLevelPick(null);
    setMsg(null);
  }

  function add(p: ProductSearchResult) {
    if (p.stockStatus === "out_of_stock") {
      toast(`${p.name} ${t("is out of stock — receive stock before selling it.")}`, "error");
      setSearch("");
      return;
    }
    // Expired stock stays sellable (the date may have been keyed wrong) — but warn.
    if (isExpired(p)) {
      toast(`⚠ ${p.name} — ${t("expired on")} ${p.earliestExpiry!.slice(0, 10)}. ${t("Sell with caution.")}`, "error");
    }
    setSearch("");
    // With packaging levels (Box/Blister/…), let the cashier pick the unit to
    // sell; otherwise add the base unit directly.
    if (p.packagingLevels.length > 0) {
      setLevelPick(p);
      return;
    }
    addBase(p);
  }

  // A scanned code (hardware scan-gun or camera): resolve to a product by exact
  // barcode and add it, exactly like tapping a search result.
  async function handleScan(code: string) {
    const q = code.trim();
    if (!q || !companyId) return;
    try {
      const matches = await localCatalogQueryService.searchProducts(companyId, q);
      const exact = matches.find((m) => m.barcode === q) ?? (matches.length === 1 ? matches[0] : null);
      if (!exact) {
        toast(`${t("No product matches code")} ${q}`, "error");
        return;
      }
      setSearch("");
      add(exact);
    } catch {
      toast(t("Could not look up that code."), "error");
    }
  }
  // Hardware USB/Bluetooth scanners type the code + Enter anywhere on screen.
  useScanGun(handleScan, { enabled: !levelPick && !newCustomer });

  async function checkout() {
    if (!lines.length || busy || !companyId || !locationId) return;
    // Dependency guardrails — tell the cashier exactly what's missing first.
    if (needsCustomer && !customerId) {
      toast("This payment method needs a customer. Select one first.", "error");
      return;
    }
    if (method === PaymentMethod.StoreCredit && storeCreditAvailable < total) {
      toast(t("Not enough store credit — this customer has only") + ` ${formatCurrency(storeCreditAvailable, currency)}.`, "error");
      return;
    }
    if (method === PaymentMethod.GiftCard) {
      if (!giftCardCode.trim()) {
        toast(t("Enter the gift card code to redeem."), "error");
        return;
      }
      if (giftCardInfo === "notfound") {
        toast(t("No gift card matches that code."), "error");
        return;
      }
      if (giftCardInfo && !giftCardInfo.active) {
        toast(t("This gift card is disabled."), "error");
        return;
      }
      if (giftCardInfo && giftCardInfo.remainingValue < total) {
        toast(t("Not enough balance on this gift card — only") + ` ${formatCurrency(giftCardInfo.remainingValue, currency)}.`, "error");
        return;
      }
    }
    setBusy(true);
    setMsg(null);
    try {
      const sale = await localSalesService.createSale(companyId, {
        locationId,
        customerId: customerId ?? null,
        paymentMethod: method,
        productLines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, packagingLevelId: l.packagingLevelId })),
        serviceLines: null,
        paymentSplits: null,
        amountTendered: method === PaymentMethod.Cash && tenderedNum > 0 ? tenderedNum : null,
        giftCardCode: method === PaymentMethod.GiftCard ? giftCardCode.trim() : null,
        taxAddedOnTop,
      });
      const changeTxt = sale.changeDue ? ` · change ${formatCurrency(sale.changeDue, currency)}` : "";
      setMsg({ ok: true, text: `Sale complete · ${formatCurrency(sale.total, currency)}${changeTxt}` });
      setLastSaleId(sale.id);
      // Auto-print the receipt if the printer preference is on (Management → Printer).
      if (usePrefsStore.getState().autoPrintReceipt && company) {
        try {
          const detail = await localSalesService.getSaleDetail(companyId, sale.id);
          printReceipt(detail, company);
        } catch {
          /* non-fatal — the manual print button stays available */
        }
      }
      clear();
      setTendered("");
      setGiftCardCode("");
      // Push the sale to the server (then pull) so Sales History — which reads
      // the API, not the local mirror — shows it right away.
      await runSync().catch(() => queryClient.invalidateQueries());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Checkout failed." });
    } finally {
      setBusy(false);
    }
  }

  async function printLastReceipt() {
    if (!lastSaleId || !companyId || !company) return;
    try {
      const detail = await localSalesService.getSaleDetail(companyId, lastSaleId);
      printReceipt(detail, company);
    } catch {
      toast("Could not open the receipt.", "error");
    }
  }

  async function createCustomer() {
    if (!newCustomer || savingCustomer || !companyId) return;
    if (!newCustomer.name.trim()) {
      toast("Enter the customer's name.", "error");
      return;
    }
    setSavingCustomer(true);
    try {
      const created = await customersApi.create(companyId, { name: newCustomer.name.trim(), phone: newCustomer.phone.trim() || null });
      await queryClient.invalidateQueries({ queryKey: ["customers", companyId] });
      setCustomer({ id: created.id, name: created.name });
      setNewCustomer(null);
      toast(`${created.name} added and selected.`, "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not create the customer.", "error");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function hold() {
    if (!lines.length || busy || !companyId || !locationId) return;
    setBusy(true);
    setMsg(null);
    try {
      await localSalesService.holdSale(companyId, {
        locationId,
        customerId: customerId ?? null,
        productLines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, packagingLevelId: l.packagingLevelId })),
      });
      clear();
      setTendered("");
      setGiftCardCode("");
      toast("Sale held — resume it from Held sales.", "success");
      await queryClient.invalidateQueries();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not hold the sale." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem-3rem)] gap-4">
      {/* Left: search + cart */}
      <div className="flex min-w-0 flex-1 flex-col">
        {hasNoProducts ? (
          <div className="mb-2 flex items-center justify-between rounded-xl border border-accent-amber/40 bg-accent-amber/10 px-4 py-2.5 text-sm text-text-primary">
            <span>{t("No products to sell yet.")}</span>
            <button onClick={() => navigate("/products/new")} className="font-semibold text-primary">
              {t("+ Add a product first")}
            </button>
          </div>
        ) : null}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) add(results[0]);
          }}
          placeholder={t("Scan a barcode or search products…")}
          autoFocus
          className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
        />

        {search.trim() && results.length > 0 ? (
          <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-border bg-surface">
            {results.map((p) => (
              <button
                key={p.productId}
                onClick={() => add(p)}
                className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5 text-left last:border-0 hover:bg-background"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-text-primary">{p.name}</span>
                  {p.packagingLevels.length > 0 ? (
                    <span
                      title={p.packagingLevels.map((l) => l.unitName).join(", ")}
                      className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                    >
                      📦 {p.packagingLevels.map((l) => l.unitName).join("/")}
                    </span>
                  ) : null}
                  {isExpired(p) ? (
                    <span className="shrink-0 rounded-md bg-error/15 px-1.5 py-0.5 text-[10px] font-bold text-error">⚠ {t("Expired")}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StockBadge status={p.stockStatus as never} />
                  <span className="text-sm text-text-primary">{formatCurrency(p.salePrice, currency)}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex-1 overflow-auto rounded-card border border-border bg-surface">
          {lines.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-text-secondary">
              {t("Cart is empty — search or scan to add products.")}
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">
                        {l.productName}
                        {l.packagingLevelName ? (
                          <span className="ml-1.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">📦 {l.packagingLevelName}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-text-secondary">{formatCurrency(l.unitPrice, currency)} {t("each")}</div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => updateQuantity(l.key, l.quantity - 1)}
                          className="h-7 w-7 rounded-lg border border-border text-text-primary hover:bg-background"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-semibold text-text-primary">{l.quantity}</span>
                        <button
                          onClick={() => updateQuantity(l.key, l.quantity + 1)}
                          className="h-7 w-7 rounded-lg border border-border text-text-primary hover:bg-background"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-text-primary">
                      {formatCurrency(l.unitPrice * l.quantity, currency)}
                    </td>
                    <td className="px-2 py-3">
                      <button onClick={() => removeLine(l.key)} className="text-text-secondary hover:text-error" title="Remove">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: checkout */}
      <div className="flex w-[340px] shrink-0 flex-col overflow-y-auto rounded-card border border-border bg-surface p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Total")}</div>
        <div className="mt-1 text-3xl font-extrabold text-text-primary">{formatCurrency(total, currency)}</div>
        {taxAddedOnTop ? (
          <div className="mt-1 rounded-lg bg-accent-blue/10 px-2 py-1 text-xs text-accent-blue">
            🏢 {t("Pro")} · {t("Net")} {formatCurrency(subtotal, currency)} + {t("VAT")} {formatCurrency(vatAdded, currency)}
          </div>
        ) : null}

        {/* Customer — required for credit/store-credit, optional otherwise (loyalty). */}
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t("Customer")}{needsCustomer ? <span className="text-error"> *</span> : <span className="normal-case text-text-secondary"> {t("(optional)")}</span>}
          </label>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SearchableSelect
                value={customerId ?? ""}
                invalid={needsCustomer && !customerId}
                placeholder={t("Walk-in customer")}
                onChange={(v) => {
                  const c = customers.find((x) => x.id === v);
                  setCustomer(c ? { id: c.id, name: c.name } : null);
                }}
                options={[
                  { value: "", label: t("Walk-in customer") },
                  ...customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.phone ?? undefined })),
                ]}
              />
            </div>
            <IconButton icon="➕" label={t("New customer")} tone="primary" onClick={() => setNewCustomer({ name: "", phone: "" })} className="border border-border" />
          </div>
          {selectedCustomer ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 font-semibold text-primary">
                💳 {t("Store credit")}: {formatCurrency(storeCreditAvailable, currency)}
              </span>
              {creditOwed > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-accent-amber/15 px-2 py-1 font-semibold text-accent-amber">
                  🧾 {t("Owes")}: {formatCurrency(creditOwed, currency)}
                </span>
              ) : null}
              {selectedCustomer.rewardsGranted > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-accent-purple/15 px-2 py-1 font-semibold text-accent-purple">
                  🎁 {selectedCustomer.rewardsGranted} {t("rewards earned")}
                </span>
              ) : null}
            </div>
          ) : null}

          {selectedCustomer && reward?.enabled && reward.rewardsDue > 0 ? (
            <div className="mt-2 rounded-xl border border-primary/40 bg-primary/10 p-3">
              <div className="text-sm font-bold text-primary">🎁 {t("Reward available!")}</div>
              <div className="mt-0.5 text-xs text-text-secondary">
                {t("This customer has earned a gift card worth")} <span className="font-semibold text-text-primary">{formatCurrency(reward.rewardValue, currency)}</span>
                {reward.rewardsDue > 1 ? ` (×${reward.rewardsDue})` : ""}. {t("Issue it and hand them the printed code.")}
              </div>
              <button
                onClick={issueReward}
                disabled={issuingReward}
                className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {issuingReward ? t("Issuing…") : `🎁 ${t("Issue & print gift card")}`}
              </button>
            </div>
          ) : selectedCustomer && reward?.enabled && reward.purchasesUntilNext > 0 ? (
            <div className="mt-2 text-xs text-text-secondary">
              ⭐ {reward.purchasesUntilNext} {t("more purchase(s) until this customer earns a reward gift card.")}
            </div>
          ) : null}
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Payment")}</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                method === m.value ? "border-primary bg-primary/10 text-primary" : "border-border text-text-primary hover:bg-background"
              }`}
            >
              {t(m.label)}
            </button>
          ))}
        </div>

        {method === PaymentMethod.Cash ? (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {t("Amount tendered (optional)")}
            </label>
            <input
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-text-primary outline-none focus:border-primary"
            />
            {change > 0 ? (
              <div className="mt-2 text-sm text-text-secondary">
                {t("Change due:")} <span className="font-bold text-text-primary">{formatCurrency(change, currency)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {method === PaymentMethod.StoreCredit && customerId ? (
          <div
            className={`mt-4 rounded-xl border px-3 py-2.5 text-sm ${
              storeCreditShort ? "border-error/40 bg-error/10 text-error" : "border-success/40 bg-success/10 text-success"
            }`}
          >
            <div className="font-semibold">
              {t("Store credit available")}: {formatCurrency(storeCreditAvailable, currency)}
            </div>
            <div className="mt-0.5 text-xs">
              {storeCreditShort
                ? t("Not enough to cover this sale. Take a smaller amount or use another method.")
                : t("This customer's balance covers the sale — it will be deducted on charge.")}
            </div>
          </div>
        ) : null}

        {method === PaymentMethod.GiftCard ? (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Gift card code")}</label>
            <input
              value={giftCardCode}
              onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
              placeholder="e.g. GC-ABC12345"
              className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-text-primary outline-none focus:border-primary"
            />
            <p className="mt-1.5 text-[11px] text-text-secondary">
              {t("Gift cards are not tied to a customer — anyone holding a valid code can redeem it.")}
            </p>
            {giftCardInfo === "notfound" ? (
              <p className="mt-1.5 text-xs font-medium text-error">{t("No gift card matches that code.")}</p>
            ) : giftCardInfo && !giftCardInfo.active ? (
              <p className="mt-1.5 text-xs font-medium text-error">{t("This gift card is disabled.")}</p>
            ) : giftCardInfo ? (
              <p className={`mt-1.5 text-xs font-semibold ${giftCardShort ? "text-error" : "text-success"}`}>
                {t("Balance")}: {formatCurrency(giftCardInfo.remainingValue, currency)}
                {giftCardShort ? ` — ${t("not enough for this sale.")}` : ""}
              </p>
            ) : null}
          </div>
        ) : null}

        {needsCustomer && !customerId ? (
          <p className="mt-2 text-xs font-medium text-error">{t("Select a customer for this payment method.")}</p>
        ) : null}

        <div className="min-h-4 flex-1" />

        {msg ? (
          <div className={`mb-3 rounded-xl px-3 py-2 text-sm font-medium ${msg.ok ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}>
            <div>{msg.text}</div>
            {msg.ok && lastSaleId ? (
              <button onClick={printLastReceipt} className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-surface px-2.5 py-1 text-xs font-bold text-primary shadow-sm hover:brightness-105">
                🖨 {t("Print / save receipt")}
              </button>
            ) : null}
          </div>
        ) : null}

        <Button onClick={checkout} loading={busy} disabled={lines.length === 0 || storeCreditShort || giftCardShort}>
          {t("Charge")} {formatCurrency(total, currency)}
        </Button>
        {lines.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={hold}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2 text-sm font-semibold text-text-primary transition hover:border-primary hover:text-primary disabled:opacity-40"
            >
              ⏸ {t("Hold sale")}
            </button>
            <button
              onClick={clear}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2 text-sm font-semibold text-text-secondary transition hover:border-error hover:text-error"
            >
              🗑 {t("Clear cart")}
            </button>
          </div>
        ) : null}
      </div>

      {levelPick ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setLevelPick(null)}>
          <div className="card-in w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Sell as")}</div>
            <div className="mb-4 text-lg font-bold text-text-primary">{levelPick.name}</div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  addBase(levelPick);
                  setLevelPick(null);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left transition hover:border-primary hover:bg-primary/5"
              >
                <span className="text-sm font-semibold text-text-primary">{t("Unit")}</span>
                <span className="text-sm font-bold text-text-primary">{formatCurrency(levelPick.salePrice, currency)}</span>
              </button>
              {levelPick.packagingLevels.map((lvl) => (
                <button
                  key={lvl.id}
                  onClick={() => addLevel(levelPick, lvl)}
                  className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left transition hover:border-primary hover:bg-primary/5"
                >
                  <span className="text-sm font-semibold text-text-primary">
                    📦 {lvl.unitName} <span className="font-normal text-text-secondary">· {lvl.quantityInBaseUnits} {t("units")}</span>
                  </span>
                  <span className="text-sm font-bold text-text-primary">{formatCurrency(lvl.unitPrice, currency)}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="ghost" onClick={() => setLevelPick(null)}>{t("Cancel")}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {newCustomer ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setNewCustomer(null)}>
          <div className="card-in w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-lg font-bold text-text-primary">{t("New customer")}</div>
            <div className="space-y-3">
              <TextField label={t("Name")} value={newCustomer.name} autoFocus onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              <TextField label={t("Phone (optional)")} value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setNewCustomer(null)}>{t("Cancel")}</Button>
              <Button onClick={createCustomer} loading={savingCustomer} disabled={!newCustomer.name.trim()}>{t("Add & select")}</Button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
