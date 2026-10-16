import { offlineWrites } from '@stockflow/core/local/offlineWrites';
import { starterKitDraft } from '@stockflow/core/setup/starterKit';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { EditableChips } from '@/components/companyForm/StarterKitSection';
import { BUSINESS_PRESETS } from '@/lib/businessTypes';
import type { TranslationKey } from '@/lib/i18n/translations';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { afterOfflineWrite } from '@/lib/sync/afterOfflineWrite';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';
import { useBusinessType } from '@/lib/useCapabilities';

/** "Suggested categories" for an existing shop: the business type's starter
 * categories not yet in the shop, editable, created through the offline outbox
 * (works without network, sent at the next sync). Mobile twin of the web one. */
export function SuggestedCategories({ companyId, existing, onCreated }: { companyId: string; existing: string[]; onCreated: () => void }) {
  const { t, language } = useTranslation();
  const businessType = useBusinessType();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const have = new Set(existing.map((n) => n.trim().toLowerCase()));
  const suggestFor = (bt: string | null) => starterKitDraft(bt, language).categories.filter((n) => !have.has(n.toLowerCase()));

  const start = () => {
    setType(businessType);
    setNames(suggestFor(businessType));
    setOpen(true);
  };

  const create = async () => {
    setSaving(true);
    let done = 0;
    try {
      for (const name of names) {
        if (have.has(name.toLowerCase())) continue;
        await offlineWrites.createCategory(companyId, { name });
        done++;
      }
      toast(`${t('kit.createdCats')}: ${done}`, 'success');
      setOpen(false);
      onCreated();
      afterOfflineWrite({ queued: t('offline.queued'), rejected: t('offline.rejected') });
    } catch (e) {
      showAlert(t('kit.failed'), e instanceof Error ? e.message : t('kit.offline'));
    } finally {
      setSaving(false);
    }
  };

  if (!open)
    return (
      <Pressable onPress={start} className="px-4 pt-3">
        <Text className="text-sm font-semibold text-primary">✨ {t('kit.suggestedOpen')}</Text>
      </Pressable>
    );

  return (
    <View className="mx-4 mt-3 gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
      <Text className="text-sm font-semibold text-text-primary">✨ {t('kit.suggestedTitle')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
        {BUSINESS_PRESETS.map((p) => {
          const active = (type ?? 'general') === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                setType(p.id);
                setNames(suggestFor(p.id));
              }}
              className={`rounded-full border px-3 py-1.5 ${active ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}>
              <Text className={`text-xs ${active ? 'font-bold text-primary' : 'text-text-secondary'}`}>
                {p.icon} {t(`biz.preset.${p.id}` as TranslationKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {names.length === 0 ? <Text className="text-xs text-text-secondary">{t('kit.suggestedNone')}</Text> : null}
      <EditableChips values={names} onChange={setNames} placeholder={t('kit.addCategory')} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button title={t('kit.cancel')} variant="ghost" onPress={() => setOpen(false)} />
        </View>
        <View className="flex-1">
          <Button title={`${t('kit.create')} (${names.length})`} onPress={create} loading={saving} disabled={names.length === 0} />
        </View>
      </View>
    </View>
  );
}
