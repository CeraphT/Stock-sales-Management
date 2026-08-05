import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { ScreenBackground } from '@/components/ScreenBackground';
import { StockBadge } from '@/components/StockBadge';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { listInventory, type InventoryRow } from '@/lib/inventory';
import { shareColoredReport } from '@/lib/reports/taxPdf';
import { useThemeColors } from '@/lib/theme/colors';
import { toast } from '@/lib/ui/toastStore';

type StatusFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
const STATUS_LABEL: Record<Exclude<StatusFilter, 'all'>, string> = { in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock' };

export default function InventoryReportScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sharing, setSharing] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['inventory-report', companyId],
    queryFn: () => listInventory(companyId!),
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => (status === 'all' || r.status === status) && (q === '' || r.name.toLowerCase().includes(q) || (r.barcode?.toLowerCase().includes(q) ?? false)),
    );
  }, [rows, query, status]);

  const totals = useMemo(
    () => filtered.reduce((a, r) => ({ cost: a.cost + r.costValue, retail: a.retail + r.retailValue, units: a.units + r.stock }), { cost: 0, retail: 0, units: 0 }),
    [filtered],
  );

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
        subtitle: status === 'all' ? 'All products' : STATUS_LABEL[status],
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

      <View className="gap-3 px-4 pt-3">
        <TextInput
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary"
          placeholder="Search product or barcode"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={setQuery}
        />
        <View className="flex-row flex-wrap gap-2">
          {(['all', 'in_stock', 'low_stock', 'out_of_stock'] as StatusFilter[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              className={`rounded-full border px-3 py-1.5 ${status === s ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
              <Text className={`text-xs font-semibold ${status === s ? 'text-primary' : 'text-text-secondary'}`}>
                {s === 'all' ? 'All' : STATUS_LABEL[s]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row items-center justify-between rounded-card border border-border bg-surface px-4 py-2.5">
          <Text className="text-xs text-text-secondary">
            {filtered.length} products · {totals.units} units
          </Text>
          <Text className="text-sm font-bold text-text-primary">{formatCurrency(totals.cost, currency)}</Text>
        </View>
        <Button title="🖨  Share PDF" variant="secondary" loading={sharing} onPress={sharePdf} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        contentContainerClassName="gap-2 p-4"
        ListEmptyComponent={!isLoading ? <Text className="p-4 text-center text-sm text-text-secondary">No products.</Text> : null}
        renderItem={({ item }: { item: InventoryRow }) => (
          <View className="rounded-card border border-border bg-surface p-3.5">
            <View className="flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-sm font-semibold text-text-primary">{item.name}</Text>
              <StockBadge status={item.status} label={STATUS_LABEL[item.status]} />
            </View>
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-xs text-text-secondary">{item.categoryName} · {item.stock} in stock</Text>
              <Text className="text-xs font-semibold text-text-primary">{formatCurrency(item.costValue, currency)}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
