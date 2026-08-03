import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { PackagingLevelRequest } from '@/lib/api/types/catalog';
import { useThemeColors } from '@/lib/theme/colors';

export interface DraftPackagingLevel {
  unitName: string;
  quantityInBaseUnits: string;
  salePriceOverride: string;
}

export const emptyPackagingLevel = (): DraftPackagingLevel => ({ unitName: '', quantityInBaseUnits: '', salePriceOverride: '' });

/** Validates + converts draft rows to what the API expects. Returns `null`
 * (with an alert-ready message) if any row is incomplete/invalid. */
export function parsePackagingLevels(levels: DraftPackagingLevel[]): { ok: true; value: PackagingLevelRequest[] } | { ok: false; message: string } {
  const parsed: PackagingLevelRequest[] = [];
  for (const level of levels) {
    if (!level.unitName.trim() && !level.quantityInBaseUnits.trim()) continue; // skip fully-blank rows
    if (!level.unitName.trim()) return { ok: false, message: 'Every packaging level needs a name (e.g. "Box of 10").' };
    const qty = Number(level.quantityInBaseUnits);
    if (!Number.isInteger(qty) || qty <= 1) {
      return { ok: false, message: `"${level.unitName}" needs a whole-number size greater than 1 unit.` };
    }
    const override = level.salePriceOverride.trim() ? Number(level.salePriceOverride) : null;
    if (override != null && (!Number.isFinite(override) || override < 0)) {
      return { ok: false, message: `"${level.unitName}"'s price override must be zero or positive.` };
    }
    parsed.push({ unitName: level.unitName.trim(), quantityInBaseUnits: qty, salePriceOverride: override });
  }
  return { ok: true, value: parsed };
}

/** Add/edit/remove UI for a product's packaging levels ("sub-products" —
 * Box of 10, Blister of 4, etc.), each optionally overriding the sale
 * price instead of just multiplying the base unit price. Shared by
 * add-product.tsx (create) and product-detail.tsx (edit) — the API
 * replaces a product's whole packaging-level list by name on every save,
 * so both screens must always send the complete current list, never a
 * partial diff. */
export function PackagingLevelsEditor({
  levels,
  onChange,
  currency,
}: {
  levels: DraftPackagingLevel[];
  onChange: (levels: DraftPackagingLevel[]) => void;
  currency: string;
}) {
  const colors = useThemeColors();

  const addLevel = () => onChange([...levels, emptyPackagingLevel()]);
  const updateLevel = (index: number, patch: Partial<DraftPackagingLevel>) =>
    onChange(levels.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const removeLevel = (index: number) => onChange(levels.filter((_, i) => i !== index));

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Packaging levels (optional)</Text>
        <Pressable onPress={addLevel} accessibilityLabel="Add packaging level" hitSlop={8}>
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {levels.length === 0 ? (
        <Text className="text-xs text-text-secondary">
          Sells only as a single base unit. Add a level if this product is also sold as a box, blister, or case.
        </Text>
      ) : null}

      {levels.map((level, index) => (
        <View key={index} className="gap-2 rounded-xl bg-surface p-3.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-text-secondary">Level {index + 1}</Text>
            <Pressable onPress={() => removeLevel(index)} hitSlop={8} accessibilityLabel="Remove packaging level">
              <Ionicons name="close-circle-outline" size={18} color={colors.error} />
            </Pressable>
          </View>
          <TextInput
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
            placeholder="Name, e.g. Box of 10"
            placeholderTextColor={colors.placeholder}
            value={level.unitName}
            onChangeText={(v) => updateLevel(index, { unitName: v })}
          />
          <View className="flex-row gap-2">
            <TextInput
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
              placeholder="Base units inside"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={level.quantityInBaseUnits}
              onChangeText={(v) => updateLevel(index, { quantityInBaseUnits: v })}
            />
            <TextInput
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
              placeholder={`Price override (${currency})`}
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={level.salePriceOverride}
              onChangeText={(v) => updateLevel(index, { salePriceOverride: v })}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
