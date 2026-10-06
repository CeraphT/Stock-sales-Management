import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { SkeletonList } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import { authApi } from '@/lib/api/endpoints/auth';
import type { SetUserPermissionsRequest, UserResponse } from '@/lib/api/types/auth';
import { UserRole } from '@/lib/api/enums';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { toast } from '@/lib/ui/toastStore';
import { membershipsApi } from '@stockflow/core/api/endpoints/memberships';
import type { JoinRequestResponse } from '@stockflow/core/api/types/membership';
import { useThemeColors } from '@/lib/theme/colors';
import { showAlert } from '@/lib/ui/alertStore';

const ROLES: { value: UserRole; label: string }[] = [
  { value: UserRole.Cashier, label: 'Cashier' },
  { value: UserRole.CompanyAdmin, label: 'Admin' },
];

// Each switch reads/writes as "has access" — inverted from the stored
// restrictXxx booleans, since "Access to Purchasing: ON" reads far more
// naturally to an admin than "Restrict Purchasing: ON".
const PERMISSION_FIELDS: { key: keyof SetUserPermissionsRequest; label: string; description: string }[] = [
  { key: 'restrictCatalog', label: 'Catalog & services', description: 'Categories, archive, bulk stock, services' },
  { key: 'restrictPurchasing', label: 'Purchasing', description: 'Suppliers, purchase orders' },
  { key: 'restrictCashRegister', label: 'Cash register', description: 'Open / close shifts, takings' },
  { key: 'restrictCustomers', label: 'Customers', description: 'Customer records & credit' },
  { key: 'restrictGiftCards', label: 'Gift cards', description: 'Issue / manage gift cards' },
  { key: 'restrictReportsAndFullSales', label: 'Reports & full sales', description: "Reports, and other cashiers' sales" },
];

function roleLabel(role: UserRole): string {
  return role === UserRole.SuperAdmin ? 'Super admin' : role === UserRole.CompanyAdmin ? 'Admin' : 'Cashier';
}

