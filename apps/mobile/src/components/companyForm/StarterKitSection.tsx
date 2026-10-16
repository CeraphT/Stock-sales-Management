import type { StarterKitDraft } from '@stockflow/core/setup/starterKit';
import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';
import { useIsTablet } from '@/lib/useIsTablet';

/* Mobile twin of apps/web/src/components/companyForm/StarterKitSection.tsx: the
 * wizard's last step (content created with the shop), editable before creation. */

/** Names as removable chips plus an "add" field (submit or +). */
export function EditableChips({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const colors = useThemeColors();
  const [input, setInput] = useState('');
  const add = () => {
    const name = input.trim();
    if (!name) return;
    if (!values.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...values, name]);
    setInput('');
  };
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <Pressable
          key={v}
          onPress={() => onChange(values.filter((x) => x !== v))}
          className="flex-row items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-1 pl-3 pr-2">
          <Text className="text-sm text-primary">{v}</Text>
          <Text className="text-xs text-primary/70">✕</Text>
        </Pressable>
      ))}
      <View className="flex-row items-center gap-1">
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={add}
          blurOnSubmit={false}
          returnKeyType="done"
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          className="h-9 w-44 rounded-full border border-border bg-surface px-3 text-sm text-text-primary"
        />
        <Pressable onPress={add} disabled={!input.trim()} className={`h-9 justify-center rounded-full border border-border px-3 ${input.trim() ? '' : 'opacity-40'}`}>
          <Text className="text-sm font-semibold text-primary">+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{children}</Text>;
}

function Toggle({ title, hint, value, onChange }: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  const colors = useThemeColors();
  return (
    <View className="flex-1 gap-1 rounded-xl border border-border bg-surface p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-sm font-semibold text-text-primary">{title}</Text>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} />
      </View>
      <Text className="text-xs text-text-secondary">{hint}</Text>
    </View>
  );
}

export function StarterKitSection({
  draft, onChange, demoNames, servicesOn,
}: { draft: StarterKitDraft; onChange: (d: StarterKitDraft) => void; demoNames: string[]; servicesOn: boolean }) {
  const { t } = useTranslation();
  const isTablet = useIsTablet();
  return (
    <View className="gap-3">
      <Text className="text-sm text-text-secondary">{t('kit.intro')}</Text>
      <View className="gap-1.5">
        <Label>{`🗂️ ${t('kit.categories')} (${draft.categories.length})`}</Label>
        <EditableChips values={draft.categories} onChange={(categories) => onChange({ ...draft, categories })} placeholder={t('kit.addCategory')} />
      </View>
      <View className="gap-1.5">
        <Label>{`🧾 ${t('kit.services')} (${servicesOn ? draft.services.length : 0})`}</Label>
        {servicesOn ? (
          <>
            <EditableChips
              values={draft.services.map((s) => s.name)}
              onChange={(names) => onChange({ ...draft, services: names.map((n) => draft.services.find((s) => s.name === n) ?? { name: n, category: null }) })}
              placeholder={t('kit.addService')}
            />
            <Text className="text-xs text-text-secondary">{t('kit.servicesHint')}</Text>
          </>
        ) : (
          <Text className="text-xs text-text-secondary">{t('kit.servicesOff')}</Text>
        )}
      </View>
      <View className={isTablet ? 'flex-row gap-3' : 'gap-3'}>
        <Toggle title={`🚚 ${t('kit.supplier')}`} hint={t('kit.supplierHint')} value={draft.defaultSupplier} onChange={(v) => onChange({ ...draft, defaultSupplier: v })} />
        <Toggle
          title={`🎁 ${t('kit.demo')} (${demoNames.length})`}
          hint={`${t('kit.demoHint')} ${demoNames.join(', ')}`}
          value={draft.demoProducts}
          onChange={(v) => onChange({ ...draft, demoProducts: v })}
        />
      </View>
    </View>
  );
}
