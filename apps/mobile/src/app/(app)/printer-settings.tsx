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

export default function PrinterSettingsScreen() {
  const { name: companyName, currency } = useCompanyInfo();
  const colors = useThemeColors();

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
      showAlert('Could not scan for printers', err instanceof Error ? err.message : 'Something went wrong.');
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
      showAlert('Printer selected', `"${device.name}" is now the default receipt printer.`);
    } else {
      showAlert(
        'Printer selected',
        `"${device.name}" is saved as the default printer, but access wasn't granted — it will be requested again at the first print.`,
      );
    }
  };

  const onPairBluetooth = async () => {
    await printingService.openBluetoothPairingSettings();
  };

  const onDisconnect = () => {
    if (!selected) return;
    showAlert('Remove this printer?', `"${selected.name}" will no longer be the default receipt printer.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
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
      showAlert('Test page sent', 'Check the printer output.');
    } catch (err) {
      showAlert('Test print failed', err instanceof Error ? err.message : 'Something went wrong.');
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
          <Text className="text-lg font-bold text-text-primary">Receipt printer</Text>
          <Pressable onPress={refresh} hitSlop={8}>
            <Ionicons name="refresh" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View className="p-5 pb-0">
        <View className="flex-row items-center justify-between rounded-2xl bg-surface p-4">
          <View className="flex-1 pr-3">
            <Text className="text-xs uppercase tracking-wide text-text-secondary">Current printer</Text>
            <Text className="mt-1 text-base font-bold text-text-primary">
              {selected ? `${selected.name} (${selected.connectionType})` : 'No printer selected'}
            </Text>
          </View>
          {selected ? (
            <Pressable onPress={onDisconnect} hitSlop={8} accessibilityLabel="Remove printer">
              <Ionicons name="close-circle-outline" size={22} color={colors.error} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center justify-between px-5 pt-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Available devices</Text>
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
            <Text className="p-4 text-center text-sm text-text-secondary">
              No printers found. Pair a Bluetooth printer in Android settings, or plug in a USB printer, then refresh.
            </Text>
          }
        />
      )}

      <View className="gap-3 border-t border-border bg-surface p-5">
        <Button title="Pair a Bluetooth device" variant="secondary" onPress={onPairBluetooth} />
        <Button
          title={testing ? 'Printing…' : 'Print a test page'}
          loading={testing}
          disabled={!selected || testing}
          onPress={onTestPrint}
        />
      </View>
    </SafeAreaView>
  );
}
