import { UserRole } from '@stockflow/core/api/enums';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { ScreenBackground } from '@/components/ScreenBackground';
import { KeyboardAwareScroll } from '@/components/KeyboardAwareScroll';
import { backupsDirPath, lastBackupInfo, runDueBackup } from '@/lib/autoBackup';
import { useAuthStore } from '@/lib/auth/store';
import { resetAllData, shareBackup } from '@/lib/dataBackup';
import { analyzeBackup, applyRestore, countUnsyncedTransactions, parseBackup, TABLE_LABELS, type ParsedBackup, type TableRecap } from '@/lib/dataRestore';
import { syncNow } from '@/lib/sync/syncNow';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

type Busy = null | 'backup' | 'auto' | 'restore' | 'analyze' | 'reset';

export default function DataMaintenanceScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const role = useAuthStore((s) => s.user?.role);
  const clear = useAuthStore((s) => s.clear);
  const isAdmin = role === UserRole.CompanyAdmin || role === UserRole.SuperAdmin;
  const { t } = useTranslation();

  const [busy, setBusy] = useState<Busy>(null);
  const [autoInfo, setAutoInfo] = useState<{ period: string; at: string } | null>(null);
  const [backupsPath, setBackupsPath] = useState<string | null>(null);

  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [recap, setRecap] = useState<TableRecap[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      try {
        setAutoInfo(await lastBackupInfo());
        setBackupsPath(await backupsDirPath());
      } catch {
        /* fs not ready */
      }
    })();
  }, []);

  async function onBackup() {
    if (!companyId || busy) return;
    setBusy('backup');
    try {
      const r = await shareBackup(companyId);
      toast(t('backup.ready').replace('{file}', r.fileName).replace('{n}', String(r.rowCount)), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : t('backup.failed'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onAutoBackupNow() {
    if (!companyId || busy) return;
    setBusy('auto');
    try {
      const r = await runDueBackup(companyId, { force: true });
      setAutoInfo(await lastBackupInfo());
      toast(r.ran ? t('backup.dailySaved').replace('{n}', String(r.rows)) : t('backup.nothing'), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : t('backup.failed'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onChooseFile() {
    if (!companyId || busy) return;
    setParsed(null);
    setRecap([]);
    setBusy('analyze');
    try {
      const DocumentPicker = await import('expo-document-picker');
      const { File } = await import('expo-file-system');
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (res.canceled) return;
      const text = await new File(res.assets[0].uri).text();
      const p = parseBackup(text);
      const { companyMismatch, recap: rc } = await analyzeBackup(p, companyId);
      if (companyMismatch) return toast(t('backup.otherBusiness'), 'error');
      if (rc.length === 0) return toast(t('backup.noRecords'), 'info');
      setParsed(p);
      setRecap(rc);
      setSel(new Set(rc.map((r) => r.name)));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('backup.readFailed'), 'error');
    } finally {
      setBusy(null);
    }
  }

  function toggle(name: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }
  const allSelected = recap.length > 0 && recap.every((r) => sel.has(r.name));

  async function onRestore(mode: 'add' | 'replace') {
    if (!parsed || !companyId || busy) return;
    if (sel.size === 0) return toast(t('backup.pickOne'), 'info');
    setBusy('restore');
    try {
      const r = await applyRestore(parsed, companyId, [...sel], mode);
      toast(t('backup.restoreDone').replace('{added}', String(r.inserted)).replace('{updated}', String(r.updated)).replace('{skipped}', String(r.skipped)), 'success');
      setParsed(null);
      setRecap([]);
      setSel(new Set());
      const pending = await countUnsyncedTransactions(companyId);
      if (pending > 0) {
        showAlert(t('backup.officialTitle'), t('backup.officialBody'), [
          { text: t('common.notNow'), style: 'cancel' },
          {
            text: t('backup.sendToServer'),
            onPress: async () => {
              try {
                await syncNow();
                toast(t('backup.sent'), 'success');
              } catch {
                toast(t('backup.serverUnreachable'), 'error');
              }
            },
          },
        ]);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t('backup.restoreFailed'), 'error');
    } finally {
      setBusy(null);
    }
  }

  function onReset() {
    if (!companyId || busy) return;
    showAlert(
      t('backup.resetTitle'),
      t('backup.resetBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('backup.resetEverything'),
          style: 'destructive',
          onPress: async () => {
            setBusy('reset');
            try {
              try {
                await syncNow();
              } catch {
                /* offline — the dialog already warned unsynced sales will be lost */
              }
              await resetAllData();
              toast(t('backup.cleared'), 'success');
              setTimeout(() => {
                clear();
                router.replace('/');
              }, 500);
            } catch (e) {
              toast(e instanceof Error ? e.message : t('backup.resetFailed'), 'error');
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">{t('drawer.item.dataMaintenance')}</Text>
          <View className="w-12" />
        </View>
      </View>

      {!isAdmin ? (
        <View className="p-5">
          <View className="rounded-card border border-border bg-surface p-6">
            <Text className="text-center text-3xl">🔒</Text>
            <Text className="mt-2 text-center text-lg font-bold text-text-primary">{t('backup.adminsOnly')}</Text>
            <Text className="mt-1 text-center text-sm text-text-secondary">{t('backup.adminsOnlyBody')}</Text>
          </View>
        </View>
      ) : (
        <KeyboardAwareScroll contentContainerClassName="gap-4 p-5 pb-10">
          {/* Automatic daily backup */}
          <View className="rounded-card border border-success/40 bg-success/5 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold text-text-primary">🛡️ {t('backup.autoTitle')}</Text>
              <View className="rounded-full bg-success/15 px-2.5 py-0.5">
                <Text className="text-xs font-bold text-success">{t('backup.on')}</Text>
              </View>
            </View>
            <Text className="mt-1 text-xs text-text-secondary">{t('backup.autoHint')}</Text>
            <View className="mt-3 gap-1 rounded-xl bg-surface/60 p-3">
              <Text className="text-xs">
                <Text className="text-text-secondary">{t('backup.last')} </Text>
                <Text className="font-semibold text-text-primary">{autoInfo ? autoInfo.period : t('backup.notYet')}</Text>
              </Text>
              <Text className="text-xs">
                <Text className="text-text-secondary">{t('backup.savedIn')} </Text>
                <Text className="text-text-primary">{backupsPath ?? t('backup.appStorage')}</Text>
              </Text>
            </View>
            <View className="mt-3">
              <Button title={`🛡️  ${t('backup.runNow')}`} variant="secondary" loading={busy === 'auto'} disabled={!!busy} onPress={onAutoBackupNow} />
            </View>
          </View>

          {/* Manual backup */}
          <View className="rounded-card border border-border bg-surface p-4">
            <Text className="text-sm font-bold text-text-primary">💾 {t('backup.backupTitle')}</Text>
            <Text className="mt-1 text-xs text-text-secondary">{t('backup.backupHint')}</Text>
            <View className="mt-3">
              <Button title={`💾  ${t('backup.backupNow')}`} loading={busy === 'backup'} disabled={!!busy} onPress={onBackup} />
            </View>
          </View>

          {/* Restore */}
          <View className="rounded-card border border-border bg-surface p-4">
            <Text className="text-sm font-bold text-text-primary">📥 {t('backup.restoreTitle')}</Text>
            <Text className="mt-1 text-xs text-text-secondary">{t('backup.restoreHint')}</Text>
            <View className="mt-3">
              <Button title={`📂  ${t('backup.chooseFile')}`} variant="secondary" loading={busy === 'analyze'} disabled={!!busy} onPress={onChooseFile} />
            </View>

            {parsed && recap.length > 0 ? (
              <View className="mt-4 gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{t('backup.contents')}</Text>
                  <Pressable onPress={() => setSel(allSelected ? new Set() : new Set(recap.map((r) => r.name)))}>
                    <Text className="text-xs font-semibold text-primary">{allSelected ? t('backup.selectNone') : t('backup.selectAll')}</Text>
                  </Pressable>
                </View>
                <View className="overflow-hidden rounded-xl border border-border">
                  {recap.map((r, i) => (
                    <Pressable key={r.name} onPress={() => toggle(r.name)} className={`flex-row items-center gap-3 px-3 py-2 ${i === recap.length - 1 ? '' : 'border-b border-border/60'}`}>
                      <View className={`h-5 w-5 items-center justify-center rounded border ${sel.has(r.name) ? 'border-primary bg-primary' : 'border-border'}`}>
                        {sel.has(r.name) ? <Text className="text-[11px] font-bold text-white">✓</Text> : null}
                      </View>
                      <Text className="flex-1 text-sm text-text-primary">{TABLE_LABELS[r.name] ? t(TABLE_LABELS[r.name]) : r.name}</Text>
                      <Text className="text-xs text-text-secondary">
                        {t('backup.inFile').replace('{n}', String(r.fileRows))}
                        {r.existing > 0 ? <Text className="text-accent-amber"> · {t('backup.match').replace('{n}', String(r.existing))}</Text> : null}
                        {r.newRows > 0 ? <Text className="text-success"> · {t('backup.newRows').replace('{n}', String(r.newRows))}</Text> : null}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="text-[11px] text-text-secondary">{t('backup.modesHint')}</Text>
                <View className="flex-row gap-2 pt-1">
                  <View className="flex-1">
                    <Button title={`➕  ${t('backup.addNewOnly')}`} variant="secondary" loading={busy === 'restore'} disabled={!!busy} onPress={() => onRestore('add')} />
                  </View>
                  <View className="flex-1">
                    <Button title={`♻️  ${t('backup.replace')}`} variant="danger" loading={busy === 'restore'} disabled={!!busy} onPress={() => onRestore('replace')} />
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          {/* Reset */}
          <View className="rounded-card border border-error/40 bg-error/5 p-4">
            <Text className="text-sm font-bold text-error">♻️ {t('backup.resetSectionTitle')}</Text>
            <Text className="mt-1 text-xs text-text-secondary">{t('backup.resetSectionHint')}</Text>
            <View className="mt-3">
              <Button title={`♻️  ${t('backup.resetEverything')}`} variant="danger" loading={busy === 'reset'} disabled={!!busy} onPress={onReset} />
            </View>
          </View>
        </KeyboardAwareScroll>
      )}
    </SafeAreaView>
  );
}
