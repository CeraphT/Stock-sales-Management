import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { SkeletonDetail } from '@/components/Skeleton';
import {
  CapabilitiesSection,
  ContactSection,
  CountrySection,
  IdentitySection,
  RewardsSection,
  RulesSection,
  TaxSection,
} from '@/components/companyForm/CompanyFormSections';
import { useCompanyForm } from '@/components/companyForm/useCompanyForm';
import type { CompanyResponse, LocationResponse } from '@/lib/api/types/auth';
import { companiesApi } from '@/lib/api/endpoints/companies';
import { locationsApi } from '@/lib/api/endpoints/locations';
import { chooseLocation } from '@/lib/auth/session';
import { useAuthStore } from '@/lib/auth/store';
import type { TranslationKey } from '@/lib/i18n/translations';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { syncNow } from '@/lib/sync/syncNow';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';

type Tab = 'business' | 'tax' | 'rewards' | 'manage' | 'rules';
const TABS: { id: Tab; key: TranslationKey; icon: string }[] = [
  { id: 'business', key: 'biz.tab.business', icon: '🏢' },
  { id: 'tax', key: 'biz.tab.tax', icon: '💱' },
  { id: 'rewards', key: 'biz.tab.rewards', icon: '🎁' },
  { id: 'manage', key: 'biz.tab.manage', icon: '📦' },
  { id: 'rules', key: 'biz.tab.rules', icon: '📋' },
];

/** "My business": the same fields as the shop-creation wizard (shared
 * companyForm sections), so whatever was entered at creation shows here and
 * saves directly. Plus the invite code and the branch list (switch / add). */
export default function MyBusinessScreen() {
  const { t } = useTranslation();
  const companyId = useAuthStore((s) => s.companyId);
  const currentLocationId = useAuthStore((s) => s.locationId);
  const colors = useThemeColors();
  const f = useCompanyForm();

  const [tab, setTab] = useState<Tab>('business');
  const [company, setCompany] = useState<CompanyResponse | null>(null);
  const [locations, setLocations] = useState<LocationResponse[]>([]);
  const [services, setServices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switchingLocationId, setSwitchingLocationId] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [addingBranch, setAddingBranch] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [c, locs] = await Promise.all([companiesApi.get(companyId), locationsApi.list(companyId)]);
      setCompany(c);
      setLocations(locs);
      f.load(c);
      setServices(c.servicesModuleEnabled);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onSave = async () => {
    if (!companyId || !company) return;
    if (!f.name.trim()) {
      showAlert(t('biz.title'), t('biz.missingName'));
      return;
    }
    setSaving(true);
    try {
      const updated = await companiesApi.update(
        companyId,
        // Loyalty points are hidden but preserved; the logo is edited on web/desktop.
        f.toRequest({
          loyaltyEnabled: company.loyaltyEnabled,
          loyaltyEarnRateAmount: company.loyaltyEarnRateAmount,
          loyaltyPointValue: company.loyaltyPointValue,
          servicesModuleEnabled: services,
          setupCompleted: company.setupCompleted,
        }),
      );
      setCompany(updated);
      await syncNow().catch(() => {});
      toast(t('biz.saved'), 'success');
    } catch (err) {
      showAlert(t('biz.saveFailed'), err instanceof Error ? err.message : '');
    } finally {
      setSaving(false);
    }
  };

  const onSwitchBranch = (location: LocationResponse) => {
    if (location.id === currentLocationId || !companyId) return;
    showAlert(t('biz.switchTitle'), `${t('biz.switchBody')} "${location.name}".`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('biz.switch'),
        onPress: async () => {
          setSwitchingLocationId(location.id);
          try {
            chooseLocation(companyId, location);
            await syncNow();
            toast(`${t('biz.switched')} "${location.name}".`, 'success');
          } catch (err) {
            showAlert(t('biz.switchFailed'), err instanceof Error ? err.message : '');
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
      showAlert(t('biz.addBranchFailed'), err instanceof Error ? err.message : '');
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
          <Text className="text-lg font-bold text-text-primary">{t('biz.title')}</Text>
          <View className="w-12" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pt-3">
          {TABS.map((x) => (
            <Pressable
              key={x.id}
              onPress={() => setTab(x.id)}
              className={`rounded-full border px-3 py-1.5 ${tab === x.id ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
              <Text className={`text-xs font-semibold ${tab === x.id ? 'text-primary' : 'text-text-secondary'}`}>
                {x.icon} {t(x.key)}
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
                <Text className="text-xs uppercase tracking-wide text-text-secondary">{t('biz.invite')}</Text>
                <Text className="mt-1 text-lg font-bold tracking-widest text-primary">{company.uniqueCode}</Text>
                <Text className="text-[11px] text-text-secondary">{t('biz.inviteHint')}</Text>
              </View>
              <Pressable
                onPress={async () => {
                  const Clipboard = await import('expo-clipboard');
                  await Clipboard.setStringAsync(company.uniqueCode);
                  toast(t('biz.inviteCopied'), 'success');
                }}
                className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-background active:opacity-80">
                <Ionicons name="copy-outline" size={18} color={colors.icon} />
              </Pressable>
            </View>

            <IdentitySection f={f} />
            <ContactSection f={f} />

            <Text className="mt-2 text-sm font-bold text-text-primary">{t('biz.branches')}</Text>
            <Text className="-mt-2 text-xs text-text-secondary">{t('biz.branchesHint')}</Text>
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
                    <Text className="text-xs text-text-secondary">{location.address ?? t('biz.noAddress')}</Text>
                  </View>
                  {isSwitching ? (
                    <ActivityIndicator />
                  ) : isCurrent ? (
                    <View className="flex-row items-center gap-1 rounded-full bg-primary px-2.5 py-1">
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      <Text className="text-xs font-semibold text-white">{t('biz.current')}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
            <View className="gap-2 rounded-xl bg-surface p-3.5">
              <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('biz.addBranch')}</Text>
              <TextInput
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                placeholder={t('biz.branchName')}
                placeholderTextColor={colors.placeholder}
                value={newBranchName}
                onChangeText={setNewBranchName}
              />
              <TextInput
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                placeholder={t('biz.branchAddress')}
                placeholderTextColor={colors.placeholder}
                value={newBranchAddress}
                onChangeText={setNewBranchAddress}
              />
              <Pressable
                onPress={onAddBranch}
                disabled={!newBranchName.trim() || addingBranch}
                className="flex-row items-center justify-center gap-1 rounded-lg bg-primary py-2.5 disabled:opacity-50">
                {addingBranch ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="add" size={16} color="#FFFFFF" />}
                <Text className="text-sm font-semibold text-white">{t('biz.addBranch')}</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {tab === 'tax' ? (
          <>
            <CountrySection f={f} />
            <TaxSection f={f} />
          </>
        ) : null}
        {tab === 'rewards' ? <RewardsSection f={f} /> : null}
        {tab === 'manage' ? <CapabilitiesSection f={f} /> : null}
        {tab === 'rules' ? <RulesSection f={f} services={services} onServices={setServices} /> : null}

        <Button title={saving ? t('common.saving') : t('biz.save')} loading={saving} onPress={onSave} />
      </ScrollView>
    </SafeAreaView>
  );
}