export default function StaffScreen() {
  const companyId = useAuthStore((s) => s.companyId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [staff, setStaff] = useState<UserResponse[]>([]);
  // Join-by-code requests waiting for this shop (accepted with a role here).
  const [requests, setRequests] = useState<JoinRequestResponse[]>([]);
  const [requestRole, setRequestRole] = useState<Record<string, UserRole>>({});
  const [deciding, setDeciding] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const visibleStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? staff.filter((u) => u.name.toLowerCase().includes(q) || u.phone.includes(q)) : staff;
  }, [staff, search]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.Cashier);
  const [creating, setCreating] = useState(false);

  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const [permissionsUserId, setPermissionsUserId] = useState<string | null>(null);
  const [savingPermissionKey, setSavingPermissionKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [list, pending] = await Promise.all([
        authApi.listStaffUsers(companyId),
        membershipsApi.joinRequests(companyId).catch(() => [] as JoinRequestResponse[]),
      ]);
      setStaff(list);
      setRequests(pending);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onCreate = async () => {
    if (!companyId) return;
    if (!name.trim() || !phone.trim()) {
      showAlert('Missing details', 'Enter a name and phone number.');
      return;
    }
    if (password.length > 0 && password.length < 6) {
      showAlert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setCreating(true);
    try {
      await authApi.createStaffUser(companyId, { name: name.trim(), phone: phone.trim(), password, role });
      setName('');
      setPhone('');
      setPassword('');
      setRole(UserRole.Cashier);
      setShowAddForm(false);
      await refresh();
      toast(`${name.trim()}: OK`, 'success');
    } catch (err) {
      showAlert('Could not create account', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const onToggleActive = (user: UserResponse) => {
    if (!companyId) return;
    if (user.id === currentUserId && user.active) {
      showAlert('Cannot deactivate', 'You cannot deactivate your own account.');
      return;
    }
    showAlert(
      user.active ? 'Deactivate account?' : 'Reactivate account?',
      user.active
        ? `${user.name} will no longer be able to log in.`
        : `${user.name} will be able to log in again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: user.active ? 'Deactivate' : 'Reactivate',
          style: user.active ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await authApi.setStaffUserActive(companyId, user.id, { active: !user.active });
              await refresh();
            } catch (err) {
              showAlert('Could not update account', err instanceof Error ? err.message : 'Something went wrong.');
            }
          },
        },
      ],
    );
  };

  const onSubmitReset = async (userId: string) => {
    if (!companyId) return;
    if (resetPassword.length < 6) {
      showAlert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setResetting(true);
    try {
      await authApi.resetStaffUserPassword(companyId, userId, { newPassword: resetPassword });
      setResettingUserId(null);
      setResetPassword('');
      showAlert('Password reset', 'They can log in with the new password now.');
    } catch (err) {
      showAlert('Could not reset password', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setResetting(false);
    }
  };

  const onTogglePermission = async (user: UserResponse, key: keyof SetUserPermissionsRequest, hasAccess: boolean) => {
    if (!companyId) return;
    setSavingPermissionKey(key);
    try {
      const updated = await authApi.setStaffUserPermissions(companyId, user.id, {
        restrictCatalog: user.restrictCatalog,
        restrictPurchasing: user.restrictPurchasing,
        restrictCustomers: user.restrictCustomers,
        restrictReportsAndFullSales: user.restrictReportsAndFullSales,
        restrictCashRegister: user.restrictCashRegister,
        restrictGiftCards: user.restrictGiftCards,
        [key]: !hasAccess,
      });
      setStaff((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    } catch (err) {
      showAlert('Could not update permissions', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSavingPermissionKey(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenBackground />
      <View className="border-b border-border bg-surface px-5 pb-4 pt-14">
        <View className="flex-row items-center justify-between">
          <BackButton />
          <Text className="text-lg font-bold text-text-primary">Staff accounts</Text>
          <Pressable onPress={() => setShowAddForm((v) => !v)} hitSlop={8} accessibilityLabel="Add staff account">
            <Ionicons name={showAddForm ? 'close' : 'add'} size={24} color={colors.primary} />
          </Pressable>
        </View>
        <TextInput
          className="mt-3 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text-primary"
          placeholder="Search staff"
          placeholderTextColor={colors.placeholder}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-xs text-text-secondary">{staff.length} {staff.length === 1 ? 'staff member' : 'staff members'}</Text>
          <Pressable
            onPress={() => router.push('/change-password' as never)}
            hitSlop={6}
            className="flex-row items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 active:opacity-80">
            <Ionicons name="key-outline" size={14} color={colors.primary} />
            <Text className="text-xs font-semibold text-primary">Change my password</Text>
          </Pressable>
        </View>
      </View>

      {showAddForm ? (
        <View className="gap-3 border-b border-border bg-surface p-4">
          <TextField label="Name" value={name} onChangeText={setName} />
          <TextField label="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <TextField label="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder={t('staff.passwordNewOnly')} />
          <Text className="text-xs text-text-secondary">{t('staff.existingHint')}</Text>
          <View className="gap-1.5">
            <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">Role</Text>
            <View className="flex-row gap-2">
              {ROLES.map((r) => {
                const active = role === r.value;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setRole(r.value)}
                    className={`rounded-full border px-4 py-2 ${active ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
                    <Text className={`text-xs font-semibold ${active ? 'text-primary' : 'text-text-secondary'}`}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Button title={creating ? 'Creating…' : 'Create account'} loading={creating} onPress={onCreate} />
        </View>
      ) : null}

      {loading ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={visibleStaff}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 p-4"
          refreshing={false}
          onRefresh={refresh}
          ListHeaderComponent={
            requests.length > 0 ? (
              <View className="mb-2 gap-2 rounded-2xl border border-accent-amber/40 bg-accent-amber/5 p-3.5">
                <Text className="text-sm font-bold text-text-primary">
                  🔑 {t('staff.requests')} ({requests.length})
                </Text>
                <Text className="text-xs text-text-secondary">{t('staff.requestsHint')}</Text>
                {requests.map((r) => {
                  const chosen = requestRole[r.membershipId] ?? UserRole.Cashier;
                  const decide = async (accept: boolean) => {
                    if (!companyId) return;
                    setDeciding(r.membershipId);
                    try {
                      if (accept) await membershipsApi.approve(companyId, r.membershipId, { role: chosen });
                      else await membershipsApi.reject(companyId, r.membershipId);
                      toast(accept ? t('staff.accepted') : t('staff.declined'), 'success');
                      await refresh();
                    } catch (err) {
                      showAlert(t('staff.requests'), err instanceof Error ? err.message : '');
                    } finally {
                      setDeciding(null);
                    }
                  };
                  return (
                    <View key={r.membershipId} className="gap-2 rounded-xl bg-surface p-3">
                      <View>
                        <Text className="text-sm font-semibold text-text-primary">{r.name}</Text>
                        <Text className="text-xs text-text-secondary">
                          {r.phone} · {new Date(r.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <View className="flex-row gap-2">
                        {([UserRole.Cashier, UserRole.CompanyAdmin] as const).map((v) => (
                          <Pressable
                            key={v}
                            onPress={() => setRequestRole((m) => ({ ...m, [r.membershipId]: v }))}
                            className={`rounded-full border px-3 py-1.5 ${chosen === v ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
                            <Text className={`text-xs font-semibold ${chosen === v ? 'text-primary' : 'text-text-secondary'}`}>
                              {v === UserRole.Cashier ? t('staff.roleCashier') : t('staff.roleAdmin')}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <View className="flex-row gap-2">
                        <View className="flex-1">
                          <Button title={t('staff.decline')} variant="ghost" disabled={deciding === r.membershipId} onPress={() => void decide(false)} />
                        </View>
                        <View className="flex-1">
                          <Button title={t('staff.accept')} loading={deciding === r.membershipId} onPress={() => void decide(true)} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const isAdmin = item.role === UserRole.CompanyAdmin || item.role === UserRole.SuperAdmin;
            return (
            <View className="rounded-2xl bg-surface p-3.5 shadow-sm shadow-black/5">
              <View className="flex-row items-center gap-3">
                <View className={`h-10 w-10 items-center justify-center rounded-full ${item.active ? 'bg-primary/15' : 'bg-text-secondary/15'}`}>
                  <Text className={`text-sm font-bold ${item.active ? 'text-primary' : 'text-text-secondary'}`}>
                    {(item.name.trim()[0] ?? '•').toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-text-primary">
                      {item.name}
                      {item.id === currentUserId ? ' (you)' : ''}
                    </Text>
                    <View className={`rounded-md px-1.5 py-0.5 ${isAdmin ? 'bg-accent-blue/15' : 'bg-text-secondary/15'}`}>
                      <Text className={`text-[10px] font-bold ${isAdmin ? 'text-accent-blue' : 'text-text-secondary'}`}>{roleLabel(item.role)}</Text>
                    </View>
                  </View>
                  <Text className="text-xs text-text-secondary">{item.phone}</Text>
                </View>
                <Pressable
                  onPress={() => onToggleActive(item)}
                  className={`rounded-full border px-3 py-1.5 ${item.active ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
                  <Text className={`text-xs font-semibold ${item.active ? 'text-primary' : 'text-text-secondary'}`}>
                    {item.active ? 'Active' : 'Inactive'}
                  </Text>
                </Pressable>
              </View>

              {resettingUserId === item.id ? (
                <View className="mt-3 gap-2 border-t border-border pt-3">
                  <TextInput
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                    placeholder="New password (min 6 characters)"
                    placeholderTextColor={colors.placeholder}
                    secureTextEntry
                    value={resetPassword}
                    onChangeText={setResetPassword}
                  />
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => {
                        setResettingUserId(null);
                        setResetPassword('');
                      }}
                      className="flex-1 items-center rounded-lg border border-border py-2">
                      <Text className="text-xs font-semibold text-text-secondary">Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onSubmitReset(item.id)}
                      disabled={resetting}
                      className="flex-1 items-center rounded-lg bg-primary py-2 disabled:opacity-50">
                      <Text className="text-xs font-semibold text-white">{resetting ? 'Saving…' : 'Save'}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="mt-2 flex-row items-center gap-4">
                  <Pressable
                    onPress={() => {
                      setResettingUserId(item.id);
                      setResetPassword('');
                    }}
                    className="flex-row items-center gap-1.5">
                    <Ionicons name="key-outline" size={14} color={colors.iconMuted} />
                    <Text className="text-xs font-semibold text-text-secondary">Reset password</Text>
                  </Pressable>
                  {item.role === UserRole.Cashier ? (
                    <Pressable
                      onPress={() => setPermissionsUserId((prev) => (prev === item.id ? null : item.id))}
                      className="flex-row items-center gap-1.5">
                      <Ionicons name="shield-checkmark-outline" size={14} color={colors.iconMuted} />
                      <Text className="text-xs font-semibold text-text-secondary">Permissions</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}

              {permissionsUserId === item.id ? (
                <View className="mt-3 gap-3 border-t border-border pt-3">
                  {PERMISSION_FIELDS.map((field) => {
                    const hasAccess = !item[field.key];
                    return (
                      <View key={field.key} className="flex-row items-center justify-between gap-3">
                        <View className="flex-1 pr-2">
                          <Text className="text-xs font-semibold text-text-primary">{field.label}</Text>
                          <Text className="text-[11px] text-text-secondary">{field.description}</Text>
                        </View>
                        <Switch
                          value={hasAccess}
                          disabled={savingPermissionKey === field.key}
                          onValueChange={() => onTogglePermission(item, field.key, hasAccess)}
                          trackColor={{ true: colors.primary }}
                        />
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
            );
          }}
          ListEmptyComponent={
            !loading ? <Text className="p-4 text-center text-sm text-text-secondary">No staff accounts yet.</Text> : null
          }
        />
      )}
    </SafeAreaView>
  );
}
