import { superAdminApi } from "@stockflow/core/api/endpoints/superAdmin";
import type { AuditLogRow } from "@stockflow/core/api/types/superAdmin";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useT } from "@/lib/i18n";

const ACTION_META: Record<string, { label: string; icon: string; tone: string }> = {
  "impersonate.start": { label: "Entered company", icon: "👁️", tone: "text-accent-orange" },
  "device.block": { label: "Blocked device", icon: "🚫", tone: "text-error" },
  "device.unblock": { label: "Unblocked device", icon: "✅", tone: "text-success" },
  "device.wipe": { label: "Remote-wiped device", icon: "🧨", tone: "text-error" },
  "user.block": { label: "Blocked user", icon: "🚫", tone: "text-error" },
  "user.unblock": { label: "Unblocked user", icon: "✅", tone: "text-success" },
  "auth.login": { label: "Signed in", icon: "🔑", tone: "text-text-secondary" },
};

export function SuperAdminAudit() {
  const t = useT();
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["superadmin", "audit"],
    queryFn: () => superAdminApi.listAudit(300),
    refetchInterval: 30000,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data ?? [];
    if (!q) return list;
    return list.filter((a) =>
      a.actorName.toLowerCase().includes(q) ||
      a.action.toLowerCase().includes(q) ||
      (a.detail ?? "").toLowerCase().includes(q) ||
      (a.ip ?? "").toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{t("Audit log")}</h1>
      <p className="mt-1 text-sm text-text-secondary">{t("Every sensitive administrative action — impersonation, blocks, and remote wipes.")}</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("Search actor, action, detail, IP…")}
        className="mt-4 w-72 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-text-primary outline-none focus:border-primary"
      />

      {error ? (
        <div className="mt-4 rounded-card border border-error/40 bg-error/5 p-4 text-sm text-error">{error instanceof Error ? error.message : t("Something went wrong.")}</div>
      ) : isLoading ? (
        <div className="mt-4 rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("No activity recorded yet.")}</div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-card border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-3 font-semibold">{t("Action")}</th>
                <th className="px-4 py-3 font-semibold">{t("By")}</th>
                <th className="px-4 py-3 font-semibold">{t("Detail")}</th>
                <th className="px-4 py-3 font-semibold">{t("IP")}</th>
                <th className="px-4 py-3 font-semibold">{t("When")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a: AuditLogRow) => {
                const meta = ACTION_META[a.action] ?? { label: a.action, icon: "•", tone: "text-text-secondary" };
                return (
                  <tr key={a.id} className="border-b border-border/50 last:border-0">
                    <td className={`px-4 py-3 font-medium ${meta.tone}`}>
                      <span className="mr-1.5">{meta.icon}</span>{t(meta.label)}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{a.actorName}</td>
                    <td className="px-4 py-3 text-text-secondary">{a.detail ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{a.ip ?? "—"}</td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(a.createdAt).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
