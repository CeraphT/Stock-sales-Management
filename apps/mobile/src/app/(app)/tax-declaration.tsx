import { reportsApi } from '@stockflow/core/api/endpoints/reports';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { ScreenBackground } from '@/components/ScreenBackground';
import { StatCard } from '@/components/StatCard';
import { companiesApi } from '@/lib/api/endpoints/companies';
import { useAuthStore } from '@/lib/auth/store';
import { formatCurrency, paymentMethodLabel } from '@/lib/format';
import { useCompanyCurrency } from '@/lib/hooks/useCompanyCurrency';
import { shareColoredReport } from '@/lib/reports/taxPdf';
import { toast } from '@/lib/ui/toastStore';

const PERIOD_LABEL = ['month', 'quarter', 'year'];

export default function TaxDeclarationScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currency = useCompanyCurrency();
  const [from, setFrom] = useState(new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: company } = useQuery({ queryKey: ['company', companyId], queryFn: () => companiesApi.get(companyId!), enabled: !!companyId });
  const { data: d } = useQuery({
    queryKey: ['tax-declaration', companyId, from, to],
    queryFn: () => reportsApi.taxDeclaration(companyId!, { from: from || undefined, to: to || undefined }),
    enabled: !!companyId,
  });

  const fmt = (n: number) => formatCurrency(n, currency);
  const period = `${from || '…'} → ${to || 'today'}`;
  const contact = [company?.address, company?.phone].filter(Boolean).join(' · ') || null;
  const base = () => ({ companyName: company?.name ?? '', contact, taxId: company?.taxId, subtitle: period });
  const isFlat = company?.taxRegime === 1;

  async function run(fn: () => Promise<void>) {
    if (busy || !companyId) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not export the report.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const filter = () => ({ from: from || undefined, to: to || undefined });

  const salesJournalPdf = () =>
    run(async () => {
      const rows = await reportsApi.salesJournal(companyId!, filter());
      if (rows.length === 0) return toast('No sales in this period.', 'info');
      const tHt = rows.reduce((s, r) => s + r.ht, 0);
      const tVat = rows.reduce((s, r) => s + r.vat, 0);
      const tTtc = rows.reduce((s, r) => s + r.ttc, 0);
      await shareColoredReport({
        ...base(),
        title: 'Sales journal',
        meta: [{ label: 'Sales', value: String(rows.length) }, { label: 'VAT collected', value: fmt(tVat) }],
        columns: [{ header: 'When' }, { header: 'Ref' }, { header: 'Customer' }, { header: 'Payment' }, { header: 'Base', align: 'right' }, { header: 'VAT', align: 'right' }, { header: 'Total', align: 'right' }],
        rows: rows.map((r) => [new Date(r.timestamp).toLocaleDateString(), r.id.slice(0, 8).toUpperCase(), r.customerName ?? 'Walk-in', paymentMethodLabel(r.paymentMethod), fmt(r.ht), fmt(r.vat), fmt(r.ttc)]),
        totals: ['Total', null, null, null, fmt(tHt), fmt(tVat), fmt(tTtc)],
      });
    });

  const purchasesJournalPdf = () =>
    run(async () => {
      const rows = await reportsApi.purchasesJournal(companyId!, filter());
      if (rows.length === 0) return toast('No purchases in this period.', 'info');
      const tHt = rows.reduce((s, r) => s + r.ht, 0);
      const tVat = rows.reduce((s, r) => s + r.vat, 0);
      const tTtc = rows.reduce((s, r) => s + r.ttc, 0);
      await shareColoredReport({
        ...base(),
        title: 'Purchases journal',
        meta: [{ label: 'Receipts', value: String(rows.length) }, { label: 'VAT deductible', value: fmt(tVat) }],
        columns: [{ header: 'When' }, { header: 'Product' }, { header: 'Batch' }, { header: 'Supplier' }, { header: 'Base', align: 'right' }, { header: 'VAT', align: 'right' }, { header: 'Total', align: 'right' }],
        rows: rows.map((r) => [new Date(r.timestamp).toLocaleDateString(), r.productName, r.batchNumber, r.supplierName ?? '—', fmt(r.ht), fmt(r.vat), fmt(r.ttc)]),
        totals: ['Total', null, null, null, fmt(tHt), fmt(tVat), fmt(tTtc)],
      });
    });

  const cashBookPdf = () =>
    run(async () => {
      const rows = await reportsApi.cashBook(companyId!, filter());
      if (rows.length === 0) return toast('No shifts in this period.', 'info');
      await shareColoredReport({
        ...base(),
        title: 'Cash book',
        meta: [{ label: 'Shifts', value: String(rows.length) }],
        columns: [{ header: 'Opened' }, { header: 'Cashier' }, { header: 'Opening', align: 'right' }, { header: 'Cash sales', align: 'right' }, { header: 'Expected', align: 'right' }, { header: 'Counted', align: 'right' }, { header: 'Diff', align: 'right' }],
        rows: rows.map((r) => [new Date(r.openedAt).toLocaleDateString(), r.cashierName, fmt(r.openingCash), fmt(r.cashSales), r.expectedCash != null ? fmt(r.expectedCash) : '—', r.closingCash != null ? fmt(r.closingCash) : '—', r.discrepancy != null ? fmt(r.discrepancy) : '—']),
      });
    });

  const incomeStatementPdf = () =>
    run(async () => {
      const s = await reportsApi.salesSummary(companyId!, filter());
      await shareColoredReport({
        ...base(),
        title: 'Income statement',
        meta: [{ label: 'Revenue', value: fmt(s.totalRevenue) }, { label: 'Gross margin', value: fmt(s.totalProfit) }],
        columns: [{ header: '' }, { header: 'Amount', align: 'right' }],
        rows: [['Revenue (sales)', fmt(s.totalRevenue)], ['Cost of goods sold', `- ${fmt(s.totalCost)}`], ['of which VAT collected', fmt(s.totalTax)]],
        totals: ['Gross margin', fmt(s.totalProfit)],
      });
    });

  const declarationPdf = () =>
    run(async () => {
      if (!d) return;
      await shareColoredReport({
        ...base(),
        title: 'VAT declaration (TVA)',
        subtitle: `${period} · Standard rate ${d.standardRatePercent}%`,
        meta: [{ label: 'Turnover (incl. VAT)', value: fmt(d.salesTtc) }, { label: 'VAT due', value: fmt(d.vatDue) }],
        columns: [{ header: '' }, { header: 'Base', align: 'right' }, { header: 'VAT', align: 'right' }, { header: 'OHADA acct' }],
        rows: [
          ['VAT collected on sales', fmt(d.salesHt), fmt(d.vatCollected), '4431'],
          ['VAT deductible on purchases', fmt(d.purchasesHt), fmt(d.vatDeductible), '4452'],
        ],
        totals: ['VAT due (collected − deductible)', null, fmt(d.vatDue), '4441'],
      });
    });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">VAT declaration</Text>
          <View className="w-12" />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DateField label="From" value={from} onChange={setFrom} />
          </View>
          <View className="flex-1">
            <DateField label="To (blank = today)" value={to || null} onChange={setTo} />
          </View>
        </View>

        {isFlat ? (
          <View className="rounded-card border border-primary/40 bg-primary/5 p-4">
            <Text className="text-sm font-semibold text-primary">🧾 Impôt libératoire (flat tax)</Text>
            <Text className="mt-1 text-2xl font-extrabold text-text-primary">
              {fmt(company?.flatTaxAmount ?? 0)}{' '}
              <Text className="text-sm font-medium text-text-secondary">/ {PERIOD_LABEL[company?.flatTaxPeriod ?? 1] ?? 'quarter'}</Text>
            </Text>
            <Text className="mt-1 text-xs text-text-secondary">
              Your business is on the flat-tax regime — no VAT is collected on sales. This lump sum, set by your commune, is what you owe per period.
            </Text>
          </View>
        ) : null}

        <View className="-m-1.5 flex-row flex-wrap">
          {[
            { key: 'to', icon: '💵', label: 'Turnover (incl. VAT)', value: fmt(d?.salesTtc ?? 0), color: 'primary' as const },
            { key: 'vc', icon: '📥', label: 'VAT collected', value: fmt(d?.vatCollected ?? 0), color: 'green' as const },
            { key: 'vd', icon: '📤', label: 'VAT deductible', value: fmt(d?.vatDeductible ?? 0), color: 'amber' as const },
            { key: 'due', icon: '🧾', label: 'VAT due', value: fmt(d?.vatDue ?? 0), color: (d && d.vatDue < 0 ? 'blue' : 'red') as 'blue' | 'red' },
          ].map((c) => (
            <View key={c.key} className="w-1/2 p-1.5">
              <StatCard icon={<Text className="text-base">{c.icon}</Text>} label={c.label} value={c.value} color={c.color} />
            </View>
          ))}
        </View>

        {/* OHADA VAT accounts */}
        <View className="overflow-hidden rounded-card border border-border bg-surface">
          <OhadaRow label="VAT collected on sales" base={fmt(d?.salesHt ?? 0)} vat={fmt(d?.vatCollected ?? 0)} acct="4431" vatClass="text-success" />
          <OhadaRow label="VAT deductible on purchases" base={fmt(d?.purchasesHt ?? 0)} vat={fmt(d?.vatDeductible ?? 0)} acct="4452" vatClass="text-accent-amber" />
          <View className="flex-row items-center border-t-2 border-border px-4 py-3">
            <Text className="flex-1 text-sm font-bold text-text-primary">VAT due</Text>
            <Text className={`w-24 text-right text-sm font-bold ${d && d.vatDue < 0 ? 'text-accent-blue' : 'text-error'}`}>{fmt(d?.vatDue ?? 0)}</Text>
            <Text className="w-12 text-right text-xs text-text-secondary">4441</Text>
          </View>
        </View>

        {d && d.vatDue < 0 ? (
          <Text className="text-xs font-medium text-accent-blue">ℹ️ Negative VAT due means a VAT credit carried forward to the next period.</Text>
        ) : null}

        {/* Documents */}
        <Text className="mt-1 text-xs font-bold uppercase tracking-wide text-text-secondary">Export a document (PDF)</Text>
        <View className="gap-2">
          <Button title="🖨  VAT declaration" variant="secondary" onPress={declarationPdf} loading={busy} />
          <Button title="📋  Sales journal" variant="secondary" onPress={salesJournalPdf} loading={busy} />
          <Button title="📥  Purchases journal" variant="secondary" onPress={purchasesJournalPdf} loading={busy} />
          <Button title="💵  Cash book" variant="secondary" onPress={cashBookPdf} loading={busy} />
          <Button title="📈  Income statement" variant="secondary" onPress={incomeStatementPdf} loading={busy} />
        </View>

        <View className="rounded-xl border border-border bg-surface p-4">
          <Text className="text-xs font-semibold text-text-primary">Notes</Text>
          <Text className="mt-1 text-xs text-text-secondary">
            Prices are VAT-inclusive (TTC). VAT deductible on purchases is estimated at the standard rate. This follows the SYSCOHADA VAT accounts and is a working document, not an official filing.
          </Text>
        </View>
      </ScrollView>
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
