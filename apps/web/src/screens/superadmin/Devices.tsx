import { DevicePlatform } from "@stockflow/core/api/enums";
import { superAdminApi } from "@stockflow/core/api/endpoints/superAdmin";
import type { SuperAdminDeviceRow } from "@stockflow/core/api/types/superAdmin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { isLive, locationLabel, platformMeta, relativeTime } from "@/lib/monitoring";
import { toast } from "@/lib/toast";

type StatusFilter = "all" | "live" | "blocked";
type PlatformFilter = "all" | DevicePlatform;

export function SuperAdminDevices() {
  const t = useT();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [platform, setPlatform] = useState<PlatformFilter>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["superadmin", "devices"],
    queryFn: () => superAdminApi.listDevices(),
    refetchInterval: 30000,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["superadmin", "devices"] });
    void qc.invalidateQueries({ queryKey: ["superadmin", "overview"] });
  };

  const block = useMutation({
    mutationFn: (id: string) => superAdminApi.blockDevice(id),
    onSuccess: () => { toast(t("Device blocked"), "success"); invalidate(); },
    onError: (e) => toast(e instanceof Error ? e.message : t("Something went wrong."), "error"),
  });
  const unblock = useMutation({
    mutationFn: (id: string) => superAdminApi.unblockDevice(id),
    onSuccess: () => { toast(t("Device unblocked"), "success"); invalidate(); },
    onError: (e) => toast(e instanceof Error ? e.message : t("Something went wrong."), "error"),
  });
  const wipe = useMutation({
    mutationFn: (id: string) => superAdminApi.wipeDevice(id),
    onSuccess: () => { toast(t("Remote wipe requested"), "success"); invalidate(); },
    onError: (e) => toast(e instanceof Error ? e.message : t("Something went wrong."), "error"),
  });

  async function onWipe(d: SuperAdminDeviceRow) {
    const ok = await confirmDialog({
      title: t("Remote-wipe this device?"),
      message: t("The device will erase its local data on next contact and is blocked immediately. This cannot be undone remotely."),
      confirmLabel: t("Wipe device"),
      danger: true,
    });
    if (ok) wipe.mutate(d.id);
  }

  const rows = useMemo(() => {
    let list = data ?? [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((d) =>
      d.userName.toLowerCase().includes(q) ||
      (d.companyName ?? "").toLowerCase().includes(q) ||
      d.deviceName.toLowerCase().includes(q) ||
      (d.lastIp ?? "").toLowerCase().includes(q) ||
      (d.city ?? "").toLowerCase().includes(q) ||
      (d.country ?? "").toLowerCase().includes(q));
    if (platform !== "all") list = list.filter((d) => d.platform === platform);
    if (status === "live") list = list.filter((d) => isLive(d.lastActiveAt) && !d.isRevoked);
    if (status === "blocked") list = list.filter((d) => d.isRevoked);
    return list;
  }, [data, search, platform, status]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{t("Devices & sessions")}</h1>
      <p className="mt-1 text-sm text-text-secondary">{t("Every device that has signed in, across all businesses. Live status, location, and remote control.")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search user, company, device, IP…")}
          className="w-72 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-text-primary outline-none focus:border-primary"
        />
        <Segmented
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[{ v: "all", l: t("All") }, { v: "live", l: t("Live") }, { v: "blocked", l: t("Blocked") }]}
        />
        <Segmented
          value={String(platform)}
          onChange={(v) => setPlatform(v === "all" ? "all" : (Number(v) as DevicePlatform))}
          options={[
            { v: "all", l: t("All platforms") },
            { v: String(DevicePlatform.Mobile), l: t("Mobile") },
            { v: String(DevicePlatform.Desktop), l: t("Desktop") },
            { v: String(DevicePlatform.Web), l: t("Web") },
          ]}
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-card border border-error/40 bg-error/5 p-4 text-sm text-error">
          {error instanceof Error ? error.message : t("Something went wrong.")}
        </div>
      ) : isLoading ? (
        <div className="mt-4 rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-3 font-semibold">{t("Device")}</th>
                <th className="px-4 py-3 font-semibold">{t("User / Company")}</th>
                <th className="px-4 py-3 font-semibold">{t("Last seen")}</th>
                <th className="px-4 py-3 font-semibold">{t("Location")}</th>
                <th className="px-4 py-3 font-semibold">{t("Status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const meta = platformMeta(d.platform);
                const live = isLive(d.lastActiveAt) && !d.isRevoked;
                return (
                  <tr key={d.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-text-primary">
                        <span>{meta.icon}</span>
                        <span className="truncate">{d.deviceName || meta.label}</span>
                      </div>
                      <div className="text-xs text-text-secondary">{meta.label}{d.appVersion ? ` · v${d.appVersion}` : ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{d.userName}</div>
                      <div className="text-xs text-text-secondary">{d.companyName ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{relativeTime(d.lastActiveAt)}</td>
                    <td className="px-4 py-3">
                      <div className="text-text-primary">{locationLabel(d.city, d.country, d.lastIp)}</div>
                      {d.city || d.country ? <div className="font-mono text-xs text-text-secondary">{d.lastIp ?? ""}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      {d.isRevoked ? (
                        <span className="rounded-full bg-error/10 px-2 py-0.5 text-xs font-semibold text-error">
                          {d.remoteWipeRequested ? t("Wipe pending") : t("Blocked")}
                        </span>
                      ) : live ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-success" /> {t("Live")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-text-secondary">{t("Offline")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {d.isRevoked ? (
                          <Button variant="ghost" loading={unblock.isPending && unblock.variables === d.id} onClick={() => unblock.mutate(d.id)} className="!px-3 !py-1.5 !text-xs">
                            {t("Unblock")}
                          </Button>
                        ) : (
                          <Button variant="ghost" loading={block.isPending && block.variables === d.id} onClick={() => block.mutate(d.id)} className="!px-3 !py-1.5 !text-xs">
                            {t("Block")}
                          </Button>
                        )}
                        <Button variant="danger" loading={wipe.isPending && wipe.variables === d.id} onClick={() => onWipe(d)} className="!px-3 !py-1.5 !text-xs">
                          {t("Wipe")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-text-secondary">{t("No devices match.")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div className="flex rounded-full bg-background p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${value === o.v ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
