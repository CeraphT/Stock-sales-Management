import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { ScreenBackground } from '@/components/ScreenBackground';
import { NetworkError } from '@/lib/api/client';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';
import { supportApi } from '@stockflow/core/api/endpoints/support';
import { SupportTicketStatus, type MySupportTicketDetail } from '@stockflow/core/api/types/support';

/** One of the user's support requests: the conversation with support, and a
 * reply box. Opening it marks support's reply as read (clears the pop-up /
 * badge); replying to a resolved request reopens it. */
export default function SupportTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [ticket, setTicket] = useState<MySupportTicketDetail | null>(null);
  const [offline, setOffline] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setTicket(await supportApi.mineDetail(id));
      setOffline(false);
    } catch (err) {
      if (err instanceof NetworkError) setOffline(true);
      else showAlert(t('support.failed'), err instanceof Error ? err.message : '');
    }
  }, [id, t]);
  useEffect(() => {
    load();
  }, [load]);

  const resolved = ticket && (ticket.status === SupportTicketStatus.Resolved || ticket.status === SupportTicketStatus.Closed);

  const onSend = async () => {
    if (!id || !reply.trim()) return;
    setSending(true);
    try {
      await supportApi.mineReply(id, reply.trim());
      setReply('');
      toast(resolved ? t('support.reopened') : t('support.replySent'), 'success');
      await load();
    } catch (err) {
      showAlert(t('support.failed'), err instanceof NetworkError ? t('support.mineOffline') : err instanceof Error ? err.message : '');
    } finally {
      setSending(false);
    }
  };

  const statusKey = (s: SupportTicketStatus) =>
    (['support.status.open', 'support.status.inProgress', 'support.status.resolved', 'support.status.closed'] as const)[s] ?? 'support.status.open';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-3 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="flex-1 px-3 text-center text-base font-bold text-text-primary" numberOfLines={1}>
            {ticket?.title ?? t('support.title')}
          </Text>
          <View className="w-12" />
        </View>
      </View>

      {!ticket ? (
        offline ? (
          <Text className="mt-10 px-6 text-center text-sm text-text-secondary">{t('support.mineOffline')}</Text>
        ) : (
          <ActivityIndicator className="mt-10" color={colors.primary} />
        )
      ) : (
        <ScrollView contentContainerClassName="gap-3 p-5" keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center gap-2">
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: (resolved ? colors.success : colors.accentAmber) + '22' }}>
              <Text className="text-[11px] font-bold" style={{ color: resolved ? colors.success : colors.accentAmber }}>
                {t(statusKey(ticket.status))}
              </Text>
            </View>
            <Text className="text-xs text-text-secondary">{new Date(ticket.createdAt).toLocaleString()}</Text>
          </View>

          {/* The original request, then the conversation. */}
          <View className="self-end rounded-2xl rounded-tr-sm bg-primary/10 p-3" style={{ maxWidth: '88%' }}>
            <Text className="text-sm text-text-primary">{ticket.description}</Text>
            {ticket.attachmentCount > 0 ? (
              <Text className="mt-1 text-[11px] text-text-secondary">{ticket.attachmentCount} 🖼</Text>
            ) : null}
          </View>
          {ticket.messages.map((m) => (
            <View
              key={m.id}
              className={`rounded-2xl p-3 ${m.fromSupport ? 'self-start rounded-tl-sm border border-border bg-surface' : 'self-end rounded-tr-sm bg-primary/10'}`}
              style={{ maxWidth: '88%' }}>
              {m.fromSupport ? <Text className="mb-0.5 text-[11px] font-bold text-primary">{t('support.reply')}</Text> : null}
              <Text className="text-sm text-text-primary">{m.body}</Text>
              <Text className="mt-1 text-[10px] text-text-secondary">{new Date(m.createdAt).toLocaleString()}</Text>
            </View>
          ))}

          <View className="mt-2 gap-2">
            {resolved ? <Text className="text-xs text-text-secondary">{t('support.replyReopens')}</Text> : null}
            <TextInput
              className="min-h-[90px] rounded-xl border border-border bg-surface p-3 text-sm text-text-primary"
              multiline
              textAlignVertical="top"
              placeholder={t('support.replyPlaceholder')}
              placeholderTextColor={colors.placeholder}
              value={reply}
              onChangeText={setReply}
            />
            <Button title={t('support.sendReply')} loading={sending} onPress={onSend} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
