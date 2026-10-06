import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextField } from '@/components/TextField';
import { BUSINESS_PRESETS, CAPABILITY_META } from '@/lib/businessTypes';
import { COUNTRY_OPTIONS } from '@/lib/countries';
import type { TranslationKey } from '@/lib/i18n/translations';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useThemeColors } from '@/lib/theme/colors';

import type { CompanyForm } from './useCompanyForm';

/* The "My business" fields as React Native blocks, shared by the My business tabs
 * and the shop-creation wizard steps (same form state, see useCompanyForm). Mobile
 * twin of apps/web/src/components/companyForm/CompanyFormSections.tsx. */

function Label({ children }: { children: string }) {
  return <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{children}</Text>;
}

function Hint({ children }: { children: string }) {
  return <Text className="text-xs text-text-secondary">{children}</Text>;
}

function Choice({ active, label, hint, onPress }: { active: boolean; label: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-xl border px-3 py-2.5 active:opacity-80 ${active ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
      <Text className={`text-sm font-semibold ${active ? 'text-primary' : 'text-text-primary'}`}>{label}</Text>
      {hint ? <Text className="text-[11px] text-text-secondary">{hint}</Text> : null}
    </Pressable>
  );
}

function SwitchRow({ title, hint, value, onChange }: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const colors = useThemeColors();
  return (
    <View className="gap-1 rounded-xl border border-border bg-surface p-3.5">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-sm font-semibold text-text-primary">{title}</Text>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} />
      </View>
      {hint ? <Hint>{hint}</Hint> : null}
    </View>
  );
}

/** Business type: pre-selects the inventory features that type of business needs. */
export function BusinessTypeSection({ f, selected, onSelect }: { f: CompanyForm; selected: string | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      <Label>{t('biz.type')}</Label>
      <View className="flex-row flex-wrap gap-2">
        {BUSINESS_PRESETS.map((p) => {
          const active = selected === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                onSelect(p.id);
                f.setCapabilities(p.caps);
              }}
              className={`flex-row items-center gap-2 rounded-xl border px-3 py-2.5 active:opacity-80 ${active ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}
              style={{ minWidth: '47%', flexGrow: 1 }}>
              <Text className="text-lg">{p.icon}</Text>
              <Text className={`flex-1 text-sm ${active ? 'font-bold text-primary' : 'text-text-primary'}`} numberOfLines={2}>
                {t(`biz.preset.${p.id}` as TranslationKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Logo (shown; uploaded from web/desktop) + business name. */
export function IdentitySection({ f, nameLabel }: { f: CompanyForm; nameLabel?: string }) {
  const { t } = useTranslation();
  return (
    <>
      {f.logoUrl ? (
        <View className="flex-row items-center gap-3">
          <Image source={{ uri: f.logoUrl }} style={{ width: 52, height: 52, borderRadius: 12 }} resizeMode="contain" />
          <View className="flex-1">
            <Label>{t('biz.logo')}</Label>
            <Hint>{t('biz.logoWebOnly')}</Hint>
          </View>
        </View>
      ) : null}
      <TextField label={nameLabel ?? t('biz.name')} value={f.name} onChangeText={f.setName} />
    </>
  );
}

/** Description, address, phone, receipt footer, NIU. */
export function ContactSection({ f }: { f: CompanyForm }) {
  const { t } = useTranslation();
  return (
    <>
      <TextField label={t('biz.description')} value={f.description} onChangeText={f.setDescription} />
      <TextField label={t('biz.address')} placeholder={t('biz.addressHint')} value={f.address} onChangeText={f.setAddress} />
      <TextField label={t('biz.phone')} keyboardType="phone-pad" value={f.phone} onChangeText={f.setPhone} />
      <TextField label={t('biz.footer')} placeholder={t('biz.footerHint')} value={f.receiptFooter} onChangeText={f.setReceiptFooter} />
      <TextField label={t('biz.niu')} placeholder={t('biz.niuHint')} value={f.taxId} onChangeText={f.setTaxId} />
    </>
  );
}

/** Country (sets currency + VAT) via a searchable list, and the resulting currency. */
export function CountrySection({ f }: { f: CompanyForm }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const options = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? COUNTRY_OPTIONS.filter((o) => o.label.toLowerCase().includes(s)) : COUNTRY_OPTIONS;
  }, [q]);
  const current = COUNTRY_OPTIONS.find((o) => o.value === f.country);

  return (
    <>
      <View className="gap-1.5">
        <Label>{t('biz.country')}</Label>
        <Pressable
          onPress={() => setOpen(true)}
          className="flex-row items-center justify-between rounded-xl border border-border bg-background px-3.5 py-3 active:opacity-80">
          <Text className={`flex-1 text-base ${current ? 'text-text-primary' : 'text-text-secondary'}`} numberOfLines={1}>
            {current?.label ?? t('biz.countryPick')}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.iconMuted} />
        </Pressable>
        <Hint>{t('biz.countryHint')}</Hint>
      </View>
      <View className="gap-1.5">
        <Label>{t('biz.currency')}</Label>
        <View className="rounded-xl border border-border bg-background/60 px-3.5 py-3">
          <Text className="text-base text-text-secondary">{f.currencyLabel || '-'}</Text>
        </View>
      </View>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder={t('biz.search')}
              placeholderTextColor={colors.placeholder}
              className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base text-text-primary"
            />
            <Pressable onPress={() => setOpen(false)} hitSlop={8} className="p-2">
              <Ionicons name="close" size={24} color={colors.icon} />
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  f.setCountry(item.value);
                  setOpen(false);
                  setQ('');
                }}
                className={`border-b border-border/60 px-5 py-3.5 active:bg-primary/10 ${item.value === f.country ? 'bg-primary/10' : ''}`}>
                <Text className="text-base text-text-primary">{item.label}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

/** Accounting system, tax regime, VAT rate or flat tax. */
export function TaxSection({ f }: { f: CompanyForm }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <>
      <View className="gap-2">
        <Label>{t('biz.accounting')}</Label>
        <View className="gap-2">
          {([0, 1, 2] as const).map((v) => (
            <Choice
              key={v}
              active={f.accountingSystem === v}
              label={t(v === 0 ? 'biz.acc.ohada' : v === 1 ? 'biz.acc.generic' : 'biz.acc.none')}
              onPress={() => f.setAccountingSystem(v)}
            />
          ))}
        </View>
        <Hint>{t('biz.accHint')}</Hint>
      </View>

      <View className="gap-3 rounded-xl border border-border bg-surface p-3.5">
        <Label>{t('biz.regime')}</Label>
        <View className="flex-row gap-2">
          <Choice
            active={f.taxRegime === 0}
            label={t('biz.regime.standard')}
            hint={t('biz.regime.standardHint')}
            onPress={() => {
              f.setTaxRegime(0);
              if (Number(f.tax) <= 0) f.toggleTax(true);
            }}
          />
          <Choice
            active={f.taxRegime === 1}
            label={t('biz.regime.flat')}
            hint={t('biz.regime.flatHint')}
            onPress={() => {
              f.setTaxRegime(1);
              f.setTax('0');
            }}
          />
        </View>

        {f.taxRegime === 0 ? (
          <View className="gap-2 border-t border-border/60 pt-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-sm font-semibold text-text-primary">🧾 {t('biz.vatApply')}</Text>
              <Switch value={f.taxOn} onValueChange={f.toggleTax} trackColor={{ true: colors.primary }} />
            </View>
            <Hint>{t('biz.vatHint')}</Hint>
            {f.taxOn ? <TextField label={t('biz.vatRate')} keyboardType="numeric" value={f.tax} onChangeText={f.setTax} /> : null}
          </View>
        ) : (
          <View className="gap-2 border-t border-border/60 pt-3">
            <Hint>{t('biz.flatHint')}</Hint>
            <TextField label={`${t('biz.flatAmount')} (${f.currency || 'XAF'})`} keyboardType="numeric" value={f.flatTaxAmount} onChangeText={f.setFlatTaxAmount} />
            <Label>{t('biz.period')}</Label>
            <View className="flex-row gap-2">
              {([0, 1, 2] as const).map((v) => (
                <Choice
                  key={v}
                  active={f.flatTaxPeriod === v}
                  label={t(v === 0 ? 'biz.monthly' : v === 1 ? 'biz.quarterly' : 'biz.yearly')}
                  onPress={() => f.setFlatTaxPeriod(v)}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </>
  );
}

/** Purchase-reward gift cards. */
export function RewardsSection({ f }: { f: CompanyForm }) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <SwitchRow title={`🎁 ${t('biz.rewards')}`} hint={t('biz.rewardsHint')} value={f.rewardEnabled} onChange={f.setRewardEnabled} />
      {f.rewardEnabled ? (
        <>
          <TextField label={t('biz.rewardEvery')} keyboardType="numeric" value={f.rewardCount} onChangeText={f.setRewardCount} />
          <TextField label={`${t('biz.rewardValue')} (${f.currency || 'XAF'})`} keyboardType="numeric" value={f.rewardValue} onChangeText={f.setRewardValue} />
        </>
      ) : null}
    </View>
  );
}

/** Inventory features (capabilities). */
export function CapabilitiesSection({ f }: { f: CompanyForm }) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      <Hint>{t('biz.capsHint')}</Hint>
      {CAPABILITY_META.map((c) => (
        <SwitchRow
          key={c.key}
          title={t(`biz.cap.${c.key}` as TranslationKey)}
          hint={t(`biz.cap.${c.key}.desc` as TranslationKey)}
          value={f.capabilities[c.key]}
          onChange={(v) => f.setCapabilities((prev) => ({ ...prev, [c.key]: v }))}
        />
      ))}
    </View>
  );
}

/** Low-stock default + the services module (mobile keeps this switch here). */
export function RulesSection({ f, services, onServices }: { f: CompanyForm; services: boolean; onServices: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <TextField label={t('biz.lowStock')} placeholder={t('biz.lowStockHint')} keyboardType="numeric" value={f.lowStock} onChangeText={f.setLowStock} />
      <SwitchRow title={t('biz.services')} hint={t('biz.servicesHint')} value={services} onChange={onServices} />
    </>
  );
}
