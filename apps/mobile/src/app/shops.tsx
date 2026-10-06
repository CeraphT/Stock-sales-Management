import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/Button';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ScreenBackground } from '@/components/ScreenBackground';
import { TextField } from '@/components/TextField';
import {
  BusinessTypeSection,
  CapabilitiesSection,
  ContactSection,
  CountrySection,
  IdentitySection,
  RewardsSection,
  RulesSection,
  TaxSection,
} from '@/components/companyForm/CompanyFormSections';
import { useCompanyForm } from '@/components/companyForm/useCompanyForm';
import { ApiError } from '@/lib/api/client';
import { companiesApi } from '@/lib/api/endpoints/companies';
import { MembershipStatus, UserRole } from '@/lib/api/enums';
import type { LocationResponse } from '@/lib/api/types/auth';
import { chooseLocation, openShop } from '@/lib/auth/session';
import { useAuthStore } from '@/lib/auth/store';
import { deviceName, devicePlatform } from '@/lib/device';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';
import { useIsTablet } from '@/lib/useIsTablet';
import { membershipsApi } from '@stockflow/core/api/endpoints/memberships';
import type { MyCompanyResponse } from '@stockflow/core/api/types/membership';

type Panel = 'create' | 'join';
type Step = 0 | 1 | 2;

const cardStyle = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 };

/**
 * "My shops": the person's shops (open in one tap), plus Create (3-step wizard
 * over the My business fields) and Join (code → request the manager accepts).
 * Tablet: two columns like the web (create/join left, shops right). Phone: one
 * column, shops first.
 */
