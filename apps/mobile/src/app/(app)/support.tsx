import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { ScreenBackground } from '@/components/ScreenBackground';
import { NetworkError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/store';
import { devicePlatform } from '@/lib/device';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useLastScreen } from '@/lib/support/lastScreen';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';
import { supportApi } from '@stockflow/core/api/endpoints/support';
import {
  SupportTicketCategory,
  SupportTicketStatus,
  type SupportAttachmentUpload,
  type SupportTicketSummary,
} from '@stockflow/core/api/types/support';
import {
  SUPPORT_MAX_IMAGE_BYTES,
  SUPPORT_MAX_IMAGES,
  SUPPORT_MAX_TOTAL_BYTES,
  submitSupportTicket,
} from '@stockflow/core/support/submitSupportTicket';

type Picked = SupportAttachmentUpload & { uri: string; size: number };

const CATEGORIES: { value: SupportTicketCategory; key: 'support.cat.bug' | 'support.cat.blocked' | 'support.cat.question'; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: SupportTicketCategory.Bug, key: 'support.cat.bug', icon: 'bug-outline' },
  { value: SupportTicketCategory.Blocked, key: 'support.cat.blocked', icon: 'hand-left-outline' },
  { value: SupportTicketCategory.Question, key: 'support.cat.question', icon: 'help-circle-outline' },
];

/** In-app Support: report a bug / a blocking problem / a question with
 * screenshots. Context (app version, device, the screen the user came from,
 * business, user) is attached automatically. Offline, the request is queued
 * and sent with the next sync. "My requests" shows status + the reply. */
