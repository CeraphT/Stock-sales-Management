import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { SkeletonList } from '@/components/Skeleton';
import { useCompanyInfo } from '@/lib/hooks/useCompanyInfo';
import { printingService } from '@/lib/printer/printingService';
import type { PrinterDevice } from '@/lib/printer/types';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function PrinterSettingsScreen() {
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [selected, setSelected] = useState<PrinterDevice | null>(null);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [current, discovered] = await Promise.all([
        printingService.getSelectedPrinter(),
        printingService.discoverAll(),
      ]);
      setSelected(current);
      setDevices(discovered);
    } catch (err) {
      showAlert(t('printer.scanFailed'), err instanceof Error ? err.message : t('common.somethingWrong'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onSelect = async (device: PrinterDevice) => {
    await printingService.selectPrinter(device);
    setSelected(device);
    const authorized = await printingService.ensureDeviceAuthorized(device);
    if (authorized) {
      showAlert(t('printer.selected'), t('printer.selectedBody').replace('{name}', device.name));
    } else {
      showAlert(
        t('printer.selected'),
        t('printer.selectedNoAccess').replace('{name}', device.name),
      );
    }
  };

  const onPairBluetooth = async () => {
    await printingService.openBluetoothPairingSettings();
  };

  const onDisconnect = () => {
    if (!selected) return;
    showAlert(t('printer.removeTitle'), t('printer.removeBody').replace('{name}', selected.name), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('printer.remove'),
        style: 'destructive',
        onPress: async () => {
          await printingService.clearSelectedPrinter();
          setSelected(null);
        },
      },
    ]);
  };

  const onTestPrint = async () => {
    if (!selected) return;
    setTesting(true);
    try {
      await printingService.printTestPage(selected, companyName, currency);
      showAlert(t('printer.testSent'), t('printer.testSentBody'));
    } catch (err) {
      showAlert(t('printer.testFailed'), err instanceof Error ? err.message : t('common.somethingWrong'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('printer.title')}</Text>
          <Pressable onPress={refresh} hitSlop={8}>
            <Ionicons name="refresh" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View className="p-5 pb-0">
        <View className="flex-row items-center justify-between rounded-2xl bg-surface p-4">
          <View className="flex-1 pr-3">
            <Text className="text-xs uppercase tracking-wide text-text-secondary">{t('printer.current')}</Text>
            <Text className="mt-1 text-base font-bold text-text-primary">
              {selected ? `${selected.name} (${selected.connectionType})` : t('printer.noneSelected')}
            </Text>
          </View>
          {selected ? (
            <Pressable onPress={onDisconnect} hitSlop={8} accessibilityLabel={t('printer.removeA11y')}>
              <Ionicons name="close-circle-outline" size={22} color={colors.error} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center justify-between px-5 pt-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('printer.available')}</Text>
      </View>

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => `${item.connectionType}:${item.id}`}
          contentContainerClassName="gap-2 p-5"
          refreshing={false}
          onRefresh={refresh}
          renderItem={({ item }) => {
            const isSelected = selected?.id === item.id && selected?.connectionType === item.connectionType;
            return (
              <Pressable
                onPress={() => onSelect(item)}
                className={`rounded-xl border p-3.5 ${isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}>
                <Text className="text-sm font-semibold text-text-primary">{item.name}</Text>
                <Text className="text-xs text-text-secondary">{item.connectionType}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text className="p-4 text-center text-sm text-text-secondary">{t('printer.noneFound')}</Text>
          }
        />
      )}

      <View className="gap-3 border-t border-border bg-surface p-5">
        <Button title={t('printer.pairBluetooth')} variant="secondary" onPress={onPairBluetooth} />
        <Button
          title={testing ? t('printer.printing') : t('printer.testPage')}
          loading={testing}
          disabled={!selected || testing}
          onPress={onTestPrint}
        />
      </View>
    </SafeAreaView>
  );
}
