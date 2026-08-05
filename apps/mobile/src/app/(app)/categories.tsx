import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { useFeatureGuard } from '@/lib/hooks/useFeatureGuard';
import { BackButton } from '@/components/BackButton';
import { ApiError } from '@/lib/api/client';
import { categoriesApi } from '@/lib/api/endpoints/categories';
import type { CategoryResponse } from '@/lib/api/types/catalog';
import { useAuthStore } from '@/lib/auth/store';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

export default function CategoriesScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  useFeatureGuard(useAuthStore((s) => s.user?.restrictCatalog));
  const colors = useThemeColors();

  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setCategories(await categoriesApi.list(companyId));
    } catch (err) {
      showAlert('Could not load categories', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onCreate = async () => {
    if (!companyId || !newName.trim()) return;
    setCreating(true);
    try {
      await categoriesApi.create(companyId, { name: newName.trim() });
      setNewName('');
      await refresh();
      await syncNow();
    } catch (err) {
      showAlert('Could not create category', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const onRename = async (id: string) => {
    if (!companyId || !editValue.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await categoriesApi.update(companyId, id, { name: editValue.trim() });
      setEditId(null);
      await refresh();
      await syncNow();
    } catch (err) {
      showAlert('Could not rename category', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSavingEdit(false);
    }
  };

  const onDelete = (category: CategoryResponse) => {
    showAlert('Delete category?', `"${category.name}" will be removed. Products keep their other details.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!companyId) return;
          try {
            await categoriesApi.delete(companyId, category.id);
            await refresh();
            await syncNow();
          } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Something went wrong.';
            showAlert('Could not delete category', message);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Categories</Text>
          <View className="w-12" />
        </View>
      </View>

      <View className="flex-row items-center gap-2 p-4">
        <TextInput
          className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 text-base text-text-primary"
          placeholder="New category name"
          placeholderTextColor={colors.placeholder}
          value={newName}
          onChangeText={setNewName}
          returnKeyType="done"
          onSubmitEditing={onCreate}
        />
        <Pressable
          onPress={onCreate}
          disabled={!newName.trim() || creating}
          accessibilityLabel="Add category"
          className="h-12 w-12 items-center justify-center rounded-xl bg-primary active:opacity-90 disabled:opacity-50">
          {creating ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="add" size={22} color="#FFFFFF" />}
        </Pressable>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-2 px-4 pb-4"
        refreshing={loading}
        onRefresh={refresh}
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-2 rounded-xl bg-surface p-3.5">
            {editId === item.id ? (
              <>
                <TextInput
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                  value={editValue}
                  onChangeText={setEditValue}
                  autoFocus
                  placeholderTextColor={colors.placeholder}
                  returnKeyType="done"
                  onSubmitEditing={() => onRename(item.id)}
                />
                <Pressable
                  onPress={() => onRename(item.id)}
                  disabled={savingEdit || !editValue.trim()}
                  hitSlop={6}
                  accessibilityLabel="Save"
                  className="h-8 w-8 items-center justify-center">
                  {savingEdit ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </Pressable>
                <Pressable onPress={() => setEditId(null)} hitSlop={6} accessibilityLabel="Cancel" className="h-8 w-8 items-center justify-center">
                  <Ionicons name="close" size={20} color={colors.iconMuted} />
                </Pressable>
              </>
            ) : (
              <>
                <Text className="flex-1 text-sm font-semibold text-text-primary">{item.name}</Text>
                <Pressable
                  onPress={() => {
                    setEditId(item.id);
                    setEditValue(item.name);
                  }}
                  hitSlop={6}
                  accessibilityLabel="Rename"
                  className="h-8 w-8 items-center justify-center">
                  <Ionicons name="pencil" size={17} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => onDelete(item)} hitSlop={6} accessibilityLabel="Delete" className="h-8 w-8 items-center justify-center">
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </>
            )}
          </View>
        )}
        ListEmptyComponent={
          !loading ? <Text className="p-4 text-center text-sm text-text-secondary">No categories yet.</Text> : null
        }
      />
    </SafeAreaView>
  );
}
