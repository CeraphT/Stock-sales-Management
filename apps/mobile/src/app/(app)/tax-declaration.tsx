import { reportsApi } from '@stockflow/core/api/endpoints/reports';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { ScreenBackground } from '@/components/ScreenBackground';
import { StatCard } from '@/components/StatCard';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { companiesApi } from '@/lib/api/endpoints/companies';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency, paymentMethodLabelKey } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { shareColoredReport } from '@/lib/reports/taxPdf';
import { toast } from '@/lib/ui/toastStore';
import { appLocale } from '@/lib/i18n/locale';
import { useTranslation } from '@/lib/i18n/useTranslation';

const PERIOD_LABEL = ['tax.perMonth', 'tax.perQuarter', 'tax.perYear'] as const;

export default function TaxDeclarationScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCompanyCurrency();
  const [from, setFrom] = useState(new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation();

  const { data: company } = useQuery({ queryKey: ['company', companyId], queryFn: () => companiesApi.get(companyId!), enabled: !!companyId });
  const { data: d } = useQuery({
    queryKey: ['tax-declaration', companyId, from, to],
    queryFn: () => reportsApi.taxDeclaration(companyId!, { from: from || undefined, to: to || undefined }),
    enabled: !!companyId,
  });

  const fmt = (n: number) => formatCurrency(n, currency);
  const period = `${from || '…'} → ${to || t('tax.today')}`;
  const contact = [company?.address, company?.phone].filter(Boolean).join(' · ') || null;
  const base = () => ({ companyName: company?.name ?? '', contact, taxId: company?.taxId, subtitle: period });
  const isFlat = company?.taxRegime === 1;

  async function run(fn: () => Promise<void>) {
    if (busy || !companyId) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('tax.exportFailed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const filter = () => ({ from: from || undefined, to: to || undefined });

  const salesJournalPdf = () =>
    run(async () => {
      const rows = await reportsApi.salesJournal(companyId!, filter());
      if (rows.length === 0) return toast(t('history.empty'), 'info');
      const tHt = rows.reduce((s, r) => s + r.ht, 0);
      const tVat = rows.reduce((s, r) => s + r.vat, 0);
      const tTtc = rows.reduce((s, r) => s + r.ttc, 0);
      await shareColoredReport({
        ...base(),
        title: t('tax.salesJournal'),
        meta: [{ label: t('reports.sales'), value: String(rows.length) }, { label: t('tax.vatCollected'), value: fmt(tVat) }],
        columns: [{ header: t('tax.col.when') }, { header: t('tax.col.ref') }, { header: t('pos.customer') }, { header: t('tax.col.payment') }, { header: t('tax.col.base'), align: 'right' }, { header: t('reports.vat'), align: 'right' }, { header: t('common.total'), align: 'right' }],
        rows: rows.map((r) => [new Date(r.timestamp).toLocaleDateString(appLocale()), r.id.slice(0, 8).toUpperCase(), r.customerName ?? t('common.walkIn'), t(paymentMethodLabelKey(r.paymentMethod)), fmt(r.ht), fmt(r.vat), fmt(r.ttc)]),
        totals: [t('common.total'), null, null, null, fmt(tHt), fmt(tVat), fmt(tTtc)],
      });
    });

  const purchasesJournalPdf = () =>
    run(async () => {
      const rows = await reportsApi.purchasesJournal(companyId!, filter());
      if (rows.length === 0) return toast(t('tax.noPurchases'), 'info');
      const tHt = rows.reduce((s, r) => s + r.ht, 0);
      const tVat = rows.reduce((s, r) => s + r.vat, 0);
      const tTtc = rows.reduce((s, r) => s + r.ttc, 0);
      await shareColoredReport({
        ...base(),
        title: t('tax.purchasesJournal'),
        meta: [{ label: t('tax.receipts'), value: String(rows.length) }, { label: t('tax.vatDeductible'), value: fmt(tVat) }],
        columns: [{ header: t('tax.col.when') }, { header: t('tax.col.product') }, { header: t('common.batch') }, { header: t('tax.col.supplier') }, { header: t('tax.col.base'), align: 'right' }, { header: t('reports.vat'), align: 'right' }, { header: t('common.total'), align: 'right' }],
        rows: rows.map((r) => [new Date(r.timestamp).toLocaleDateString(appLocale()), r.productName, r.batchNumber, r.supplierName ?? '-', fmt(r.ht), fmt(r.vat), fmt(r.ttc)]),
        totals: [t('common.total'), null, null, null, fmt(tHt), fmt(tVat), fmt(tTtc)],
      });
    });

  const cashBookPdf = () =>
    run(async () => {
      const rows = await reportsApi.cashBook(companyId!, filter());
      if (rows.length === 0) return toast(t('tax.noShifts'), 'info');
      await shareColoredReport({
        ...base(),
        title: t('tax.cashBook'),
        meta: [{ label: t('tax.shifts'), value: String(rows.length) }],
        columns: [{ header: t('tax.col.opened') }, { header: t('common.cashier') }, { header: t('tax.col.opening'), align: 'right' }, { header: t('shift.cashSales'), align: 'right' }, { header: t('shift.expected'), align: 'right' }, { header: t('recon.counted'), align: 'right' }, { header: t('tax.col.diff'), align: 'right' }],
        rows: rows.map((r) => [new Date(r.openedAt).toLocaleDateString(appLocale()), r.cashierName, fmt(r.openingCash), fmt(r.cashSales), r.expectedCash != null ? fmt(r.expectedCash) : '-', r.closingCash != null ? fmt(r.closingCash) : '-', r.discrepancy != null ? fmt(r.discrepancy) : '-']),
      });
    });

  const incomeStatementPdf = () =>
    run(async () => {
      const s = await reportsApi.salesSummary(companyId!, filter());
      await shareColoredReport({
        ...base(),
        title: t('tax.incomeStatement'),
        meta: [{ label: t('reports.revenue'), value: fmt(s.totalRevenue) }, { label: t('tax.grossMargin'), value: fmt(s.totalProfit) }],
        columns: [{ header: '' }, { header: t('tax.col.amount'), align: 'right' }],
        rows: [[t('tax.revenueSales'), fmt(s.totalRevenue)], [t('tax.cogs'), `- ${fmt(s.totalCost)}`], [t('tax.ofWhichVat'), fmt(s.totalTax)]],
        totals: [t('tax.grossMargin'), fmt(s.totalProfit)],
      });
    });

  const declarationPdf = () =>
    run(async () => {
      if (!d) return;
      await shareColoredReport({
        ...base(),
        title: t('tax.declarationPdfTitle'),
        subtitle: `${period} · ${t('tax.standardRate').replace('{rate}', String(d.standardRatePercent))}`,
        meta: [{ label: t('tax.turnover'), value: fmt(d.salesTtc) }, { label: t('tax.vatDue'), value: fmt(d.vatDue) }],
        columns: [{ header: '' }, { header: t('tax.col.base'), align: 'right' }, { header: t('reports.vat'), align: 'right' }, { header: t('tax.col.ohadaAcct') }],
        rows: [
          [t('tax.vatCollectedOnSales'), fmt(d.salesHt), fmt(d.vatCollected), '4431'],
          [t('tax.vatDeductibleOnPurchases'), fmt(d.purchasesHt), fmt(d.vatDeductible), '4452'],
        ],
        totals: [t('tax.vatDueFormula'), null, fmt(d.vatDue), '4441'],
      });
    });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('drawer.item.taxDeclaration')}</Text>
          <View className="w-12" />
        </View>
      </View>

      <KeyboardAwareScroll contentContainerClassName="gap-4 p-5 pb-10">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DateField label={t('history.from')} value={from} onChange={setFrom} />
          </View>
          <View className="flex-1">
            <DateField label={t('tax.toBlankToday')} value={to || null} onChange={setTo} />
          </View>
        </View>

        {isFlat ? (
          <View className="rounded-card border border-primary/40 bg-primary/5 p-4">
            <Text className="text-sm font-semibold text-primary">🧾 {t('tax.flatTaxTitle')}</Text>
            <Text className="mt-1 text-2xl font-extrabold text-text-primary">
              {fmt(company?.flatTaxAmount ?? 0)}{' '}
              <Text className="text-sm font-medium text-text-secondary">/ {t(PERIOD_LABEL[company?.flatTaxPeriod ?? 1] ?? 'tax.perQuarter')}</Text>
            </Text>
            <Text className="mt-1 text-xs text-text-secondary">{t('tax.flatTaxHint')}</Text>
          </View>
        ) : null}

        <View className="-m-1.5 flex-row flex-wrap">
          {[
            { key: 'to', icon: '💵', label: t('tax.turnover'), value: fmt(d?.salesTtc ?? 0), color: 'primary' as const, hint: `${t('tax.exclVat')} ${fmt(d?.salesHt ?? 0)}` },
            { key: 'vc', icon: '📥', label: t('tax.vatCollected'), value: fmt(d?.vatCollected ?? 0), color: 'green' as const, hint: '4431' },
            { key: 'vd', icon: '📤', label: t('tax.vatDeductible'), value: fmt(d?.vatDeductible ?? 0), color: 'amber' as const, hint: '4452' },
            { key: 'due', icon: '🧾', label: t('tax.vatDue'), value: fmt(d?.vatDue ?? 0), color: (d && d.vatDue < 0 ? 'blue' : 'red') as 'blue' | 'red', hint: '4441' },
          ].map((c) => (
            <View key={c.key} className="w-1/2 p-1.5">
              <StatCard icon={<Text className="text-base">{c.icon}</Text>} label={c.label} value={c.value} color={c.color} hint={c.hint} />
            </View>
          ))}
        </View>

        {/* OHADA VAT accounts */}
        <View className="overflow-hidden rounded-card border border-border bg-surface">
          <View className="flex-row items-center border-b border-border px-4 py-2">
            <Text className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">{t('tax.col.line')}</Text>
            <Text className="w-20 text-right text-[10px] font-semibold uppercase tracking-wide text-text-secondary">{t('tax.col.base')}</Text>
            <Text className="w-24 text-right text-[10px] font-semibold uppercase tracking-wide text-text-secondary">{t('reports.vat')}</Text>
            <Text className="w-12 text-right text-[10px] font-semibold uppercase tracking-wide text-text-secondary">OHADA</Text>
          </View>
          <OhadaRow label={t('tax.vatCollectedOnSales')} base={fmt(d?.salesHt ?? 0)} vat={fmt(d?.vatCollected ?? 0)} acct="4431" vatClass="text-success" />
          <OhadaRow label={t('tax.vatDeductibleOnPurchases')} base={fmt(d?.purchasesHt ?? 0)} vat={fmt(d?.vatDeductible ?? 0)} acct="4452" vatClass="text-accent-amber" />
          <View className="flex-row items-center border-t-2 border-border px-4 py-3">
            <Text className="flex-1 text-sm font-bold text-text-primary">{t('tax.vatDue')}</Text>
            <Text className={`w-24 text-right text-sm font-bold ${d && d.vatDue < 0 ? 'text-accent-blue' : 'text-error'}`}>{fmt(d?.vatDue ?? 0)}</Text>
            <Text className="w-12 text-right text-xs text-text-secondary">4441</Text>
          </View>
        </View>

        {d && d.vatDue < 0 ? (
          <Text className="text-xs font-medium text-accent-blue">ℹ️ {t('tax.negativeHint')}</Text>
        ) : null}

        {/* Documents */}
        <Text className="mt-1 text-xs font-bold uppercase tracking-wide text-text-secondary">{t('tax.exportTitle')}</Text>
        <View className="gap-2">
          <Button title={`🖨  ${t('drawer.item.taxDeclaration')}`} variant="secondary" onPress={declarationPdf} loading={busy} />
          <Button title={`📋  ${t('tax.salesJournal')}`} variant="secondary" onPress={salesJournalPdf} loading={busy} />
          <Button title={`📥  ${t('tax.purchasesJournal')}`} variant="secondary" onPress={purchasesJournalPdf} loading={busy} />
          <Button title={`💵  ${t('tax.cashBook')}`} variant="secondary" onPress={cashBookPdf} loading={busy} />
          <Button title={`📈  ${t('tax.incomeStatement')}`} variant="secondary" onPress={incomeStatementPdf} loading={busy} />
        </View>

        <View className="rounded-xl border border-border bg-surface p-4">
          <Text className="text-xs font-semibold text-text-primary">{t('tax.notes')}</Text>
          <Text className="mt-1 text-xs text-text-secondary">{t('tax.notesBody')}</Text>
        </View>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

function OhadaRow({ label, base, vat, acct, vatClass }: { label: string; base: string; vat: string; acct: string; vatClass: string }) {
  return (
    <View className="flex-row items-center border-b border-border/60 px-4 py-3">
      <Text className="flex-1 text-sm text-text-primary">{label}</Text>
      <Text className="w-20 text-right text-xs text-text-secondary">{base}</Text>
      <Text className={`w-24 text-right text-sm font-semibold ${vatClass}`}>{vat}</Text>
      <Text className="w-12 text-right text-xs text-text-secondary">{acct}</Text>
    </View>
  );
}
