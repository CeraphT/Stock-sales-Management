import { ApiError } from "@stockflow/core/api/client";
import { authApi } from "@stockflow/core/api/endpoints/auth";
import { UserRole } from "@stockflow/core/api/enums";
import type { UserResponse } from "@stockflow/core/api/types/auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { TextField } from "@/components/TextField";
import { useT } from "@/lib/i18n";
import { roleLabel } from "@/lib/labels";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";

const PERMS: { key: keyof Pick<UserResponse, "restrictCatalog" | "restrictPurchasing" | "restrictCustomers" | "restrictReportsAndFullSales">; label: string }[] = [
  { key: "restrictCatalog", label: "Catalog" },
  { key: "restrictPurchasing", label: "Purchasing" },
  { key: "restrictCustomers", label: "Customers" },
  { key: "restrictReportsAndFullSales", label: "Reports" },
];

export function Staff() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const t = useT();
  const [adding, setAdding] = useState<{ name: string; phone: string; password: string; role: UserRole } | null>(null);
  // Inline reset-password editor (window.prompt is unreliable in the Tauri webview).
  const [resetting, setResetting] = useState<{ id: string; value: string } | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ["staff", companyId], queryFn: () => authApi.listStaffUsers(companyId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staff", companyId] });
  const onError = (e: unknown) => toast(e instanceof ApiError ? e.message : "Something went wrong.", "error");

  const createM = useMutation({
    mutationFn: (v: NonNullable<typeof adding>) =>
      authApi.createStaffUser(companyId, { name: v.name.trim(), phone: v.phone.trim(), password: v.password, role: v.role }),
    onSuccess: () => { setAdding(null); toast("Staff member added.", "success"); invalidate(); },
    onError,
  });
  const activeM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => authApi.setStaffUserActive(companyId, v.id, { active: v.active }),
    onSuccess: () => invalidate(), onError,
  });
  const permM = useMutation({
    mutationFn: (v: { id: string; body: Parameters<typeof authApi.setStaffUserPermissions>[2] }) =>
      authApi.setStaffUserPermissions(companyId, v.id, v.body),
    onSuccess: () => invalidate(), onError,
  });

  function submitReset() {
    if (!resetting) return;
    if (resetting.value.length < 6) { toast("Password must be at least 6 characters.", "error"); return; }
    authApi
      .resetStaffUserPassword(companyId, resetting.id, { newPassword: resetting.value })
      .then(() => { setResetting(null); toast("Password reset", "success"); })
      .catch(onError);
  }

  function togglePerm(u: UserResponse, key: (typeof PERMS)[number]["key"]) {
    permM.mutate({
      id: u.id,
      body: {
        restrictCatalog: u.restrictCatalog,
        restrictPurchasing: u.restrictPurchasing,
        restrictCustomers: u.restrictCustomers,
        restrictReportsAndFullSales: u.restrictReportsAndFullSales,
        [key]: !u[key],
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-text-secondary">{data.length} {t("staff")}</span>
        {!adding ? <Button onClick={() => setAdding({ name: "", phone: "", password: "", role: UserRole.Cashier })}>{t("+ New staff")}</Button> : null}
      </div>

      {adding ? (
        <div className="mb-4 space-y-3 rounded-card border border-border bg-surface p-5">
          <div className="text-sm font-bold text-text-primary">{t("New staff member")}</div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label={t("Name")} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
            <TextField label={t("Phone")} value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label={t("Password")} type="password" value={adding.password} onChange={(e) => setAdding({ ...adding, password: e.target.value })} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Role")}</span>
              <select
                value={adding.role}
                onChange={(e) => setAdding({ ...adding, role: Number(e.target.value) as UserRole })}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary"
              >
                <option value={UserRole.Cashier}>{t("Cashier")}</option>
                <option value={UserRole.CompanyAdmin}>{t("Admin")}</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(null)}>{t("Cancel")}</Button>
            <Button onClick={() => createM.mutate(adding)} loading={createM.isPending} disabled={!adding.name.trim() || !adding.phone.trim() || adding.password.length < 6}>
              {t("Save")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-card border border-border bg-surface p-10 text-center text-text-secondary">{t("Loading…")}</div>
        ) : (
          data.map((u) => (
            <div key={u.id} className="rounded-card border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium text-text-primary">
                    {u.name} <span className="text-xs font-normal text-text-secondary">· {roleLabel(u.role)}</span>
                  </div>
                  <div className="text-xs text-text-secondary">{u.phone}</div>
                </div>
                <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${u.active ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}>
                  {u.active ? t("Active") : t("Inactive")}
                </span>
                <IconButton
                  icon="🔑"
                  label={t("Reset password")}
                  onClick={() => setResetting({ id: u.id, value: "" })}
                />
                <IconButton
                  icon={u.active ? "🚫" : "✅"}
                  label={u.active ? t("Deactivate") : t("Activate")}
                  tone={u.active ? "danger" : "success"}
                  onClick={() => activeM.mutate({ id: u.id, active: !u.active })}
                />
              </div>

              {resetting?.id === u.id ? (
                <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                  <input
                    type="password"
                    autoFocus
                    value={resetting.value}
                    onChange={(e) => setResetting({ id: u.id, value: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && submitReset()}
                    placeholder={t("New password (min 6 chars)")}
                    className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                  <Button onClick={submitReset} disabled={resetting.value.length < 6}>{t("Set")}</Button>
                  <Button variant="ghost" onClick={() => setResetting(null)}>{t("Cancel")}</Button>
                </div>
              ) : null}
              {u.role === UserRole.Cashier ? (
                <div className="mt-3 flex flex-wrap gap-4 border-t border-border/60 pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Restrict:")}</span>
                  {PERMS.map((p) => (
                    <label key={p.key} className="flex items-center gap-1.5 text-sm text-text-primary">
                      <input type="checkbox" checked={u[p.key]} onChange={() => togglePerm(u, p.key)} className="h-4 w-4" />
                      {t(p.label)}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
