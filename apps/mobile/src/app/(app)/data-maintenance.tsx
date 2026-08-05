import { UserRole } from '@stockflow/core/api/enums';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { ScreenBackground } from '@/components/ScreenBackground';
import { backupsDirPath, lastBackupInfo, runDueBackup } from '@/lib/autoBackup';
import { useAuthStore } from '@/lib/auth/store';
import { resetAllData, shareBackup } from '@/lib/dataBackup';
import { analyzeBackup, applyRestore, countUnsyncedTransactions, parseBackup, TABLE_LABELS, type ParsedBackup, type TableRecap } from '@/lib/dataRestore';
import { syncNow } from '@/lib/sync/syncNow';
import { showAlert } from '@/lib/ui/alertStore';
import { toast } from '@/lib/ui/toastStore';

type Busy = null | 'backup' | 'auto' | 'restore' | 'analyze' | 'reset';

export default function DataMaintenanceScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const role = useAuthStore((s) => s.user?.role);
  const clear = useAuthStore((s) => s.clear);
  const isAdmin = role === UserRole.CompanyAdmin || role === UserRole.SuperAdmin;

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
      toast(`Backup ready · ${r.fileName} · ${r.rowCount} records`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Backup failed.', 'error');
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
      toast(r.ran ? `Daily backup saved · ${r.rows} records` : 'Nothing to back up.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Backup failed.', 'error');
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
      if (companyMismatch) return toast("This backup belongs to a different business — it can't be restored here.", 'error');
      if (rc.length === 0) return toast('This backup has no records to restore.', 'info');
      setParsed(p);
      setRecap(rc);
      setSel(new Set(rc.map((r) => r.name)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't read this backup file.", 'error');
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
    if (sel.size === 0) return toast('Pick at least one type of data.', 'info');
    setBusy('restore');
    try {
      const r = await applyRestore(parsed, companyId, [...sel], mode);
      toast(`Restore complete · ${r.inserted} added, ${r.updated} updated, ${r.skipped} skipped`, 'success');
      setParsed(null);
      setRecap([]);
      setSel(new Set());
      const pending = await countUnsyncedTransactions(companyId);
      if (pending > 0) {
        showAlert('Make restored sales official?', 'Some restored sales aren’t on the server yet. Send them so they become official for every device. Already-synced sales and your catalogue are handled automatically.', [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Send to server',
            onPress: async () => {
              try {
                await syncNow();
                toast('Sent to server.', 'success');
              } catch {
                toast('Could not reach the server — try Sync later.', 'error');
              }
            },
          },
        ]);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Restore failed.', 'error');
    } finally {
      setBusy(null);
    }
  }

  function onReset() {
    if (!companyId || busy) return;
    showAlert(
      'Reset all data on this device?',
      'This permanently clears every record stored on THIS device and signs you out. Your business data on the server is safe and downloads again next time you sign in. Any sales not yet synced will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset everything',
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
              toast('All local data cleared. Signing out…', 'success');
              setTimeout(() => {
                clear();
                router.replace('/');
              }, 500);
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Reset failed.', 'error');
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
          <Text className="text-lg font-bold text-text-primary">Data & maintenance</Text>
          <View className="w-12" />
        </View>
      </View>

      {!isAdmin ? (
        <View className="p-5">
          <View className="rounded-card border border-border bg-surface p-6">
            <Text className="text-center text-3xl">🔒</Text>
            <Text className="mt-2 text-center text-lg font-bold text-text-primary">Administrators only</Text>
            <Text className="mt-1 text-center text-sm text-text-secondary">Backing up and resetting device data is restricted to a company administrator.</Text>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
          {/* Automatic daily backup */}
          <View className="rounded-card border border-success/40 bg-success/5 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold text-text-primary">🛡️ Automatic daily backup</Text>
              <View className="rounded-full bg-success/15 px-2.5 py-0.5">
                <Text className="text-xs font-bold text-success">On</Text>
              </View>
            </View>
            <Text className="mt-1 text-xs text-text-secondary">
              Saved automatically once a day; the last 14 days are kept as separate files — so yesterday's work is always safe, even offline.
            </Text>
            <View className="mt-3 gap-1 rounded-xl bg-surface/60 p-3">
              <Text className="text-xs">
                <Text className="text-text-secondary">Last backup: </Text>
                <Text className="font-semibold text-text-primary">{autoInfo ? autoInfo.period : 'not yet'}</Text>
              </Text>
              <Text className="text-xs">
                <Text className="text-text-secondary">Saved in: </Text>
                <Text className="text-text-primary">{backupsPath ?? 'app storage'}</Text>
              </Text>
            </View>
            <View className="mt-3">
              <Button title="🛡️  Run a daily backup now" variant="secondary" loading={busy === 'auto'} disabled={!!busy} onPress={onAutoBackupNow} />
            </View>
          </View>

          {/* Manual backup */}
          <View className="rounded-card border border-border bg-surface p-4">
            <Text className="text-sm font-bold text-text-primary">💾 Back up data</Text>
            <Text className="mt-1 text-xs text-text-secondary">Save a full snapshot to a file you can keep or send (Files, Drive, WhatsApp…).</Text>
            <View className="mt-3">
              <Button title="💾  Back up now" loading={busy === 'backup'} disabled={!!busy} onPress={onBackup} />
            </View>
          </View>

          {/* Restore */}
          <View className="rounded-card border border-border bg-surface p-4">
            <Text className="text-sm font-bold text-text-primary">📥 Restore from a backup</Text>
            <Text className="mt-1 text-xs text-text-secondary">Upload a backup, review what matches, then add only new records or replace existing ones.</Text>
            <View className="mt-3">
              <Button title="📂  Choose backup file" variant="secondary" loading={busy === 'analyze'} disabled={!!busy} onPress={onChooseFile} />
            </View>

            {parsed && recap.length > 0 ? (
              <View className="mt-4 gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Backup contents</Text>
                  <Pressable onPress={() => setSel(allSelected ? new Set() : new Set(recap.map((r) => r.name)))}>
                    <Text className="text-xs font-semibold text-primary">{allSelected ? 'Select none' : 'Select all'}</Text>
                  </Pressable>
                </View>
                <View className="overflow-hidden rounded-xl border border-border">
                  {recap.map((r, i) => (
                    <Pressable key={r.name} onPress={() => toggle(r.name)} className={`flex-row items-center gap-3 px-3 py-2 ${i === recap.length - 1 ? '' : 'border-b border-border/60'}`}>
                      <View className={`h-5 w-5 items-center justify-center rounded border ${sel.has(r.name) ? 'border-primary bg-primary' : 'border-border'}`}>
                        {sel.has(r.name) ? <Text className="text-[11px] font-bold text-white">✓</Text> : null}
                      </View>
                      <Text className="flex-1 text-sm text-text-primary">{TABLE_LABELS[r.name] ?? r.name}</Text>
                      <Text className="text-xs text-text-secondary">
                        {r.fileRows} in file
                        {r.existing > 0 ? <Text className="text-accent-amber"> · {r.existing} match</Text> : null}
                        {r.newRows > 0 ? <Text className="text-success"> · {r.newRows} new</Text> : null}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="text-[11px] text-text-secondary">“Add” keeps your current records and only inserts new ones. “Replace” overwrites the matching (amber) records with the backup's version.</Text>
                <View className="flex-row gap-2 pt-1">
                  <View className="flex-1">
                    <Button title="➕  Add new only" variant="secondary" loading={busy === 'restore'} disabled={!!busy} onPress={() => onRestore('add')} />
                  </View>
                  <View className="flex-1">
                    <Button title="♻️  Replace" variant="danger" loading={busy === 'restore'} disabled={!!busy} onPress={() => onRestore('replace')} />
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          {/* Reset */}
          <View className="rounded-card border border-error/40 bg-error/5 p-4">
            <Text className="text-sm font-bold text-error">♻️ Reset app data (complete refresh)</Text>
            <Text className="mt-1 text-xs text-text-secondary">Clears this device and signs you out. Server data is safe and re-downloads on next sign-in — but sync first, as unsynced sales can't be recovered.</Text>
            <View className="mt-3">
              <Button title="♻️  Reset everything" variant="danger" loading={busy === 'reset'} disabled={!!busy} onPress={onReset} />
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
