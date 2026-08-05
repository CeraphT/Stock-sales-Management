import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { useAuthStore } from '@/lib/auth/store';
import { localShiftService } from '@/lib/local/shiftService';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';

/**
 * Start-of-day freeze for cashiers. While a cashier has no open shift this is
 * the ONLY thing rendered inside (app) — no tabs, no drawer, no sale — so the
 * day cannot begin until the opening cash float is recorded. Admins are never
 * gated. Mirrors desktop's RegisterGate.
 */
export function RegisterGate({ onOpened }: { onOpened: () => void }) {
  const companyId = useAuthStore((s) => s.companyId);
  const locationId = useAuthStore((s) => s.locationId);
  const clear = useAuthStore((s) => s.clear);
  const colors = useThemeColors();

  const [openingCash, setOpeningCash] = useState('');
  const [busy, setBusy] = useState(false);

  const onOpen = async () => {
    if (busy || !companyId || !locationId) return;
    const amount = Number(openingCash || '0');
    if (Number.isNaN(amount) || amount < 0) {
      showAlert('Invalid amount', 'Enter a valid opening cash amount.');
      return;
    }
    setBusy(true);
    try {
      await localShiftService.openShift(companyId, locationId, amount);
      toast('Cash register opened.', 'success');
      onOpened();
    } catch (err) {
      showAlert('Could not open the register', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Open the cash register"
      subtitle="Record the cash you're starting the day with. The app stays locked until the register is open.">
      <View className="gap-1.5">
        <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Opening cash float</Text>
        <TextInput
          className="rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary"
          placeholder="0"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
          value={openingCash}
          onChangeText={setOpeningCash}
        />
      </View>
      <View className="mt-4">
        <Button title={busy ? 'Opening…' : 'Open register'} loading={busy} onPress={onOpen} />
      </View>
      <Pressable
        onPress={() => {
          clear();
          router.replace('/');
        }}
        className="mt-3 items-center py-1">
        <Text className="text-xs font-medium text-text-secondary">Log out</Text>
      </Pressable>
    </AuthLayout>
  );
}
