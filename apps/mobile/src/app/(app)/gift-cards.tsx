import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { giftCardsApi } from '@/lib/api/endpoints/giftCards';
import type { GiftCardResponse } from '@/lib/api/types/customers';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

export default function GiftCardsScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictCustomers));
  const currency = useCompanyCurrency();
  const colors = useThemeColors();

  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<GiftCardResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueValue, setIssueValue] = useState('');
  const [issuing, setIssuing] = useState(false);

  const refresh = useCallback(
    async (search?: string) => {
      if (!companyId) return;
      setLoading(true);
      try {
        setCards(await giftCardsApi.list(companyId, search?.trim() || undefined));
      } catch (err) {
        showAlert('Could not load gift cards', err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    },
    [companyId],
  );

  useFocusEffect(
    useCallback(() => {
      refresh(query);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId]),
  );

  const onIssue = async () => {
    if (!companyId) return;
    const value = Number(issueValue);
    if (!Number.isFinite(value) || value <= 0) {
      showAlert('Invalid amount', 'Enter a positive gift card value.');
      return;
    }
    setIssuing(true);
    try {
      await giftCardsApi.issue(companyId, { initialValue: value });
      setIssueValue('');
      await refresh(query);
    } catch (err) {
      showAlert('Could not issue gift card', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIssuing(false);
    }
  };

  const onToggleActive = async (card: GiftCardResponse) => {
    if (!companyId) return;
    try {
      await giftCardsApi.setActive(companyId, card.id, { active: !card.active });
      await refresh(query);
    } catch (err) {
      showAlert('Could not update gift card', err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Gift cards</Text>
          <View className="w-12" />
        </View>
        <TextInput
          className="mt-3 rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
          placeholder="Search by code"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            refresh(text);
          }}
          autoCapitalize="characters"
        />
      </View>

      <View className="flex-row items-center gap-2 p-4">
        <TextInput
          className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 text-base text-text-primary"
          placeholder={`Issue new card value (${currency})`}
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
          value={issueValue}
          onChangeText={setIssueValue}
          returnKeyType="done"
          onSubmitEditing={onIssue}
        />
        <Pressable
          onPress={onIssue}
          disabled={!issueValue.trim() || issuing}
          accessibilityLabel="Issue gift card"
          className="h-12 w-12 items-center justify-center rounded-xl bg-primary active:opacity-90 disabled:opacity-50">
          {issuing ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="add" size={22} color="#FFFFFF" />}
        </Pressable>
      </View>

      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-2 px-4 pb-4"
        refreshing={loading}
        onRefresh={() => refresh(query)}
        renderItem={({ item }) => (
          <View className="flex-row items-center justify-between rounded-xl bg-surface p-3.5">
            <View className="flex-1 pr-2">
              <Text className="text-sm font-semibold text-text-primary">{item.code}</Text>
              <Text className="text-xs text-text-secondary">
                {formatCurrency(item.remainingValue, currency)} remaining of {formatCurrency(item.initialValue, currency)}
              </Text>
            </View>
            <Pressable
              onPress={() => onToggleActive(item)}
              className={`rounded-full border px-3 py-1.5 ${item.active ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
              <Text className={`text-xs font-semibold ${item.active ? 'text-primary' : 'text-text-secondary'}`}>
                {item.active ? 'Active' : 'Inactive'}
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          !loading ? <Text className="p-4 text-center text-sm text-text-secondary">No gift cards yet.</Text> : null
        }
      />
    </SafeAreaView>
  );
}
