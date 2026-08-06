import { ApiError } from "@stockflow/core/api/client";
import { categoriesApi } from "@stockflow/core/api/endpoints/categories";
import { productsApi } from "@stockflow/core/api/endpoints/products";
import { suppliersApi } from "@stockflow/core/api/endpoints/suppliers";
import type { PackagingLevelRequest } from "@stockflow/core/api/types/catalog";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { useSetBreadcrumb } from "@/lib/breadcrumb";
import { useT } from "@/lib/i18n";
import { usePrefsStore } from "@/lib/prefs";
import { useAuthStore } from "@/lib/stores";
import { useCompany } from "@/lib/useCompany";
import { runSync } from "@/lib/sync/runSync";
import { toast } from "@/lib/toast";

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
  const t = useT();

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
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  async function createCategory() {
    const nm = newCatName.trim();
    if (!nm || savingCat) return;
    setSavingCat(true);
    try {
      const created = await categoriesApi.create(companyId, { name: nm });
      await refetchCategories();
      setCategoryId(created.id);
      setNewCatName("");
      setAddingCat(false);
      toast(t("Category added."), "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Could not add the category."), "error");
    } finally {
      setSavingCat(false);
    }
  }

  const allowNoSupplier = usePrefsStore((s) => s.allowProductsWithoutSupplier);

  const { data: categories = [], refetch: refetchCategories } = useQuery({ queryKey: ["categories", companyId], queryFn: () => categoriesApi.list(companyId) });
  const company = useCompany().data;

  // New products inherit the company-wide default low-stock threshold (Settings →
  // Data-entry rules), applied once so it never clobbers the cashier's edits.
  const lowStockSeeded = useRef(false);
  useEffect(() => {
    if (isEdit || lowStockSeeded.current || !company) return;
    lowStockSeeded.current = true;
    if (company.defaultLowStockThreshold > 0) setLowStock(String(company.defaultLowStockThreshold));
  }, [isEdit, company]);
  const { data: suppliers = [], isSuccess: suppliersLoaded } = useQuery({ queryKey: ["suppliers", companyId], queryFn: () => suppliersApi.list(companyId) });

  // Dependency guardrail: warn once, on a new product, if there are no
  // suppliers yet and one is required (see save()). Only judge AFTER the query
  // resolves — `suppliers` is [] while loading, which would toast falsely.
  const warnedNoSuppliers = useRef(false);
  useEffect(() => {
    if (isEdit || allowNoSupplier || warnedNoSuppliers.current) return;
    if (suppliersLoaded && suppliers.length === 0) {
      warnedNoSuppliers.current = true;
      toast(t("No suppliers yet — add one first, or allow supplier-less stock in Company settings."), "info");
    }
  }, [suppliersLoaded, suppliers.length, isEdit, allowNoSupplier, t]);
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
    // Dependency guardrail: a product must have a supplier unless the install
    // has opted into supplier-less stock (Company settings).
    if (!supplierId && !allowNoSupplier) {
      if (suppliers.length === 0) {
        toast("Add a supplier first, then link it here. (Existing stock with no supplier? Enable it in Company settings.)", "error");
      } else {
        toast("Select a supplier before saving — or allow supplier-less stock in Company settings.", "error");
      }
      return;
    }
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
        <h2 className="text-lg font-bold text-text-primary">{isEdit ? t("Edit product") : t("New product")}</h2>
        <span className="w-12" />
      </div>

      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        <TextField label={t("Name")} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label={t("Barcode")} value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder={t("Scan or type…")} />

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Category")}</span>
            <div className="flex items-center gap-2">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${selectCls} flex-1`}>
                <option value="">{t("— none —")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setAddingCat((v) => !v)}
                title={t("Add category")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-lg font-bold text-primary transition hover:border-primary"
              >
                {addingCat ? "×" : "+"}
              </button>
            </div>
            {addingCat ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={newCatName}
                  autoFocus
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void createCategory();
                    }
                  }}
                  placeholder={t("New category name")}
                  className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary"
                />
                <Button onClick={createCategory} loading={savingCat} disabled={!newCatName.trim()}>
                  {t("Add")}
                </Button>
              </div>
            ) : null}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {t("Supplier")}{!allowNoSupplier ? <span className="text-error"> *</span> : null}
            </span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectCls}>
              <option value="">{allowNoSupplier ? t("— none —") : t("— select a supplier —")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {!allowNoSupplier && suppliers.length === 0 ? (
              <button type="button" onClick={() => navigate("/suppliers")} className="mt-1 text-xs font-semibold text-primary">
                {t("+ Add a supplier first")}
              </button>
            ) : null}
          </label>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <TextField label={t("Purchase price")} type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
          <TextField label={t("Sale price")} type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          <TextField label={t("Low-stock at")} type="number" value={lowStock} onChange={(e) => setLowStock(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 items-end gap-4">
          <TextField label={t("Tax override %")} type="number" value={tax} onChange={(e) => setTax(e.target.value)} placeholder={t("company default")} />
          <label className="flex h-11 items-center gap-2">
            <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm text-text-primary">{t("Favorite (pin in POS)")}</span>
          </label>
        </div>

        {/* Packaging levels */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Packaging levels")}</span>
            <button
              onClick={() => setLevels((l) => [...l, { unitName: "", quantityInBaseUnits: "", salePriceOverride: "" }])}
              className="text-sm font-semibold text-primary"
            >
              {t("+ Add level")}
            </button>
          </div>
          {levels.length === 0 ? (
            <p className="text-xs text-text-secondary">{t("Base unit only. Add a level for boxes/blisters (e.g. “Box” = 10 units).")}</p>
          ) : (
            <div className="space-y-2">
              {levels.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={l.unitName}
                    onChange={(e) => setLevels((rows) => rows.map((r, j) => (j === i ? { ...r, unitName: e.target.value } : r)))}
                    placeholder={t("Unit name (Box)")}
                    className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                  <input
                    value={l.quantityInBaseUnits}
                    onChange={(e) => setLevels((rows) => rows.map((r, j) => (j === i ? { ...r, quantityInBaseUnits: e.target.value } : r)))}
                    placeholder={t("Units")}
                    type="number"
                    className="h-10 w-24 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                  <input
                    value={l.salePriceOverride}
                    onChange={(e) => setLevels((rows) => rows.map((r, j) => (j === i ? { ...r, salePriceOverride: e.target.value } : r)))}
                    placeholder={t("Price override")}
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

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {isEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => navigate(`/products/${productId}/inventory`)}>
                📊 {t("Inventory")}
              </Button>
              <Button variant="secondary" onClick={() => navigate(`/products/${productId}/receive`)}>
                📥 {t("Receive stock")}
              </Button>
              <Button variant="secondary" onClick={() => navigate(`/products/${productId}/adjust`)}>
                ✏️ {t("Adjust stock")}
              </Button>
              <Button variant={isActive ? "danger" : "secondary"} onClick={toggleArchive}>
                {isActive ? `🗄️ ${t("Archive")}` : `♻️ ${t("Restore")}`}
              </Button>
            </div>
          ) : (
            <span />
          )}
          <Button onClick={save} loading={saving} disabled={!name.trim()}>
            {t("Save")}
          </Button>
        </div>
      </div>

    </div>
  );
}
