import { ApiError } from "@stockflow/core/api/client";
import { categoriesApi } from "@stockflow/core/api/endpoints/categories";
import { productsApi } from "@stockflow/core/api/endpoints/products";
import { suppliersApi } from "@stockflow/core/api/endpoints/suppliers";
import type { PackagingLevelRequest } from "@stockflow/core/api/types/catalog";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { useSetBreadcrumb } from "@/lib/breadcrumb";
import { useAuthStore } from "@/lib/stores";
import { runSync } from "@/lib/sync/runSync";

interface LevelRow {
  unitName: string;
  quantityInBaseUnits: string;
  salePriceOverride: string;
}

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary";

export function ProductForm() {
  const { productId } = useParams();
  const isEdit = !!productId;
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.companyId)!;

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [lowStock, setLowStock] = useState("0");
  const [tax, setTax] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({ queryKey: ["categories", companyId], queryFn: () => categoriesApi.list(companyId) });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers", companyId], queryFn: () => suppliersApi.list(companyId) });
  const { data: detail } = useQuery({
    queryKey: ["product", companyId, productId],
    queryFn: () => productsApi.get(companyId, productId!),
    enabled: isEdit,
  });

  useSetBreadcrumb([
    { label: "Products", to: "/products" },
    { label: isEdit ? detail?.name ?? "Edit product" : "New product" },
  ]);

  useEffect(() => {
    if (!detail) return;
    setName(detail.name);
    setBarcode(detail.barcode ?? "");
    setCategoryId(detail.categoryId ?? "");
    setSupplierId(detail.supplierId ?? "");
    setPurchasePrice(String(detail.purchasePrice));
    setSalePrice(String(detail.salePrice));
    setLowStock(String(detail.lowStockThreshold));
    setTax(detail.taxRateOverridePercent != null ? String(detail.taxRateOverridePercent) : "");
    setFavorite(detail.isFavorite);
    setIsActive(detail.isActive);
    setLevels(
      detail.packagingLevels.map((l) => ({
        unitName: l.unitName,
        quantityInBaseUnits: String(l.quantityInBaseUnits),
        salePriceOverride: l.salePriceOverride != null ? String(l.salePriceOverride) : "",
      })),
    );
  }, [detail]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const packagingLevels: PackagingLevelRequest[] = levels
        .filter((l) => l.unitName.trim() && Number(l.quantityInBaseUnits) > 0)
        .map((l) => ({
          unitName: l.unitName.trim(),
          quantityInBaseUnits: Number(l.quantityInBaseUnits),
          salePriceOverride: l.salePriceOverride.trim() ? Number(l.salePriceOverride) : null,
        }));
      const body = {
        name: name.trim(),
        barcode: barcode.trim() || null,
        categoryId: categoryId || null,
        supplierId: supplierId || null,
        purchasePrice: Number(purchasePrice) || 0,
        salePrice: Number(salePrice) || 0,
        lowStockThreshold: Number(lowStock) || 0,
        taxRateOverridePercent: tax.trim() ? Number(tax) : null,
        isFavorite: favorite,
        packagingLevels,
      };
      if (isEdit) await productsApi.update(companyId, productId!, body);
      else await productsApi.create(companyId, body);
      await runSync();
      navigate("/products");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the product.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive() {
    try {
      if (isActive) await productsApi.archive(companyId, productId!);
      else await productsApi.restore(companyId, productId!);
      await runSync();
      navigate("/products");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update the product.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-text-primary">{isEdit ? "Edit product" : "New product"}</h2>
        <span className="w-12" />
      </div>

      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Category</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectCls}>
              <option value="">— none —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Supplier</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectCls}>
              <option value="">— none —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <TextField label="Purchase price" type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
          <TextField label="Sale price" type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          <TextField label="Low-stock at" type="number" value={lowStock} onChange={(e) => setLowStock(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 items-end gap-4">
          <TextField label="Tax override %" type="number" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="company default" />
          <label className="flex h-11 items-center gap-2">
            <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm text-text-primary">Favorite (pin in POS)</span>
          </label>
        </div>

        {/* Packaging levels */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Packaging levels</span>
            <button
              onClick={() => setLevels((l) => [...l, { unitName: "", quantityInBaseUnits: "", salePriceOverride: "" }])}
              className="text-sm font-semibold text-primary"
            >
              + Add level
            </button>
          </div>
          {levels.length === 0 ? (
            <p className="text-xs text-text-secondary">Base unit only. Add a level for boxes/blisters (e.g. “Box” = 10 units).</p>
          ) : (
            <div className="space-y-2">
              {levels.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={l.unitName}
                    onChange={(e) => setLevels((rows) => rows.map((r, j) => (j === i ? { ...r, unitName: e.target.value } : r)))}
                    placeholder="Unit name (Box)"
                    className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                  <input
                    value={l.quantityInBaseUnits}
                    onChange={(e) => setLevels((rows) => rows.map((r, j) => (j === i ? { ...r, quantityInBaseUnits: e.target.value } : r)))}
                    placeholder="Units"
                    type="number"
                    className="h-10 w-24 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                  <input
                    value={l.salePriceOverride}
                    onChange={(e) => setLevels((rows) => rows.map((r, j) => (j === i ? { ...r, salePriceOverride: e.target.value } : r)))}
                    placeholder="Price override"
                    type="number"
                    className="h-10 w-32 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                  <button onClick={() => setLevels((rows) => rows.filter((_, j) => j !== i))} className="px-2 text-text-secondary hover:text-error">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="text-sm font-medium text-error">{error}</p> : null}

        <div className="flex items-center justify-between pt-2">
          {isEdit ? (
            <>
              <button onClick={() => navigate(`/products/${productId}/receive`)} className="text-sm font-semibold text-primary">
                Receive stock
              </button>
              <button onClick={() => navigate(`/products/${productId}/adjust`)} className="text-sm font-semibold text-primary">
                Adjust stock
              </button>
              <button onClick={toggleArchive} className="text-sm font-semibold text-text-secondary hover:text-error">
                {isActive ? "Archive" : "Restore"}
              </button>
            </>
          ) : (
            <span />
          )}
          <Button onClick={save} loading={saving} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
