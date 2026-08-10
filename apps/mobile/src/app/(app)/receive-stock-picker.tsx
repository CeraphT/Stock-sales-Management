import { Ionicons } from '@expo/vector-icons';
import { and, asc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { db } from '@/lib/db/client';
import { products } from '@/lib/db/schema';
import { useAuthStore } from '@/lib/auth/store';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';

/** Purchasing → "Receive stock": pick (or search) the product you got a
 * delivery for, then jump to the existing per-product receive form (which
 * already adapts to serial/measure products). Makes receiving reachable from
 * the Purchasing menu instead of only via a product's own screen. */
export default function ReceiveStockPickerScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictPurchasing));
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [query, setQuery] = useState('');

  const { data: productRows } = useLiveQuery(
    db
      .select({ id: products.id, name: products.name, barcode: products.barcode })
      .from(products)
      .where(and(eq(products.isActive, true), eq(products.companyId, companyId ?? '')))
      .orderBy(asc(products.name)),
    [companyId],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const rows = productRows ?? [];
    if (!q) return rows;
    return rows.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').includes(q));
  }, [productRows, q]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('drawer.item.receiveStock')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <View className="px-5 pt-4">
        <View className="flex-row items-center gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
          <Ionicons name="search" size={16} color={colors.iconMuted} />
          <TextInput
            className="flex-1 text-sm"
            style={{ color: colors.textPrimary }}
            placeholder={t('receive.searchPlaceholder')}
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-2 p-5" keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <Text className="px-2 py-10 text-center text-sm text-text-secondary">{t('receive.empty')}</Text>
        ) : (
          filtered.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: '/stock-receive', params: { productId: p.id } })}
              className="flex-row items-center gap-3 rounded-xl bg-surface p-3.5 active:opacity-70">
              <View className="h-9 w-9 items-center justify-center rounded-[10px]" style={{ backgroundColor: colors.accentOrange + '22' }}>
                <Ionicons name="download-outline" size={18} color={colors.accentOrange} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text-primary">{p.name}</Text>
                {p.barcode ? <Text className="text-xs text-text-secondary">{p.barcode}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.iconMuted} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
