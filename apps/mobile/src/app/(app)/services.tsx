import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { SkeletonList } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import { companiesApi } from '@/lib/api/endpoints/companies';
import { servicesApi } from '@/lib/api/endpoints/services';
import type { ServiceRequest, ServiceResponse } from '@/lib/api/types/services';
import type { ProductSearchResult } from '@/lib/api/types/catalog';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { localCatalogQueryService } from '@/lib/local/catalogQueryService';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

interface DraftStockLink {
  productId: string;
  name: string;
  quantity: string;
}

const emptyDraft = { name: '', fixedPrice: '', category: '' };

export default function ServicesScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictCatalog));
  const currency = useCompanyCurrency();
  const colors = useThemeColors();

  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [services, setServices] = useState<ServiceResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [stockLinks, setStockLinks] = useState<DraftStockLink[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [company, serviceList] = await Promise.all([companiesApi.get(companyId), servicesApi.list(companyId)]);
      setModuleEnabled(company.servicesModuleEnabled);
      setServices(serviceList);
    } catch (err) {
      showAlert('Could not load services', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const resetForm = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setStockLinks([]);
    setProductQuery('');
    setProductResults([]);
    setShowForm(false);
  };

  const startEdit = (service: ServiceResponse) => {
    setEditingId(service.id);
    setDraft({ name: service.name, fixedPrice: String(service.fixedPrice), category: service.category ?? '' });
    setStockLinks(
      service.stockLinks.map((l) => ({ productId: l.productId, name: l.productName, quantity: String(l.quantityConsumedInBaseUnits) })),
    );
    setShowForm(true);
  };

  const runProductSearch = async (text: string) => {
    setProductQuery(text);
    if (!companyId || !text.trim()) {
      setProductResults([]);
      return;
    }
    setProductResults(await localCatalogQueryService.searchProducts(companyId, text.trim()));
  };

  const addStockLink = (product: ProductSearchResult) => {
    if (stockLinks.some((l) => l.productId === product.productId)) return;
    setStockLinks((prev) => [...prev, { productId: product.productId, name: product.name, quantity: '1' }]);
    setProductQuery('');
    setProductResults([]);
  };

  const updateStockLink = (productId: string, quantity: string) => {
    setStockLinks((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  };

  const removeStockLink = (productId: string) => {
    setStockLinks((prev) => prev.filter((l) => l.productId !== productId));
  };

  const onSave = async () => {
    if (!companyId) return;
    if (!draft.name.trim()) {
      showAlert('Missing name', 'Enter a service name.');
      return;
    }
    const price = Number(draft.fixedPrice);
    if (!Number.isFinite(price) || price < 0) {
      showAlert('Invalid price', 'Enter a valid, non-negative price.');
      return;
    }
    const parsedLinks = stockLinks.map((l) => ({ productId: l.productId, quantityConsumedInBaseUnits: Number(l.quantity) }));
    if (parsedLinks.some((l) => !Number.isInteger(l.quantityConsumedInBaseUnits) || l.quantityConsumedInBaseUnits <= 0)) {
      showAlert('Invalid quantity', 'Every consumed-stock line needs a positive whole-number quantity.');
      return;
    }

    const body: ServiceRequest = {
      name: draft.name.trim(),
      fixedPrice: price,
      category: draft.category.trim() || null,
      stockLinks: parsedLinks.length > 0 ? parsedLinks : null,
    };

    setSaving(true);
    try {
      if (editingId) {
        await servicesApi.update(companyId, editingId, body);
      } else {
        await servicesApi.create(companyId, body);
      }
      resetForm();
      await refresh();
    } catch (err) {
      showAlert('Could not save service', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const onToggleActive = async (service: ServiceResponse) => {
    if (!companyId) return;
    try {
      await servicesApi.setActive(companyId, service.id, { active: !service.active });
      await refresh();
    } catch (err) {
      showAlert('Could not update service', err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Services</Text>
          <Pressable
            onPress={() => (showForm ? resetForm() : setShowForm(true))}
            hitSlop={8}
            accessibilityLabel="Add service">
            <Ionicons name={showForm ? 'close' : 'add'} size={24} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {moduleEnabled === false ? (
        <View className="m-4 gap-2 rounded-xl bg-accent-amber-soft p-4">
          <Text className="text-sm font-bold text-text-primary">Services module is off</Text>
          <Text className="text-xs text-text-secondary">
            Turn it on from More → My business to let sales include billed services alongside products.
          </Text>
          <Pressable onPress={() => router.push('/my-business')} className="self-start rounded-lg bg-primary px-3 py-1.5">
            <Text className="text-xs font-semibold text-white">Open My business</Text>
          </Pressable>
        </View>
      ) : null}

      {showForm ? (
        <ScrollView className="max-h-[70%] border-b border-border bg-surface" contentContainerClassName="gap-3 p-4" keyboardShouldPersistTaps="handled">
          <TextField label="Service name" value={draft.name} onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))} />
          <TextField
            label={`Price (${currency})`}
            keyboardType="numeric"
            value={draft.fixedPrice}
            onChangeText={(v) => setDraft((d) => ({ ...d, fixedPrice: v }))}
          />
          <TextField label="Category (optional)" value={draft.category} onChangeText={(v) => setDraft((d) => ({ ...d, category: v }))} />

          <View className="gap-1.5">
            <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">
              Stock consumed per service (optional)
            </Text>
            <TextInput
              className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
              placeholder="Search product to consume from stock"
              placeholderTextColor={colors.placeholder}
              value={productQuery}
              onChangeText={runProductSearch}
              autoCapitalize="none"
            />
            {productResults.length > 0 ? (
              <View className="rounded-xl border border-border bg-background">
                {productResults.map((r, index) => (
                  <Pressable
                    key={r.productId}
                    onPress={() => addStockLink(r)}
                    className={`px-3.5 py-3 ${index < productResults.length - 1 ? 'border-b border-border' : ''}`}>
                    <Text className="text-sm font-semibold text-text-primary">{r.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {stockLinks.map((link) => (
            <View key={link.productId} className="flex-row items-center gap-2 rounded-xl bg-background p-3">
              <Text className="flex-1 text-sm text-text-primary">{link.name}</Text>
              <TextInput
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1.5 text-center text-sm text-text-primary"
                keyboardType="numeric"
                value={link.quantity}
                onChangeText={(v) => updateStockLink(link.productId, v)}
              />
              <Pressable onPress={() => removeStockLink(link.productId)} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={20} color={colors.error} />
              </Pressable>
            </View>
          ))}

          <Button title={saving ? 'Saving…' : editingId ? 'Save changes' : 'Create service'} loading={saving} onPress={onSave} />
        </ScrollView>
      ) : null}

      {loading ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={services}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 p-4"
          refreshing={false}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <Pressable onPress={() => startEdit(item)} className="rounded-2xl bg-surface p-3.5 shadow-sm shadow-black/5">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-semibold text-text-primary">{item.name}</Text>
                  <Text className="text-xs text-text-secondary">
                    {formatCurrency(item.fixedPrice, currency)}
                    {item.category ? ` · ${item.category}` : ''}
                    {item.stockLinks.length > 0 ? ` · consumes ${item.stockLinks.length} product${item.stockLinks.length === 1 ? '' : 's'}` : ''}
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
            </Pressable>
          )}
          ListEmptyComponent={
            !loading ? <Text className="p-4 text-center text-sm text-text-secondary">No services yet.</Text> : null
          }
        />
      )}
    </SafeAreaView>
  );
}