export default function SupportScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const companyId = useAuthStore((s) => s.companyId);
  const lastScreen = useLastScreen((s) => s.path);

  const [tab, setTab] = useState<'new' | 'mine'>('new');
  const [category, setCategory] = useState<SupportTicketCategory>(SupportTicketCategory.Bug);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<Picked[]>([]);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);

  const [mine, setMine] = useState<SupportTicketSummary[] | null>(null);
  const [mineOffline, setMineOffline] = useState(false);

  const loadMine = useCallback(async () => {
    try {
      setMine(await supportApi.mine());
      setMineOffline(false);
    } catch (err) {
      if (err instanceof NetworkError) setMineOffline(true);
      setMine((m) => m ?? []);
    }
  }, []);
  useEffect(() => {
    if (tab === 'mine') loadMine();
  }, [tab, loadMine]);

  const pickImages = async () => {
    setPicking(true);
    try {
      const DocumentPicker = await import('expo-document-picker');
      const { File } = await import('expo-file-system');
      const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      const next = [...images];
      for (const asset of res.assets) {
        if (next.length >= SUPPORT_MAX_IMAGES) {
          toast(t('support.tooManyImages').replace('{max}', String(SUPPORT_MAX_IMAGES)), 'error');
          break;
        }
        const file = new File(asset.uri);
        const size = asset.size ?? file.size ?? 0;
        if (size > SUPPORT_MAX_IMAGE_BYTES) {
          toast(t('support.imageTooBig').replace('{name}', asset.name), 'error');
          continue;
        }
        next.push({
          uri: asset.uri,
          size,
          fileName: asset.name,
          contentType: asset.mimeType ?? 'image/jpeg',
          dataBase64: await file.base64(),
        });
      }
      if (next.reduce((s, i) => s + i.size, 0) > SUPPORT_MAX_TOTAL_BYTES) {
        toast(t('support.imagesTooBigTotal'), 'error');
        return;
      }
      setImages(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('support.pickFailed'), 'error');
    } finally {
      setPicking(false);
    }
  };

  const onSubmit = async () => {
    if (!description.trim()) {
      showAlert(t('support.missingTitle'), t('support.missingMsg'));
      return;
    }
    setSending(true);
    try {
      const result = await submitSupportTicket(
        {
          category,
          description: description.trim(),
          platform: devicePlatform,
          appVersion: Constants.expoConfig?.version ?? null,
          deviceInfo: `${Platform.OS} ${Platform.Version} · ${Device.manufacturer ?? ''} ${Device.modelName ?? ''}`.trim(),
          screen: lastScreen,
          attachments: images.map(({ fileName, contentType, dataBase64 }) => ({ fileName, contentType, dataBase64 })),
        },
        { companyId, canQueueOffline: true },
      );
      toast(result === 'sent' ? t('support.sent') : t('support.queued'), result === 'sent' ? 'success' : 'info');
      setDescription('');
      setImages([]);
      setTab('mine');
    } catch (err) {
      showAlert(t('support.failed'), err instanceof NetworkError ? t('support.offlineNoCompany') : err instanceof Error ? err.message : '');
    } finally {
      setSending(false);
    }
  };

  const statusStyle = (s: SupportTicketStatus) =>
    s === SupportTicketStatus.Resolved || s === SupportTicketStatus.Closed
      ? { bg: colors.success + '22', fg: colors.success }
      : s === SupportTicketStatus.InProgress
        ? { bg: colors.accentBlue + '22', fg: colors.accentBlue }
        : { bg: colors.accentAmber + '22', fg: colors.accentAmber };
  const statusKey = (s: SupportTicketStatus) =>
    (['support.status.open', 'support.status.inProgress', 'support.status.resolved', 'support.status.closed'] as const)[s] ?? 'support.status.open';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-3 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('support.title')}</Text>
          <View className="w-12" />
        </View>
        <View className="mt-3 flex-row gap-2">
          {(['new', 'mine'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setTab(k)}
              className={`flex-1 items-center rounded-full border py-2 ${tab === k ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
              <Text className={`text-xs font-bold ${tab === k ? 'text-primary' : 'text-text-secondary'}`}>
                {t(k === 'new' ? 'support.tabNew' : 'support.tabMine')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'new' ? (
        <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
          <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('support.typeLabel')}</Text>
          <View className="flex-row gap-2">
            {CATEGORIES.map((c) => {
              const active = c.value === category;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  className={`flex-1 items-center gap-1 rounded-xl border p-3 ${active ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}>
                  <Ionicons name={c.icon} size={20} color={active ? colors.primary : colors.iconMuted} />
                  <Text className={`text-xs font-semibold ${active ? 'text-primary' : 'text-text-secondary'}`}>{t(c.key)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('support.describeLabel')}</Text>
          <TextInput
            className="min-h-[140px] rounded-xl border border-border bg-surface p-3.5 text-sm text-text-primary"
            multiline
            textAlignVertical="top"
            placeholder={t('support.describePlaceholder')}
            placeholderTextColor={colors.placeholder}
            value={description}
            onChangeText={setDescription}
          />

          <View className="flex-row flex-wrap gap-2">
            {images.map((img, i) => (
              <View key={img.uri} className="relative">
                <Image source={{ uri: img.uri }} style={{ width: 84, height: 84, borderRadius: 10 }} />
                <Pressable
                  onPress={() => setImages((list) => list.filter((_, j) => j !== i))}
                  hitSlop={6}
                  className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-error">
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
            {images.length < SUPPORT_MAX_IMAGES ? (
              <Pressable
                onPress={pickImages}
                disabled={picking}
                className="h-[84px] w-[84px] items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface active:opacity-70">
                {picking ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="image-outline" size={22} color={colors.primary} />}
                <Text className="text-[10px] font-semibold text-primary">{t('support.addImage')}</Text>
              </Pressable>
            ) : null}
          </View>

          <View className="flex-row items-start gap-2 rounded-xl bg-primary/5 p-3">
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text className="flex-1 text-xs text-text-secondary">
              {t('support.contextNote').replace('{screen}', lastScreen ?? '—')}
            </Text>
          </View>

          <Button title={t('support.send')} loading={sending} onPress={onSubmit} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerClassName="gap-2 p-5">
          {mineOffline ? <Text className="text-center text-xs text-text-secondary">{t('support.mineOffline')}</Text> : null}
          {mine === null ? (
            <ActivityIndicator className="mt-10" color={colors.primary} />
          ) : mine.length === 0 ? (
            <Text className="mt-10 text-center text-sm text-text-secondary">{t('support.mineEmpty')}</Text>
          ) : (
            mine.map((tk) => {
              const st = statusStyle(tk.status);
              return (
                <View key={tk.id} className="gap-1.5 rounded-xl border border-border bg-surface p-4">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm font-bold text-text-primary" numberOfLines={2}>
                      {tk.title}
                    </Text>
                    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: st.bg }}>
                      <Text className="text-[11px] font-bold" style={{ color: st.fg }}>{t(statusKey(tk.status))}</Text>
                    </View>
                  </View>
                  <Text className="text-xs text-text-secondary">
                    {new Date(tk.createdAt).toLocaleString()}
                    {tk.attachmentCount > 0 ? ` · ${tk.attachmentCount} 🖼` : ''}
                  </Text>
                  {tk.adminReply ? (
                    <View className="mt-1 rounded-lg bg-primary/5 p-3">
                      <Text className="text-[11px] font-bold text-primary">{t('support.reply')}</Text>
                      <Text className="mt-0.5 text-sm text-text-primary">{tk.adminReply}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