export default function ShopsScreen() {
  const { t } = useTranslation();
  const isTablet = useIsTablet();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [panel, setPanel] = useState<Panel>('create');
  const [opening, setOpening] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ companyId: string; locations: LocationResponse[] } | null>(null);

  const { data: shops, isLoading, refetch } = useQuery({
    queryKey: ['my-companies'],
    queryFn: () => membershipsApi.myCompanies(),
    // Picks up a join request being accepted without a manual refresh.
    refetchInterval: 30_000,
  });

  const open = async (companyId: string, discardUnsynced = false) => {
    if (opening) return;
    setOpening(companyId);
    try {
      const r = await openShop(companyId, { discardUnsynced });
      if (r.kind === 'opened') router.replace('/dashboard');
      else if (r.kind === 'pickLocation') setBranches({ companyId, locations: r.locations });
      else
        showAlert(t('shops.unsentTitle'), `${r.count} ${t('shops.unsentBody')}`, [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('shops.eraseOpen'),
            style: 'destructive',
            onPress: () => {
              setOpening(null);
              void open(companyId, true);
            },
          },
        ]);
    } catch (e) {
      showAlert(t('shops.yours'), e instanceof ApiError ? e.message : t('shops.openFailed'));
    } finally {
      setOpening(null);
    }
  };

  const logout = () => {
    clear();
    router.replace('/login' as never);
  };

  const shopsCard = (
    <View className="gap-3 rounded-card border border-border bg-surface p-4" style={cardStyle}>
      <Text className="text-base font-bold text-text-primary">
        {t('shops.yours')} {shops ? `(${shops.length})` : ''}
      </Text>
      {isLoading ? (
        <ActivityIndicator />
      ) : !shops || shops.length === 0 ? (
        <View className="items-center rounded-xl border border-dashed border-border p-6">
          <Text className="text-3xl">🏪</Text>
          <Text className="mt-2 text-center text-sm text-text-secondary">{t('shops.empty')}</Text>
        </View>
      ) : (
        shops.map((s) => <ShopRow key={s.companyId} shop={s} busy={opening === s.companyId} onOpen={() => void open(s.companyId)} />)
      )}
    </View>
  );

  const actionsCard = (
    <View className="gap-3 rounded-card border border-border bg-surface p-4" style={cardStyle}>
      <View className="flex-row rounded-full border border-border bg-background p-1">
        {(['create', 'join'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPanel(p)}
            accessibilityRole="tab"
            accessibilityState={{ selected: panel === p }}
            className={`flex-1 items-center rounded-full py-2.5 ${panel === p ? 'bg-primary' : ''}`}>
            <Text className={`text-sm font-semibold ${panel === p ? 'text-white' : 'text-text-secondary'}`}>
              {p === 'create' ? `➕ ${t('shops.tabCreate')}` : `🔑 ${t('shops.tabJoin')}`}
            </Text>
          </Pressable>
        ))}
      </View>
      {panel === 'create' ? (
        <CreateShopWizard onCreated={(id) => void open(id)} />
      ) : (
        <JoinShop onJoined={() => void refetch()} onOpen={(id) => void open(id)} />
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <ScreenBackground />
      <SafeAreaView className="flex-1">
        <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
          <BrandLogo size={40} />
          <View className="flex-1">
            <Text className="text-lg font-extrabold text-text-primary" numberOfLines={1}>
              {t('shops.hello')}, {(user?.name ?? '').split(' ')[0]} 👋
            </Text>
            <Text className="text-xs text-text-secondary" numberOfLines={2}>
              {t('shops.subtitle')}
            </Text>
          </View>
          <LanguageToggle />
          <Pressable onPress={logout} className="rounded-full border border-border bg-surface px-3 py-2 active:opacity-80">
            <Text className="text-xs font-bold text-text-secondary">{t('shops.logout')}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerClassName="gap-3 px-4 pb-6" keyboardShouldPersistTaps="handled">
          {isTablet ? (
            <View className="flex-row items-start gap-4">
              {/* The forms get three times the room of the shop list (3 : 1). */}
              <View style={{ flex: 3 }}>{actionsCard}</View>
              <View style={{ flex: 1 }}>{shopsCard}</View>
            </View>
          ) : (
            <>
              {shopsCard}
              {actionsCard}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={!!branches} transparent animationType="fade" onRequestClose={() => setBranches(null)}>
        <View className="flex-1 items-center justify-center bg-black/40 p-5">
          <View className="w-full gap-3 rounded-card bg-surface p-5" style={{ maxWidth: 420 }}>
            <Text className="text-base font-bold text-text-primary">{t('shops.branchTitle')}</Text>
            <Text className="text-xs text-text-secondary">{t('shops.branchSub')}</Text>
            {branches?.locations.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => {
                  chooseLocation(branches.companyId, l);
                  setBranches(null);
                  router.replace('/dashboard');
                }}
                className="flex-row items-center gap-3 rounded-xl border border-border px-3 py-3 active:bg-primary/10">
                <Text className="text-lg">📍</Text>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-text-primary">{l.name}</Text>
                  {l.address ? <Text className="text-xs text-text-secondary">{l.address}</Text> : null}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ShopRow({ shop, busy, onOpen }: { shop: MyCompanyResponse; busy: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  const usable = shop.status === MembershipStatus.Active && shop.companyActive;
  const badge =
    shop.status === MembershipStatus.Pending
      ? { text: t('shops.pending'), cls: 'bg-accent-amber/15', txt: 'text-accent-amber' }
      : shop.status === MembershipStatus.Disabled
        ? { text: t('shops.disabled'), cls: 'bg-error/10', txt: 'text-error' }
        : !shop.companyActive
          ? { text: t('shops.inactive'), cls: 'bg-error/10', txt: 'text-error' }
          : null;
  const meta = [
    shop.role === UserRole.CompanyAdmin ? t('shops.manager') : t('shops.cashier'),
    shop.currency,
    shop.locationCount > 1 ? `${shop.locationCount} ${t('shops.branches')}` : null,
    shop.uniqueCode ? `${t('shops.code')} ${shop.uniqueCode}` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onOpen}
      disabled={!usable || busy}
      className={`flex-row items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 active:border-primary ${usable ? '' : 'opacity-70'}`}>
      <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
        {shop.logoUrl ? <Image source={{ uri: shop.logoUrl }} style={{ width: 44, height: 44 }} /> : <Text className="text-xl">🏪</Text>}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-text-primary" numberOfLines={1}>
          {shop.name}
        </Text>
        <Text className="text-xs text-text-secondary" numberOfLines={1}>
          {meta.join(' · ')}
        </Text>
        {badge ? (
          <View className={`mt-1 self-start rounded-full px-2 py-0.5 ${badge.cls}`}>
            <Text className={`text-[11px] font-semibold ${badge.txt}`}>{badge.text}</Text>
          </View>
        ) : null}
      </View>
      {shop.pendingRequests > 0 ? (
        <View className="rounded-full bg-accent-amber px-2 py-0.5">
          <Text className="text-[11px] font-bold text-white">
            {shop.pendingRequests} {shop.pendingRequests === 1 ? t('shops.request') : t('shops.requests')}
          </Text>
        </View>
      ) : null}
      {busy ? <ActivityIndicator /> : usable ? <Text className="text-lg text-text-secondary">→</Text> : null}
    </Pressable>
  );
}

/** General → The shop → Equipment, with Next / Next / Create (step pills tappable too). */
function CreateShopWizard({ onCreated }: { onCreated: (companyId: string) => void }) {
  const { t } = useTranslation();
  const isTablet = useIsTablet();
  const f = useCompanyForm();
  const deviceId = useAuthStore((s) => s.deviceId);
  const [step, setStep] = useState<Step>(0);
  const [preset, setPreset] = useState<string | null>(null);
  const [services, setServices] = useState(false);
  const [saving, setSaving] = useState(false);

  const STEPS = [
    { label: t('wizard.general'), icon: '🏷️' },
    { label: t('wizard.shop'), icon: '🏪' },
    { label: t('wizard.equipment'), icon: '🧰' },
  ];

  const create = async () => {
    if (!f.name.trim()) {
      setStep(0);
      showAlert(t('shops.tabCreate'), t('wizard.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const res = await companiesApi.createForAccount({
        name: f.name.trim(),
        description: f.description.trim() || null,
        currency: f.currency || 'XAF',
        deviceId,
        deviceName,
        platform: devicePlatform,
        capabilities: f.capabilities,
        settings: f.toRequest({
          loyaltyEnabled: false,
          loyaltyEarnRateAmount: 0,
          loyaltyPointValue: 0,
          servicesModuleEnabled: services,
          // Configured here, so the post-creation setup wizard never shows.
          setupCompleted: true,
        }),
      });
      toast(`${t('wizard.created')}: ${res.company.name}`, 'success');
      onCreated(res.company.id);
    } catch (e) {
      showAlert(t('shops.tabCreate'), e instanceof ApiError ? e.message : t('wizard.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <Pressable
            key={s.label}
            onPress={() => setStep(i as Step)}
            className={`rounded-full border px-3 py-1.5 ${step === i ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
            <Text className={`text-xs font-semibold ${step === i ? 'text-primary' : 'text-text-secondary'}`}>
              {s.icon} {i + 1}. {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {step === 0 ? (
        <>
          <BusinessTypeSection f={f} selected={preset} onSelect={setPreset} />
          <IdentitySection f={f} nameLabel={t('biz.shopName')} />
          <TextField label={t('biz.description')} value={f.description} onChangeText={f.setDescription} />
          <CountrySection f={f} />
        </>
      ) : null}
      {step === 1 ? (
        <>
          <ContactSection f={f} withDescription={false} />
          <TaxSection f={f} />
        </>
      ) : null}
      {step === 2 ? (
        <>
          <CapabilitiesSection f={f} />
          {isTablet ? (
            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <RewardsSection f={f} />
              </View>
              <View className="flex-1 gap-3">
                <RulesSection f={f} services={services} onServices={setServices} />
              </View>
            </View>
          ) : (
            <>
              <RewardsSection f={f} />
              <RulesSection f={f} services={services} onServices={setServices} />
            </>
          )}
        </>
      ) : null}

      <View className="flex-row items-center gap-2 border-t border-border pt-3">
        {step > 0 ? (
          <View className="flex-1">
            <Button title={`← ${t('wizard.back')}`} variant="ghost" onPress={() => setStep((s) => (s - 1) as Step)} />
          </View>
        ) : (
          <View className="flex-1" />
        )}
        <View className="flex-1">
          {step < 2 ? (
            <Button title={`${t('wizard.next')} →`} onPress={() => setStep((s) => (s + 1) as Step)} />
          ) : (
            <Button title={`✓ ${t('wizard.create')}`} onPress={create} loading={saving} disabled={!f.name.trim()} />
          )}
        </View>
      </View>
    </View>
  );
}

function JoinShop({ onJoined, onOpen }: { onJoined: () => void; onOpen: (companyId: string) => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const submit = async () => {
    setSent(null);
    setLoading(true);
    try {
      const r = await membershipsApi.join(code.trim());
      if (r.status === MembershipStatus.Active) {
        onOpen(r.companyId);
        return;
      }
      setSent(r.companyName);
      setCode('');
      onJoined();
    } catch (e) {
      showAlert(t('shops.tabJoin'), e instanceof ApiError ? e.message : t('join.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="gap-3">
      <Text className="text-sm text-text-secondary">{t('join.help')}</Text>
      <TextField
        label={t('join.code')}
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        placeholder="PHRM-XXXXX"
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="send"
        onSubmitEditing={() => code.trim().length >= 5 && void submit()}
      />
      {sent ? (
        <View className="rounded-xl bg-success/10 px-3 py-2.5">
          <Text className="text-sm text-success">
            ✓ {t('join.sentTo')} {sent}. {t('join.sentNote')}
          </Text>
        </View>
      ) : null}
      <Button title={t('join.send')} onPress={submit} loading={loading} disabled={code.trim().length < 5} />
    </View>
  );
}
