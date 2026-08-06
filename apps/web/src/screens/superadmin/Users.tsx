import { UserRole } from "@stockflow/core/api/enums";
import { superAdminApi } from "@stockflow/core/api/endpoints/superAdmin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { relativeTime } from "@/lib/monitoring";
import { toast } from "@/lib/toast";

function roleLabel(role: UserRole, t: (s: string) => string): string {
  return role === UserRole.CompanyAdmin ? t("Admin") : t("Cashier");
}

export function SuperAdminUsers() {
  const t = useT();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyBlocked, setOnlyBlocked] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["superadmin", "users"],
    queryFn: () => superAdminApi.listUsers(),
    refetchInterval: 60000,
  });

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => superAdminApi.setUserActive(id, active),
    onSuccess: (_r, v) => {
      toast(v.active ? t("User unblocked") : t("User blocked"), "success");
      void qc.invalidateQueries({ queryKey: ["superadmin", "users"] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : t("Something went wrong."), "error"),
  });

  async function onBlock(id: string, name: string) {
    const ok = await confirmDialog({
      title: t("Block this user?"),
      message: `${t("They will be signed out within seconds and cannot log in until unblocked.")} (${name})`,
      confirmLabel: t("Block user"),
      danger: true,
    });
    if (ok) setActive.mutate({ id, active: false });
  }

  const rows = useMemo(() => {
    let list = data ?? [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((u) => u.name.toLowerCase().includes(q) || u.phone.toLowerCase().includes(q) || (u.companyName ?? "").toLowerCase().includes(q));
    if (onlyBlocked) list = list.filter((u) => !u.active);
    return list;
  }, [data, search, onlyBlocked]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{t("Users")}</h1>
      <p className="mt-1 text-sm text-text-secondary">{t("Every staff account across all businesses. Block one to sign it out everywhere.")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search name, phone, company…")}
          className="w-72 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-text-primary outline-none focus:border-primary"
        />
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={onlyBlocked} onChange={(e) => setOnlyBlocked(e.target.checked)} />
          {t("Blocked only")}
        </label>
      </div>

      {error ? (
        <div className="mt-4 rounded-card border border-error/40 bg-error/5 p-4 text-sm text-error">{error instanceof Error ? error.message : t("Something went wrong.")}</div>
      ) : isLoading ? (
        <div className="mt-4 rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-3 font-semibold">{t("Name")}</th>
                <th className="px-4 py-3 font-semibold">{t("Company")}</th>
                <th className="px-4 py-3 font-semibold">{t("Role")}</th>
                <th className="px-4 py-3 font-semibold">{t("Last seen")}</th>
                <th className="px-4 py-3 font-semibold">{t("Status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{u.name}</div>
                    <div className="text-xs text-text-secondary">{u.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{u.companyName ?? "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">{roleLabel(u.role, t)}</td>
                  <td className="px-4 py-3 text-text-secondary">{relativeTime(u.lastActiveAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.active ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>
                      {u.active ? t("Active") : t("Blocked")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.active ? (
                      <Button variant="ghost" loading={setActive.isPending && setActive.variables?.id === u.id} onClick={() => onBlock(u.id, u.name)} className="!px-3 !py-1.5 !text-xs">
                        {t("Block")}
                      </Button>
                    ) : (
                      <Button variant="primary" loading={setActive.isPending && setActive.variables?.id === u.id} onClick={() => setActive.mutate({ id: u.id, active: true })} className="!px-3 !py-1.5 !text-xs">
                        {t("Unblock")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-text-secondary">{t("No users match.")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
