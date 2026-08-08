import { code128Svg } from '@stockflow/core/barcode/code128';
import { useQuery } from '@tanstack/react-query';
import * as Print from 'expo-print';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import type { ProductSearchResult } from '@/lib/api/types/catalog';
import { productsApi } from '@/lib/api/endpoints/products';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

interface LabelPick {
  productId: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  count: number;
}

const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function PrintLabelsScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCompanyCurrency();
  const colors = useThemeColors();

  const [search, setSearch] = useState('');
  const [picks, setPicks] = useState<LabelPick[]>([]);
  const [printing, setPrinting] = useState(false);

  const { data: results = [] } = useQuery({
    queryKey: ['label-search', companyId, search],
    queryFn: () => productsApi.search(companyId!, search),
    enabled: !!companyId && search.trim().length > 0,
  });

  const addPick = (p: ProductSearchResult) => {
    setPicks((cur) =>
      cur.some((x) => x.productId === p.productId)
        ? cur
        : [...cur, { productId: p.productId, name: p.name, barcode: p.barcode, salePrice: p.salePrice, count: 1 }],
    );
    setSearch('');
  };

  const setCount = (productId: string, n: number) =>
    setPicks((cur) => cur.map((x) => (x.productId === productId ? { ...x, count: Math.max(1, n || 1) } : x)));

  const print = async () => {
    const labels: string[] = [];
    for (const p of picks) {
      const svg = p.barcode ? code128Svg(p.barcode, { moduleWidth: 1.6, height: 46 }) : null;
      for (let i = 0; i < p.count; i++) {
        labels.push(`<div class="label"><div class="name">${escapeHtml(p.name)}</div>
          <div class="price">${escapeHtml(formatCurrency(p.salePrice, currency))}</div>
          ${svg ? `<div class="bc">${svg}</div><div class="code">${escapeHtml(p.barcode!)}</div>` : `<div class="nobc">No barcode</div>`}</div>`);
      }
    }
    const html = `<html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;font-family:sans-serif}
      .sheet{display:flex;flex-wrap:wrap;gap:4mm;padding:6mm}
      .label{width:50mm;height:30mm;border:1px dashed #bbb;padding:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
      .name{font-size:10px;font-weight:600;line-height:1.1;max-height:22px;overflow:hidden}
      .price{font-size:13px;font-weight:800;margin:1mm 0}
      .bc svg{display:block;height:46px;width:auto;max-width:46mm}
      .code{font-size:8px;letter-spacing:1px}.nobc{font-size:8px;color:#999}
    </style></head><body><div class="sheet">${labels.join('')}</div></body></html>`;

    setPrinting(true);
    try {
      await Print.printAsync({ html });
    } catch (err) {
      showAlert('Could not print labels', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setPrinting(false);
    }
  };

  const totalLabels = picks.reduce((n, p) => n + p.count, 0);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Print labels</Text>
          <View className="w-12" />
        </View>
      </View>

      <View className="px-5 pt-3">
        <TextInput
          className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-base text-text-primary"
          placeholder="Search a product to add…"
          placeholderTextColor={colors.placeholder}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.trim() && results.length > 0 ? (
          <View className="mt-1 overflow-hidden rounded-xl border border-border bg-surface">
            {results.slice(0, 8).map((r) => (
              <Pressable key={r.productId} onPress={() => addPick(r)} className="border-b border-border/50 px-3 py-2.5 last:border-0 active:opacity-70">
                <Text className="text-sm text-text-primary">{r.name}</Text>
                <Text className="text-xs text-text-secondary">{r.barcode ?? 'no barcode'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerClassName="gap-2 p-5" keyboardShouldPersistTaps="handled">
        {picks.length === 0 ? (
          <Text className="py-10 text-center text-sm text-text-secondary">Add products to print price/barcode labels.</Text>
        ) : (
          picks.map((p) => (
            <View key={p.productId} className="flex-row items-center gap-3 rounded-xl bg-surface p-3">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text-primary">{p.name}</Text>
                <Text className="text-xs text-text-secondary">{formatCurrency(p.salePrice, currency)} · {p.barcode ?? 'no barcode'}</Text>
              </View>
              <TextInput
                className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-right text-sm text-text-primary"
                keyboardType="numeric"
                value={String(p.count)}
                onChangeText={(v) => setCount(p.productId, Number(v))}
              />
              <Pressable onPress={() => setPicks((cur) => cur.filter((x) => x.productId !== p.productId))} hitSlop={8}>
                <Text className="text-text-secondary">✕</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <View className="border-t border-border bg-surface p-4">
        <Button title={printing ? 'Printing…' : `Print ${totalLabels} label(s)`} loading={printing} onPress={print} disabled={totalLabels === 0} />
      </View>
    </SafeAreaView>
  );
}
