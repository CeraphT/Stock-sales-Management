import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

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
import { toast } from '@/lib/ui/toastStore';

type Tab = 'business' | 'tax' | 'rewards' | 'rules';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'business', label: 'Business', icon: '🏢' },
  { id: 'tax', label: 'Tax & currency', icon: '💱' },
  { id: 'rewards', label: 'Loyalty & rewards', icon: '🎁' },
  { id: 'rules', label: 'Data-entry rules', icon: '📋' },
];

export default function MyBusinessScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currentLocationId = useAuthStore((s) => s.locationId);
  const setLocation = useAuthStore((s) => s.setLocation);
  const colors = useThemeColors();
  const [switchingLocationId, setSwitchingLocationId] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('business');
  const [company, setCompany] = useState<CompanyResponse | null>(null);
  const [locations, setLocations] = useState<LocationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [taxRegime, setTaxRegime] = useState(0); // 0 = Standard/VAT, 1 = Flat tax
  const [flatTaxAmount, setFlatTaxAmount] = useState('');
  const [flatTaxPeriod, setFlatTaxPeriod] = useState(1);
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [rewardEnabled, setRewardEnabled] = useState(false);
  const [rewardCount, setRewardCount] = useState('');
  const [rewardValue, setRewardValue] = useState('');
  const [servicesModuleEnabled, setServicesModuleEnabled] = useState(false);
  const [lowStock, setLowStock] = useState('');

  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [addingBranch, setAddingBranch] = useState(false);

  // VAT is on iff the rate > 0; remember the last non-zero rate so toggling back
  // on restores it (mirrors desktop).
  const lastTaxRate = useRef('19.25');
  const taxOn = Number(taxRate) > 0;
  const toggleTax = (on: boolean) => {
    if (!on) {
      if (Number(taxRate) > 0) lastTaxRate.current = taxRate;
      setTaxRate('0');
    } else {
      setTaxRate(Number(lastTaxRate.current) > 0 ? lastTaxRate.current : '19.25');
    }
  };

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [c, locs] = await Promise.all([companiesApi.get(companyId), locationsApi.list(companyId)]);
      setCompany(c);
      setLocations(locs);
      setName(c.name);
      setDescription(c.description ?? '');
      setCurrency(c.currency);
      setTaxRate(String(c.defaultTaxRatePercent));
      if (c.defaultTaxRatePercent > 0) lastTaxRate.current = String(c.defaultTaxRatePercent);
      setTaxRegime(c.taxRegime);
      setFlatTaxAmount(String(c.flatTaxAmount));
      setFlatTaxPeriod(c.flatTaxPeriod);
      setTaxId(c.taxId ?? '');
      setAddress(c.address ?? '');
      setPhone(c.phone ?? '');
      setReceiptFooter(c.receiptFooter ?? '');
      setRewardEnabled(c.rewardProgramEnabled);
      setRewardCount(String(c.rewardPurchaseCount));
      setRewardValue(String(c.rewardGiftCardValue));
      setServicesModuleEnabled(c.servicesModuleEnabled);
      setLowStock(String(c.defaultLowStockThreshold));
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
    if (!companyId || !company) return;
    if (!name.trim()) {
      showAlert('Missing name', 'Enter a business name.');
      return;
    }
    setSaving(true);
    try {
      // Spread carries preserved fields (logoUrl, setupCompleted, loyalty-point
      // config which is hidden per the value model); the explicit fields below
      // are the ones this screen owns.
      const updated = await companiesApi.update(companyId, {
        ...company,
        name: name.trim(),
        description: description.trim() || null,
        currency: currency.trim() || 'XAF',
        defaultTaxRatePercent: Number(taxRate || '0'),
        taxRegime,
        flatTaxAmount: Number(flatTaxAmount || '0'),
        flatTaxPeriod,
        taxId: taxId.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        receiptFooter: receiptFooter.trim() || null,
        rewardProgramEnabled: rewardEnabled,
        rewardPurchaseCount: Number(rewardCount) || 10,
        rewardGiftCardValue: Number(rewardValue) || 0,
        servicesModuleEnabled,
        defaultLowStockThreshold: Number(lowStock || '0'),
      });
      setCompany(updated);
      await syncNow().catch(() => {});
      toast('Settings saved.', 'success');
    } catch (err) {
      showAlert('Could not save', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const onSwitchBranch = (location: LocationResponse) => {
    if (location.id === currentLocationId) return;
    showAlert('Switch branch?', `This device will operate against "${location.name}" — sales, stock, and cash register all switch to it.`, [
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
    ]);
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
          <Text className="text-lg font-bold text-text-primary">Company settings</Text>
          <View className="w-12" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pt-3">
          {TABS.map((x) => (
            <Pressable
              key={x.id}
              onPress={() => setTab(x.id)}
              className={`rounded-full border px-3 py-1.5 ${tab === x.id ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
              <Text className={`text-xs font-semibold ${tab === x.id ? 'text-primary' : 'text-text-secondary'}`}>
                {x.icon} {x.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5 pb-10" keyboardShouldPersistTaps="handled">
        {tab === 'business' ? (
          <>
            <View className="flex-row items-center justify-between rounded-xl bg-surface p-3.5">
              <View className="flex-1 pr-2">
                <Text className="text-xs uppercase tracking-wide text-text-secondary">Invite code</Text>
                <Text className="mt-1 text-lg font-bold tracking-widest text-primary">{company.uniqueCode}</Text>
                <Text className="text-[11px] text-text-secondary">Share this so a teammate can join your company.</Text>
              </View>
              <Pressable
                onPress={async () => {
                  const Clipboard = await import('expo-clipboard');
                  await Clipboard.setStringAsync(company.uniqueCode);
                  toast('Invite code copied.', 'success');
                }}
                className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-background active:opacity-80">
                <Ionicons name="copy-outline" size={18} color={colors.icon} />
              </Pressable>
            </View>

            <TextField label="Business name" value={name} onChangeText={setName} />
            <TextField label="Description" value={description} onChangeText={setDescription} />
            <TextField label="Address" placeholder="Shown on receipts & purchase orders" value={address} onChangeText={setAddress} />
            <TextField label="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <TextField label="Receipt footer message" placeholder="e.g. Thank you for your business!" value={receiptFooter} onChangeText={setReceiptFooter} />
            <TextField label="Taxpayer number (NIU)" placeholder="Your NIU — shown on tax invoices" value={taxId} onChangeText={setTaxId} />

            {/* Branches (mobile multi-branch — desktop switches via its top bar). */}
            <Text className="mt-2 text-sm font-bold text-text-primary">Branches</Text>
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
          </>
        ) : null}

        {tab === 'tax' ? (
          <>
            <TextField label="Currency" autoCapitalize="characters" value={currency} onChangeText={setCurrency} />
            <View className="gap-3 rounded-xl bg-surface p-3.5">
              <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Tax regime</Text>
              <View className="flex-row gap-2">
                <ChoiceButton active={taxRegime === 0} label="Standard (collects VAT)" onPress={() => { setTaxRegime(0); if (Number(taxRate) <= 0) toggleTax(true); }} />
                <ChoiceButton active={taxRegime === 1} label="Flat tax (impôt libératoire)" onPress={() => { setTaxRegime(1); setTaxRate('0'); }} />
              </View>

              {taxRegime === 0 ? (
                <View className="mt-1 gap-2 border-t border-border/60 pt-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 pr-2 text-sm font-semibold text-text-primary">🧾 Apply VAT (TVA) on sales</Text>
                    <Switch value={taxOn} onValueChange={toggleTax} trackColor={{ true: colors.primary }} />
                  </View>
                  <Text className="text-xs text-text-secondary">
                    When on, every sale extracts the VAT portion (prices are VAT-inclusive) and it shows on receipts, reports and the tax declaration.
                  </Text>
                  {taxOn ? <TextField label="VAT rate %" keyboardType="numeric" value={taxRate} onChangeText={setTaxRate} /> : null}
                </View>
              ) : (
                <View className="mt-1 gap-2 border-t border-border/60 pt-3">
                  <Text className="text-xs text-text-secondary">
                    Under impôt libératoire you charge no VAT; you pay a flat lump-sum tax set by your commune. It appears in the tax declaration.
                  </Text>
                  <TextField label={`Flat tax amount (${currency || 'XAF'})`} keyboardType="numeric" value={flatTaxAmount} onChangeText={setFlatTaxAmount} />
                  <View>
                    <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">Period</Text>
                    <View className="flex-row gap-2">
                      {[{ v: 0, l: 'Monthly' }, { v: 1, l: 'Quarterly' }, { v: 2, l: 'Yearly' }].map((p) => (
                        <ChoiceButton key={p.v} active={flatTaxPeriod === p.v} label={p.l} onPress={() => setFlatTaxPeriod(p.v)} />
                      ))}
                    </View>
                  </View>
                </View>
              )}
            </View>
          </>
        ) : null}

        {tab === 'rewards' ? (
          <View className="gap-3 rounded-xl bg-surface p-3.5">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 pr-2 text-sm font-semibold text-text-primary">🎁 Purchase-reward gift cards</Text>
              <Switch value={rewardEnabled} onValueChange={setRewardEnabled} trackColor={{ true: colors.primary }} />
            </View>
            <Text className="text-xs text-text-secondary">
              Every Nth completed purchase, the customer earns a fixed-value gift card. The cashier is prompted at checkout to issue and print it.
            </Text>
            {rewardEnabled ? (
              <>
                <TextField label="Reward every N purchases" keyboardType="numeric" value={rewardCount} onChangeText={setRewardCount} />
                <TextField label={`Gift card value (${currency || 'XAF'})`} keyboardType="numeric" value={rewardValue} onChangeText={setRewardValue} />
              </>
            ) : null}
          </View>
        ) : null}

        {tab === 'rules' ? (
          <>
            <TextField label="Default low-stock threshold" placeholder="Prefilled on new products" keyboardType="numeric" value={lowStock} onChangeText={setLowStock} />
            <View className="flex-row items-center justify-between rounded-xl bg-surface p-3.5">
              <View className="flex-1 pr-2">
                <Text className="text-sm font-semibold text-text-primary">Services module</Text>
                <Text className="text-xs text-text-secondary">Lets sales include billed services (e.g. maternity care) alongside products.</Text>
              </View>
              <Switch value={servicesModuleEnabled} onValueChange={setServicesModuleEnabled} trackColor={{ true: colors.primary }} />
            </View>
          </>
        ) : null}

        <Button title={saving ? 'Saving…' : 'Save settings'} loading={saving} onPress={onSave} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ChoiceButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-lg border px-3 py-2 ${active ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
      <Text className={`text-center text-xs font-semibold ${active ? 'text-primary' : 'text-text-secondary'}`}>{label}</Text>
    </Pressable>
  );
}
