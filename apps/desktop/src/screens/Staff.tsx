import { ApiError } from "@stockflow/core/api/client";
import { authApi } from "@stockflow/core/api/endpoints/auth";
import { UserRole } from "@stockflow/core/api/enums";
import type { UserResponse } from "@stockflow/core/api/types/auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { roleLabel } from "@/lib/labels";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";

const PERMS: { key: keyof Pick<UserResponse, "restrictCatalog" | "restrictPurchasing" | "restrictCustomers" | "restrictReportsAndFullSales">; label: string }[] = [
  { key: "restrictCatalog", label: "Catalog" },
  { key: "restrictPurchasing", label: "Purchasing" },
  { key: "restrictCustomers", label: "Customers" },
  { key: "restrictReportsAndFullSales", label: "Reports" },
];

export function Staff() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const [adding, setAdding] = useState<{ name: string; phone: string; password: string; role: UserRole } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ["staff", companyId], queryFn: () => authApi.listStaffUsers(companyId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staff", companyId] });
  const onError = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong.");

  const createM = useMutation({
    mutationFn: (v: NonNullable<typeof adding>) =>
      authApi.createStaffUser(companyId, { name: v.name.trim(), phone: v.phone.trim(), password: v.password, role: v.role }),
    onSuccess: () => { setAdding(null); setError(null); invalidate(); },
    onError,
  });
  const activeM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => authApi.setStaffUserActive(companyId, v.id, { active: v.active }),
    onSuccess: () => { setError(null); invalidate(); }, onError,
  });
  const permM = useMutation({
    mutationFn: (v: { id: string; body: Parameters<typeof authApi.setStaffUserPermissions>[2] }) =>
      authApi.setStaffUserPermissions(companyId, v.id, v.body),
    onSuccess: () => { setError(null); invalidate(); }, onError,
  });

  function resetPassword(id: string) {
    const pw = window.prompt("New password (min 6 chars):");
    if (pw == null) return;
    if (pw.length < 6) { setError("Password must be at least 6 characters."); return; }
    authApi.resetStaffUserPassword(companyId, id, { newPassword: pw }).then(() => setError(null)).catch(onError);
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
        <span className="text-sm text-text-secondary">{data.length} staff</span>
        {!adding ? <Button onClick={() => setAdding({ name: "", phone: "", password: "", role: UserRole.Cashier })}>+ New staff</Button> : null}
      </div>

      {adding ? (
        <div className="mb-4 space-y-3 rounded-card border border-border bg-surface p-5">
          <div className="text-sm font-bold text-text-primary">New staff member</div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
            <TextField label="Phone" value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Password" type="password" value={adding.password} onChange={(e) => setAdding({ ...adding, password: e.target.value })} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">Role</span>
              <select
                value={adding.role}
                onChange={(e) => setAdding({ ...adding, role: Number(e.target.value) as UserRole })}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-primary"
              >
                <option value={UserRole.Cashier}>Cashier</option>
                <option value={UserRole.CompanyAdmin}>Admin</option>
              </select>
            </label>
          </div>
          {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setAdding(null); setError(null); }}>Cancel</Button>
            <Button onClick={() => createM.mutate(adding)} loading={createM.isPending} disabled={!adding.name.trim() || !adding.phone.trim() || adding.password.length < 6}>
              Save
            </Button>
          </div>
        </div>
      ) : null}

      {error && !adding ? <p className="mb-3 text-sm font-medium text-error">{error}</p> : null}

      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-card border border-border bg-surface p-10 text-center text-text-secondary">Loading…</div>
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
                  {u.active ? "Active" : "Inactive"}
                </span>
                <button onClick={() => resetPassword(u.id)} className="text-sm font-semibold text-text-secondary hover:text-text-primary">
                  Reset password
                </button>
                <button onClick={() => activeM.mutate({ id: u.id, active: !u.active })} className="text-sm font-semibold text-primary">
                  {u.active ? "Deactivate" : "Activate"}
                </button>
              </div>
              {u.role === UserRole.Cashier ? (
                <div className="mt-3 flex flex-wrap gap-4 border-t border-border/60 pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Restrict:</span>
                  {PERMS.map((p) => (
                    <label key={p.key} className="flex items-center gap-1.5 text-sm text-text-primary">
                      <input type="checkbox" checked={u[p.key]} onChange={() => togglePerm(u, p.key)} className="h-4 w-4" />
                      {p.label}
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
