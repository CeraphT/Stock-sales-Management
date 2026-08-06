import { ApiError } from "@stockflow/core/api/client";
import { authApi } from "@stockflow/core/api/endpoints/auth";
import { UserRole } from "@stockflow/core/api/enums";
import type { UserResponse } from "@stockflow/core/api/types/auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { TextField } from "@/components/TextField";
import { useT } from "@/lib/i18n";
import { roleLabel } from "@/lib/labels";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";

// Permissions are framed as ACCESS (positive) in the UI — "Catalog: on" reads
// far better to an admin than "Restrict catalog: on" — while the stored flags
// stay restrictXxx. checked = has access = !restrictXxx.
type AccessKey = keyof Pick<
  UserResponse,
  "restrictCatalog" | "restrictPurchasing" | "restrictCustomers" | "restrictGiftCards" | "restrictCashRegister" | "restrictReportsAndFullSales"
>;
const ACCESS: { key: AccessKey; label: string; desc: string }[] = [
  { key: "restrictCatalog", label: "Catalog & services", desc: "Categories, archive, bulk stock, services" },
  { key: "restrictPurchasing", label: "Purchasing", desc: "Suppliers, purchase orders" },
  { key: "restrictCashRegister", label: "Cash register", desc: "Open / close shifts, takings" },
  { key: "restrictCustomers", label: "Customers", desc: "Customer records & credit" },
  { key: "restrictGiftCards", label: "Gift cards", desc: "Issue / manage gift cards" },
  { key: "restrictReportsAndFullSales", label: "Reports & full sales", desc: "Reports, and other cashiers' sales" },
];

function initialOf(name: string): string {
  return (name.trim()[0] ?? "•").toUpperCase();
}

export function Staff() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const selfId = useAuthStore((s) => s.user?.id);
  const t = useT();
  const [adding, setAdding] = useState<{ name: string; phone: string; password: string; role: UserRole } | null>(null);
  const [resetting, setResetting] = useState<{ id: string; value: string } | null>(null);
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({ queryKey: ["staff", companyId], queryFn: () => authApi.listStaffUsers(companyId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staff", companyId] });
  const onError = (e: unknown) => toast(e instanceof ApiError ? e.message : "Something went wrong.", "error");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? data.filter((u) => u.name.toLowerCase().includes(q) || u.phone.includes(q)) : data;
  }, [data, search]);

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

  function toggleAccess(u: UserResponse, key: AccessKey) {
    permM.mutate({
      id: u.id,
      body: {
        restrictCatalog: u.restrictCatalog,
        restrictPurchasing: u.restrictPurchasing,
        restrictCustomers: u.restrictCustomers,
        restrictReportsAndFullSales: u.restrictReportsAndFullSales,
        restrictCashRegister: u.restrictCashRegister,
        restrictGiftCards: u.restrictGiftCards,
        [key]: !u[key],
      },
    });
  }

  function toggleActive(u: UserResponse) {
    if (u.id === selfId && u.active) { toast(t("You can't deactivate your own account."), "error"); return; }
    activeM.mutate({ id: u.id, active: !u.active });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-text-secondary">{data.length} {t("staff")}</span>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search staff")}
            className="h-10 w-48 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
          />
          {!adding ? <Button onClick={() => setAdding({ name: "", phone: "", password: "", role: UserRole.Cashier })}>{t("+ New staff")}</Button> : null}
        </div>
      </div>

      {adding ? (
        <div className="space-y-3 rounded-card border border-border bg-surface p-5">
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
          <p className="text-xs text-text-secondary">{t("A Cashier's access can be limited below after you create the account. An Admin has full access.")}</p>
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
        ) : rows.length === 0 ? (
          <div className="rounded-card border border-border bg-surface p-10 text-center text-text-secondary">{t("No staff match.")}</div>
        ) : (
          rows.map((u) => {
            const isAdmin = u.role === UserRole.CompanyAdmin || u.role === UserRole.SuperAdmin;
            return (
              <div key={u.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${u.active ? "bg-primary/15 text-primary" : "bg-text-secondary/15 text-text-secondary"}`}>
                    {initialOf(u.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-text-primary">{u.name}</span>
                      {u.id === selfId ? <span className="text-xs text-text-secondary">({t("you")})</span> : null}
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isAdmin ? "bg-accent-blue/15 text-accent-blue" : "bg-text-secondary/15 text-text-secondary"}`}>
                        {roleLabel(u.role)}
                      </span>
                    </div>
                    <div className="text-xs text-text-secondary">{u.phone}</div>
                  </div>
                  <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${u.active ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}>
                    {u.active ? t("Active") : t("Inactive")}
                  </span>
                  <IconButton icon="🔑" label={t("Reset password")} onClick={() => setResetting({ id: u.id, value: "" })} />
                  <IconButton
                    icon={u.active ? "🚫" : "✅"}
                    label={u.active ? t("Deactivate") : t("Activate")}
                    tone={u.active ? "danger" : "success"}
                    onClick={() => toggleActive(u)}
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
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Access")}</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {ACCESS.map((p) => {
                        const hasAccess = !u[p.key];
                        return (
                          <label key={p.key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 px-3 py-2 hover:bg-background/50">
                            <input type="checkbox" checked={hasAccess} onChange={() => toggleAccess(u, p.key)} className="mt-0.5 h-4 w-4" />
                            <span>
                              <span className="block text-sm font-medium text-text-primary">{t(p.label)}</span>
                              <span className="block text-[11px] text-text-secondary">{t(p.desc)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 border-t border-border/60 pt-3 text-xs text-text-secondary">{t("Full access (admin).")}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
