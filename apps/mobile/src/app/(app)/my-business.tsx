import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { SkeletonDetail } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import type { CompanyResponse, LocationResponse } from '@/lib/api/types/auth';
import { companiesApi } from '@/lib/api/endpoints/companies';
import { locationsApi } from '@/lib/api/endpoints/locations';
import { useAuthStore } from '@/lib/auth/store';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

export default function MyBusinessScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currentLocationId = useAuthStore((s) => s.locationId);
  const setLocation = useAuthStore((s) => s.setLocation);
  const colors = useThemeColors();
  const [switchingLocationId, setSwitchingLocationId] = useState<string | null>(null);

  const [company, setCompany] = useState<CompanyResponse | null>(null);
  const [locations, setLocations] = useState<LocationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyEarnRate, setLoyaltyEarnRate] = useState('');
  const [loyaltyPointValue, setLoyaltyPointValue] = useState('');
  const [servicesModuleEnabled, setServicesModuleEnabled] = useState(false);

  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [addingBranch, setAddingBranch] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [companyResult, locationsResult] = await Promise.all([
        companiesApi.get(companyId),
        locationsApi.list(companyId),
      ]);
      setCompany(companyResult);
      setLocations(locationsResult);
      setName(companyResult.name);
      setDescription(companyResult.description ?? '');
      setCurrency(companyResult.currency);
      setTaxRate(String(companyResult.defaultTaxRatePercent));
      setLoyaltyEnabled(companyResult.loyaltyEnabled);
      setLoyaltyEarnRate(String(companyResult.loyaltyEarnRateAmount));
      setLoyaltyPointValue(String(companyResult.loyaltyPointValue));
      setServicesModuleEnabled(companyResult.servicesModuleEnabled);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onSave = async () => {
    if (!companyId) return;
    if (!name.trim()) {
      showAlert('Missing name', 'Enter a business name.');
      return;
    }
    const earnRate = Number(loyaltyEarnRate || '0');
    const pointValue = Number(loyaltyPointValue || '0');
    if (earnRate <= 0 || pointValue <= 0) {
      showAlert('Invalid loyalty settings', 'Earn rate and point value must both be greater than zero.');
      return;
    }
    if (!company) return;
    setSaving(true);
    try {
      // Pass through the fields this screen doesn't yet edit (reward/profile/tax
      // regime) from the loaded company, so the update stays complete. Phase 3
      // of the desktop→mobile parity work adds real UI for these.
      const updated = await companiesApi.update(companyId, {
        ...company,
        name: name.trim(),
        description: description.trim() || null,
        currency: currency.trim() || 'XAF',
        defaultTaxRatePercent: Number(taxRate || '0'),
        loyaltyEnabled,
        loyaltyEarnRateAmount: earnRate,
        loyaltyPointValue: pointValue,
        servicesModuleEnabled,
      });
      setCompany(updated);
      showAlert('Saved', 'Business settings updated.');
    } catch (err) {
      showAlert('Could not save', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const onSwitchBranch = (location: LocationResponse) => {
    if (location.id === currentLocationId) return;
    showAlert(
      'Switch branch?',
      `This device will operate against "${location.name}" — sales, stock, and cash register status all switch to that branch.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            setSwitchingLocationId(location.id);
            try {
              setLocation({ locationId: location.id, locationName: location.name });
              await syncNow();
              showAlert('Switched', `Now operating at "${location.name}".`);
            } catch (err) {
              showAlert('Sync failed after switching', err instanceof Error ? err.message : 'Something went wrong.');
            } finally {
              setSwitchingLocationId(null);
            }
          },
        },
      ],
    );
  };

  const onAddBranch = async () => {
    if (!companyId || !newBranchName.trim()) return;
    setAddingBranch(true);
    try {
      await locationsApi.create(companyId, { name: newBranchName.trim(), address: newBranchAddress.trim() || null });
      setNewBranchName('');
      setNewBranchAddress('');
      setLocations(await locationsApi.list(companyId));
    } catch (err) {
      showAlert('Could not add branch', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setAddingBranch(false);
    }
  };

  if (loading || !company) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <ScreenBackground />
        <SkeletonDetail />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">My business</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        <View className="rounded-xl bg-surface p-3.5">
          <Text className="text-xs uppercase tracking-wide text-text-secondary">Join code</Text>
          <Text className="mt-1 text-lg font-bold tracking-widest text-primary">{company.uniqueCode}</Text>
        </View>

        <TextField label="Business name" value={name} onChangeText={setName} />
        <TextField label="Description" value={description} onChangeText={setDescription} />
        <TextField label="Currency" autoCapitalize="characters" value={currency} onChangeText={setCurrency} />
        <TextField label="Default tax rate (%)" keyboardType="numeric" value={taxRate} onChangeText={setTaxRate} />

        <View className="flex-row items-center justify-between rounded-xl bg-surface p-3.5">
          <Text className="text-sm font-semibold text-text-primary">Loyalty program enabled</Text>
          <Switch value={loyaltyEnabled} onValueChange={setLoyaltyEnabled} trackColor={{ true: '#4F46E5' }} />
        </View>
        <TextField
          label="Loyalty earn rate (amount spent per point)"
          keyboardType="numeric"
          value={loyaltyEarnRate}
          onChangeText={setLoyaltyEarnRate}
        />
        <TextField
          label="Loyalty point value (store credit per point)"
          keyboardType="numeric"
          value={loyaltyPointValue}
          onChangeText={setLoyaltyPointValue}
        />

        <View className="flex-row items-center justify-between rounded-xl bg-surface p-3.5">
          <View className="flex-1 pr-2">
            <Text className="text-sm font-semibold text-text-primary">Services module enabled</Text>
            <Text className="text-xs text-text-secondary">Lets sales include billed services (e.g. maternity care) alongside products.</Text>
          </View>
          <Switch value={servicesModuleEnabled} onValueChange={setServicesModuleEnabled} trackColor={{ true: '#4F46E5' }} />
        </View>

        <Button title={saving ? 'Saving…' : 'Save changes'} loading={saving} onPress={onSave} />

        <Text className="mt-4 text-sm font-bold text-text-primary">Branches</Text>
        <Text className="-mt-2 text-xs text-text-secondary">Tap a branch to switch this device to it.</Text>
        {locations.map((location) => {
          const isCurrent = location.id === currentLocationId;
          const isSwitching = switchingLocationId === location.id;
          return (
            <Pressable
              key={location.id}
              onPress={() => onSwitchBranch(location)}
              disabled={isSwitching}
              className={`flex-row items-center justify-between rounded-xl p-3.5 ${isCurrent ? 'border border-primary bg-primary/10' : 'bg-surface'}`}>
              <View className="flex-1 pr-2">
                <Text className="text-sm font-semibold text-text-primary">{location.name}</Text>
                <Text className="text-xs text-text-secondary">{location.address ?? 'No address on file'}</Text>
              </View>
              {isSwitching ? (
                <ActivityIndicator />
              ) : isCurrent ? (
                <View className="flex-row items-center gap-1 rounded-full bg-primary px-2.5 py-1">
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                  <Text className="text-xs font-semibold text-white">Current</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}

        <View className="gap-2 rounded-xl bg-surface p-3.5">
          <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Add a branch</Text>
          <TextInput
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
            placeholder="Branch name"
            placeholderTextColor={colors.placeholder}
            value={newBranchName}
            onChangeText={setNewBranchName}
          />
          <TextInput
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
            placeholder="Address (optional)"
            placeholderTextColor={colors.placeholder}
            value={newBranchAddress}
            onChangeText={setNewBranchAddress}
          />
          <Pressable
            onPress={onAddBranch}
            disabled={!newBranchName.trim() || addingBranch}
            className="flex-row items-center justify-center gap-1 rounded-lg bg-primary py-2.5 disabled:opacity-50">
            {addingBranch ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="add" size={16} color="#FFFFFF" />}
            <Text className="text-sm font-semibold text-white">Add branch</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
