import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { FiltersDisclosure } from '@/components/FiltersDisclosure';
import { ScreenBackground } from '@/components/ScreenBackground';
import { StockBadge } from '@/components/StockBadge';
import { FilterChip } from '@/components/FilterChip';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { listInventory, type InventoryRow } from '@/lib/inventory';
import { shareColoredReport } from '@/lib/reports/taxPdf';
import { useThemeColors } from '@/lib/theme/colors';
import { toast } from '@/lib/ui/toastStore';

type StatusFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type ExpiryFilter = 'all' | 'expiring' | 'expired';
const STATUS_LABEL: Record<Exclude<StatusFilter, 'all'>, string> = { in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock' };

const TODAY = new Date().toISOString().slice(0, 10);
function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
function isExpired(r: InventoryRow): boolean {
  return r.earliestExpiry != null && r.earliestExpiry.slice(0, 10) < TODAY && r.stock > 0;
}
function isExpiringSoon(r: InventoryRow): boolean {
  if (r.earliestExpiry == null || r.stock <= 0) return false;
  const d = daysUntil(r.earliestExpiry);
  return d >= 0 && d <= 30;
}

export default function InventoryReportScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<string>('');
  const [supplier, setSupplier] = useState<string>('');
  const [expiry, setExpiry] = useState<ExpiryFilter>('all');
  const [sharing, setSharing] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['inventory-report', companyId],
    queryFn: () => listInventory(companyId!),
    enabled: !!companyId,
  });

  const categoryNames = useMemo(() => [...new Set(rows.map((r) => r.categoryName))].sort(), [rows]);
  const supplierNames = useMemo(() => [...new Set(rows.map((r) => r.supplierName))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === 'all' || r.status === status) &&
        (!category || r.categoryName === category) &&
        (!supplier || r.supplierName === supplier) &&
        (expiry === 'all' || (expiry === 'expired' ? isExpired(r) : isExpiringSoon(r))) &&
        (q === '' || r.name.toLowerCase().includes(q) || (r.barcode?.toLowerCase().includes(q) ?? false)),
    );
  }, [rows, query, status, category, supplier, expiry]);

  // One group per category, sorted by name — matches desktop's grouped table.
  const groups = useMemo(() => {
    const m = new Map<string, InventoryRow[]>();
    for (const r of filtered) {
      const list = m.get(r.categoryName) ?? [];
      list.push(r);
      m.set(r.categoryName, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const totals = useMemo(
    () => filtered.reduce((a, r) => ({ cost: a.cost + r.costValue, retail: a.retail + r.retailValue, units: a.units + r.stock }), { cost: 0, retail: 0, units: 0 }),
    [filtered],
  );
  const margin = totals.retail - totals.cost;
  const hasFilter = !!query || status !== 'all' || !!category || !!supplier || expiry !== 'all';

  async function sharePdf() {
    if (sharing || filtered.length === 0) {
      if (filtered.length === 0) toast('Nothing to export.', 'info');
      return;
    }
    setSharing(true);
    try {
      await shareColoredReport({
        companyName,
        title: 'Inventory report',
        subtitle: hasFilter ? 'Filtered' : 'All products',
        meta: [
          { label: 'Products', value: String(filtered.length) },
          { label: 'Stock value (cost)', value: formatCurrency(totals.cost, currency) },
        ],
        columns: [{ header: 'Product' }, { header: 'Category' }, { header: 'Supplier' }, { header: 'Stock', align: 'right' }, { header: 'Cost value', align: 'right' }, { header: 'Retail value', align: 'right' }],
        rows: filtered.map((r) => [r.name, r.categoryName, r.supplierName, String(r.stock), formatCurrency(r.costValue, currency), formatCurrency(r.retailValue, currency)]),
        totals: ['Total', null, null, String(totals.units), formatCurrency(totals.cost, currency), formatCurrency(totals.retail, currency)],
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not export the report.', 'error');
    } finally {
      setSharing(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Inventory report</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-4 pb-10">
        {/* KPI tiles — matches desktop (Products, Units, Cost, Retail, Margin). */}
        <View className="flex-row flex-wrap gap-3">
          <Kpi label="Products" value={String(filtered.length)} />
          <Kpi label="Units in stock" value={String(totals.units)} />
          <Kpi label="Cost value" value={formatCurrency(totals.cost, currency)} tone="text-accent-amber" />
          <Kpi label="Retail value" value={formatCurrency(totals.retail, currency)} tone="text-success" />
          <Kpi label="Potential margin" value={formatCurrency(margin, currency)} tone="text-primary" />
        </View>

        <View className="gap-3">
          <TextInput
            className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary"
            placeholder="Search product or barcode"
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={setQuery}
          />
          <FiltersDisclosure active={hasFilter}>
            <View className="flex-row flex-wrap gap-2">
              {(['all', 'in_stock', 'low_stock', 'out_of_stock'] as StatusFilter[]).map((s) => (
                <FilterChip key={s} label={s === 'all' ? 'Any stock' : STATUS_LABEL[s]} active={status === s} onPress={() => setStatus(s)} />
              ))}
            </View>
            <View className="flex-row flex-wrap gap-2">
              {(['all', 'expiring', 'expired'] as ExpiryFilter[]).map((e) => (
                <FilterChip key={e} label={e === 'all' ? 'Any expiry' : e === 'expiring' ? 'Expiring soon' : 'Expired'} active={expiry === e} onPress={() => setExpiry(e)} />
              ))}
            </View>
            {categoryNames.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                <FilterChip label="All categories" active={category === ''} onPress={() => setCategory('')} />
                {categoryNames.map((c) => (
                  <FilterChip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
                ))}
              </View>
            ) : null}
            {supplierNames.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                <FilterChip label="All suppliers" active={supplier === ''} onPress={() => setSupplier('')} />
                {supplierNames.map((s) => (
                  <FilterChip key={s} label={s} active={supplier === s} onPress={() => setSupplier(s)} />
                ))}
              </View>
            ) : null}
          </FiltersDisclosure>
          <Button title="🖨  Share PDF" variant="secondary" loading={sharing} onPress={sharePdf} />
        </View>

        {isLoading ? (
          <Text className="p-4 text-center text-sm text-text-secondary">Loading…</Text>
        ) : filtered.length === 0 ? (
          <Text className="p-4 text-center text-sm text-text-secondary">No products.</Text>
        ) : (
          <>
            {groups.map(([cat, catRows]) => {
              const sub = catRows.reduce((a, r) => ({ q: a.q + r.stock, c: a.c + r.costValue, s: a.s + r.retailValue }), { q: 0, c: 0, s: 0 });
              return (
                <View key={cat} className="overflow-hidden rounded-card border border-border bg-surface">
                  <View className="flex-row items-center justify-between border-b border-border bg-primary/5 px-4 py-2">
                    <Text className="text-xs font-bold uppercase tracking-wide text-primary">{cat}</Text>
                    <Text className="text-xs text-text-secondary">{catRows.length}</Text>
                  </View>
                  {catRows.map((r) => (
                    <View key={r.id} className="border-b border-border/60 px-4 py-2.5">
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1 flex-row flex-wrap items-center gap-1.5">
                          <Text className="text-sm font-medium text-text-primary">{r.name}</Text>
                          {isExpired(r) ? (
                            <View className="rounded bg-error/15 px-1.5 py-0.5"><Text className="text-[10px] font-bold text-error">Expired</Text></View>
                          ) : isExpiringSoon(r) ? (
                            <View className="rounded bg-accent-orange/15 px-1.5 py-0.5"><Text className="text-[10px] font-bold text-accent-orange">Expiring soon</Text></View>
                          ) : null}
                        </View>
                        <StockBadge status={r.status} label={STATUS_LABEL[r.status]} />
                      </View>
                      <View className="mt-1 flex-row items-center justify-between">
                        <Text className="text-xs text-text-secondary">{r.supplierName} · {r.stock} in stock</Text>
                        <Text className="text-xs text-text-secondary">
                          {formatCurrency(r.costValue, currency)} → <Text className="font-semibold text-text-primary">{formatCurrency(r.retailValue, currency)}</Text>
                        </Text>
                      </View>
                    </View>
                  ))}
                  <View className="flex-row items-center justify-between px-4 py-2">
                    <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Subtotal · {sub.q}</Text>
                    <Text className="text-xs font-bold text-text-primary">{formatCurrency(sub.c, currency)} → {formatCurrency(sub.s, currency)}</Text>
                  </View>
                </View>
              );
            })}

            <View className="flex-row items-center justify-between rounded-card border-2 border-primary/40 bg-primary/5 px-4 py-3">
              <Text className="text-sm font-extrabold text-text-primary">Total · {totals.units} units</Text>
              <Text className="text-sm font-extrabold text-text-primary">{formatCurrency(totals.cost, currency)} → {formatCurrency(totals.retail, currency)}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View className="w-[47%] rounded-2xl bg-surface p-4">
      <Text className="text-xs uppercase tracking-wide text-text-secondary">{label}</Text>
      <Text className={`mt-1 text-base font-bold ${tone ?? 'text-text-primary'}`}>{value}</Text>
    </View>
  );
}
