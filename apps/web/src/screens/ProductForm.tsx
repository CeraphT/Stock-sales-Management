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
import { MEASURE_UNITS, unitsPerMeasureFor } from "@/lib/businessTypes";
import { useCapabilities } from "@/lib/useCapabilities";
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
  const caps = useCapabilities();
  const [sellByMeasure, setSellByMeasure] = useState(false);
  const [measureUnit, setMeasureUnit] = useState("kg");
  const [serialTracked, setSerialTracked] = useState(false);
  const [manufacturer, setManufacturer] = useState("");

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

  // Variants: a saved, non-variant product in a variants-enabled company can own
  // child variant rows (size/colour), each a full product with its own stock.
  const isVariant = !!detail?.parentProductId;
  const showVariants = isEdit && caps.variants && !isVariant;
  const { data: variants = [], refetch: refetchVariants } = useQuery({
    queryKey: ["variants", companyId, productId],
    queryFn: () => productsApi.variants(companyId, productId!),
    enabled: showVariants,
  });
  const [variantInput, setVariantInput] = useState("");
  const [addingVariants, setAddingVariants] = useState(false);
  async function addVariants() {
    const labels = variantInput.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (labels.length === 0 || addingVariants) return;
    setAddingVariants(true);
    try {
      await productsApi.createVariants(companyId, productId!, labels);
      setVariantInput("");
      await refetchVariants();
      await runSync();
      toast(t("Variants added."), "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Could not add variants."), "error");
    } finally {
      setAddingVariants(false);
    }
  }

  // Assembly / bill-of-materials (build-to-stock). Editable on a saved,
  // non-variant product in an assembly-enabled company.
  const showAssembly = isEdit && caps.assembly && !isVariant;
  const [bom, setBom] = useState<{ componentProductId: string; componentName: string; quantityInBaseUnits: number }[]>([]);
  const [bomLoaded, setBomLoaded] = useState(false);
  const { data: bomData } = useQuery({
    queryKey: ["bom", companyId, productId],
    queryFn: () => productsApi.bom(companyId, productId!),
    enabled: showAssembly,
  });
  useEffect(() => {
    if (!bomData || bomLoaded) return;
    setBom(bomData.map((b) => ({ componentProductId: b.componentProductId, componentName: b.componentName, quantityInBaseUnits: b.quantityInBaseUnits })));
    setBomLoaded(true);
  }, [bomData, bomLoaded]);
  const [compSearch, setCompSearch] = useState("");
  const { data: compResults = [] } = useQuery({
    queryKey: ["bom-search", companyId, compSearch],
    queryFn: () => productsApi.search(companyId, compSearch),
    enabled: showAssembly && compSearch.trim().length > 0,
  });
  const [savingBom, setSavingBom] = useState(false);
  async function saveBom() {
    if (savingBom) return;
    setSavingBom(true);
    try {
      await productsApi.setBom(companyId, productId!, bom.map((b) => ({ componentProductId: b.componentProductId, quantityInBaseUnits: b.quantityInBaseUnits })));
      await runSync();
      toast(t("Bill of materials saved."), "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Could not save the bill of materials."), "error");
    } finally {
      setSavingBom(false);
    }
  }
  const locationId = useAuthStore((s) => s.locationId);
  const [buildQty, setBuildQty] = useState("");
  const [buildBatch, setBuildBatch] = useState("");
  const [buildExpiry, setBuildExpiry] = useState("");
  const [building, setBuilding] = useState(false);
  async function build() {
    if (building || !locationId) return;
    setBuilding(true);
    try {
      await productsApi.build(companyId, productId!, {
        locationId,
        quantity: Number(buildQty) || 0,
        batchNumber: buildBatch.trim(),
        expiryDate: buildExpiry ? new Date(buildExpiry).toISOString() : null,
      });
      await runSync();
      setBuildQty("");
      setBuildBatch("");
      toast(t("Built — finished stock added."), "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Build failed."), "error");
    } finally {
      setBuilding(false);
    }
  }

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
    // For a measure product, prices are stored per base unit (per gram) but shown
    // per display unit (per kg) — multiply back up for the form.
    const measure = detail.sellByMeasure ?? false;
    const upm = measure ? (detail.unitsPerMeasure ?? 1) : 1;
    setSellByMeasure(measure);
    setMeasureUnit(detail.measureUnit ?? "kg");
    setSerialTracked(detail.serialTracked ?? false);
    setManufacturer(detail.manufacturer ?? "");
    setPurchasePrice(String(measure ? detail.purchasePrice * upm : detail.purchasePrice));
    setSalePrice(String(measure ? detail.salePrice * upm : detail.salePrice));
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
      // Measure products store prices per BASE unit (per gram): the form enters
      // per display unit (per kg), so divide by unitsPerMeasure on save.
      const upm = sellByMeasure ? unitsPerMeasureFor(measureUnit) : 1;
      const body = {
        name: name.trim(),
        barcode: barcode.trim() || null,
        categoryId: categoryId || null,
        supplierId: supplierId || null,
        purchasePrice: (Number(purchasePrice) || 0) / upm,
        salePrice: (Number(salePrice) || 0) / upm,
        lowStockThreshold: Number(lowStock) || 0,
        taxRateOverridePercent: tax.trim() ? Number(tax) : null,
        isFavorite: favorite,
        // Packaging levels are mutually exclusive with sell-by-measure.
        packagingLevels: sellByMeasure ? [] : packagingLevels,
        sellByMeasure,
        measureUnit: sellByMeasure ? measureUnit : null,
        unitsPerMeasure: upm,
        serialTracked,
        manufacturer: manufacturer.trim() || null,
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

        {caps.sellByMeasure ? (
          <div className="rounded-xl border border-border p-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sellByMeasure}
                onChange={(e) => { setSellByMeasure(e.target.checked); if (e.target.checked) setSerialTracked(false); }}
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold text-text-primary">⚖️ {t("Sold by weight / measure")}</span>
            </label>
            {sellByMeasure ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <span>{t("Unit")}</span>
                <select value={measureUnit} onChange={(e) => setMeasureUnit(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text-primary">
                  {MEASURE_UNITS.map((m) => <option key={m.unit} value={m.unit}>{m.unit}</option>)}
                </select>
                <span>{t("Prices below are per")} {measureUnit}; {t("sell any weight in the POS.")}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {caps.serialTracking ? (
          <div className="rounded-xl border border-border p-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={serialTracked}
                onChange={(e) => { setSerialTracked(e.target.checked); if (e.target.checked) setSellByMeasure(false); }}
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold text-text-primary">🔢 {t("Track serial / IMEI numbers")}</span>
            </label>
            {serialTracked ? (
              <p className="mt-2 text-xs text-text-secondary">{t("Capture one serial per unit when receiving; pick the exact unit when selling.")}</p>
            ) : null}
          </div>
        ) : null}

        {caps.assembly ? (
          <TextField label={t("Manufacturer / brand (optional)")} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        ) : null}

        <div className="grid grid-cols-3 gap-4">
          <TextField label={`${t("Purchase price")}${sellByMeasure ? ` (/${measureUnit})` : ""}`} type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
          <TextField label={`${t("Sale price")}${sellByMeasure ? ` (/${measureUnit})` : ""}`} type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          <TextField label={t("Low-stock at")} type="number" value={lowStock} onChange={(e) => setLowStock(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 items-end gap-4">
          <TextField label={t("Tax override %")} type="number" value={tax} onChange={(e) => setTax(e.target.value)} placeholder={t("company default")} />
          <label className="flex h-11 items-center gap-2">
            <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm text-text-primary">{t("Favorite (pin in POS)")}</span>
          </label>
        </div>

        {/* Packaging levels — hidden for sell-by-measure and serialized products */}
        {!sellByMeasure && !serialTracked ? (
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
        ) : null}

        {showVariants ? (
          <div className="rounded-xl border border-border p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">🎨 {t("Variants")}</span>
              {variants.length > 0 ? (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{variants.length}</span>
              ) : null}
            </div>
            {variants.length > 0 ? (
              <div className="mb-3 space-y-1.5">
                {variants.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <span className="font-medium text-text-primary">{v.variantName}</span>
                    <div className="flex gap-3 text-xs font-semibold">
                      <button onClick={() => navigate(`/products/${v.id}/edit`)} className="text-primary hover:brightness-110">{t("Edit")}</button>
                      <button onClick={() => navigate(`/products/${v.id}/receive`)} className="text-primary hover:brightness-110">{t("Receive")}</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-xs text-text-secondary">{t("Add sizes/colours as variants — each gets its own stock, barcode and price.")}</p>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <TextField label={t("New variants (comma-separated)")} value={variantInput} onChange={(e) => setVariantInput(e.target.value)} placeholder="S, M, L" />
              </div>
              <Button variant="secondary" onClick={addVariants} loading={addingVariants} disabled={!variantInput.trim()}>{t("Add")}</Button>
            </div>
          </div>
        ) : null}

        {isVariant ? (
          <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-text-secondary">
            🎨 {t("This is a variant — its stock, barcode and price are managed here independently.")}
          </p>
        ) : null}

        {showAssembly ? (
          <div className="rounded-xl border border-border p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">🛠️ {t("Bill of materials (build from components)")}</div>

            {bom.length > 0 ? (
              <div className="mb-3 space-y-1.5">
                {bom.map((line, i) => (
                  <div key={line.componentProductId} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <span className="flex-1 font-medium text-text-primary">{line.componentName}</span>
                    <input
                      type="number"
                      value={line.quantityInBaseUnits}
                      onChange={(e) => setBom((b) => b.map((x, j) => (j === i ? { ...x, quantityInBaseUnits: Number(e.target.value) || 0 } : x)))}
                      className="h-8 w-20 rounded-lg border border-border bg-surface px-2 text-right text-sm text-text-primary"
                    />
                    <span className="text-xs text-text-secondary">{t("units / build")}</span>
                    <button onClick={() => setBom((b) => b.filter((_, j) => j !== i))} className="text-text-secondary hover:text-error" title={t("Remove")}>✕</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-xs text-text-secondary">{t("Add the components consumed to build one unit of this product.")}</p>
            )}

            <div className="mb-2">
              <TextField label={t("Add component (search)")} value={compSearch} onChange={(e) => setCompSearch(e.target.value)} placeholder={t("Search a product…")} />
              {compSearch.trim() && compResults.length > 0 ? (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border">
                  {compResults
                    .filter((r) => r.productId !== productId && !bom.some((b) => b.componentProductId === r.productId))
                    .map((r) => (
                      <button
                        key={r.productId}
                        onClick={() => { setBom((b) => [...b, { componentProductId: r.productId, componentName: r.name, quantityInBaseUnits: 1 }]); setCompSearch(""); }}
                        className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-primary/5"
                      >
                        {r.name}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>

            <Button variant="secondary" onClick={saveBom} loading={savingBom}>{t("Save bill of materials")}</Button>

            {bom.length > 0 ? (
              <div className="mt-4 rounded-xl bg-primary/5 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">📦 {t("Build finished stock")}</div>
                <div className="grid grid-cols-2 gap-2">
                  <TextField label={t("Quantity to build")} type="number" value={buildQty} onChange={(e) => setBuildQty(e.target.value)} />
                  <TextField label={t("Batch number")} value={buildBatch} onChange={(e) => setBuildBatch(e.target.value)} />
                  {caps.expiryTracking ? (
                    <TextField label={t("Expiry date (required)")} type="date" value={buildExpiry} onChange={(e) => setBuildExpiry(e.target.value)} />
                  ) : null}
                </div>
                <div className="mt-2">
                  <Button onClick={build} loading={building} disabled={!(Number(buildQty) > 0) || !buildBatch.trim() || (caps.expiryTracking && !buildExpiry)}>
                    🛠️ {t("Build")}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-text-secondary">{t("Deducts the components above and adds this many finished units to stock.")}</p>
              </div>
            ) : null}
          </div>
        ) : null}

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
