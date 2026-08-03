import { ApiError } from "@stockflow/core/api/client";
import { PaymentMethod } from "@stockflow/core/api/enums";
import type { ProductSearchResult } from "@stockflow/core/api/types/catalog";
import { cartTotal, useCartStore } from "@stockflow/core/cart/store";
import { formatCurrency } from "@stockflow/core/format";
import { localCatalogQueryService } from "@stockflow/core/local/catalogQueryService";
import { localSalesService } from "@stockflow/core/local/salesService";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { StockBadge } from "@/components/StockBadge";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { useCurrency } from "@/lib/useCompany";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: PaymentMethod.Cash, label: "Cash" },
  { value: PaymentMethod.MobileMoney, label: "Mobile money" },
];

export function Pos() {
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const currency = useCurrency();

  const lines = useCartStore((s) => s.lines);
  const addLine = useCartStore((s) => s.addLine);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const clear = useCartStore((s) => s.clear);

  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.Cash);
  const [tendered, setTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data: results = [] } = useQuery({
    queryKey: ["pos-search", companyId, search],
    queryFn: () => localCatalogQueryService.searchProducts(companyId!, search),
    enabled: !!companyId && search.trim().length > 0,
  });

  const total = cartTotal(lines);
  const tenderedNum = Number.parseFloat(tendered) || 0;
  const change = method === PaymentMethod.Cash && tenderedNum > total ? tenderedNum - total : 0;

  function add(p: ProductSearchResult) {
    addLine({
      key: `${p.productId}:base`,
      productId: p.productId,
      productName: p.name,
      packagingLevelId: null,
      packagingLevelName: null,
      unitPrice: p.salePrice,
    });
    setSearch("");
    setMsg(null);
  }

  async function checkout() {
    if (!lines.length || busy || !companyId || !locationId) return;
    setBusy(true);
    setMsg(null);
    try {
      const sale = await localSalesService.createSale(companyId, {
        locationId,
        customerId: null,
        paymentMethod: method,
        productLines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, packagingLevelId: l.packagingLevelId })),
        serviceLines: null,
        paymentSplits: null,
        amountTendered: method === PaymentMethod.Cash && tenderedNum > 0 ? tenderedNum : null,
        giftCardCode: null,
      });
      const changeTxt = sale.changeDue ? ` · change ${formatCurrency(sale.changeDue, currency)}` : "";
      setMsg({ ok: true, text: `Sale complete · ${formatCurrency(sale.total, currency)}${changeTxt}` });
      clear();
      setTendered("");
      await queryClient.invalidateQueries();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Checkout failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem-3rem)] gap-4">
      {/* Left: search + cart */}
      <div className="flex min-w-0 flex-1 flex-col">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) add(results[0]);
          }}
          placeholder="Scan a barcode or search products…"
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
                <span className="min-w-0 truncate text-sm font-medium text-text-primary">{p.name}</span>
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
              Cart is empty — search or scan to add products.
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{l.productName}</div>
                      <div className="text-xs text-text-secondary">{formatCurrency(l.unitPrice, currency)} each</div>
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
      <div className="flex w-[340px] shrink-0 flex-col rounded-card border border-border bg-surface p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Total</div>
        <div className="mt-1 text-3xl font-extrabold text-text-primary">{formatCurrency(total, currency)}</div>

        <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-text-secondary">Payment</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                method === m.value ? "border-primary bg-primary/10 text-primary" : "border-border text-text-primary hover:bg-background"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {method === PaymentMethod.Cash ? (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Amount tendered (optional)
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
                Change due: <span className="font-bold text-text-primary">{formatCurrency(change, currency)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex-1" />

        {msg ? (
          <div className={`mb-3 rounded-xl px-3 py-2 text-sm font-medium ${msg.ok ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}>
            {msg.text}
          </div>
        ) : null}

        <Button onClick={checkout} loading={busy} disabled={lines.length === 0}>
          Charge {formatCurrency(total, currency)}
        </Button>
        {lines.length > 0 ? (
          <button onClick={clear} className="mt-2 text-xs font-semibold text-text-secondary hover:text-error">
            Clear cart
          </button>
        ) : null}
      </div>
    </div>
  );
}
