import { ApiError } from "@stockflow/core/api/client";
import { CLAUDE_CONNECTOR_URL, mcpConnectionsApi } from "@stockflow/core/api/endpoints/mcpConnections";
import { UserRole } from "@stockflow/core/api/enums";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/Button";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";

const STEPS = [
  "In Claude, open Settings > Connectors.",
  "Click \"Add custom connector\", name it StockFlow and paste the address above.",
  "Click Connect, sign in with your StockFlow phone number and password, and choose this shop.",
  "In a new chat, turn StockFlow on in the connectors menu and ask your question.",
];

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
}

/** Claude connections: how to connect Claude (the read-only StockFlow connector)
 * to this shop, and the list of active connections with a Revoke button. A manager
 * sees everyone's connections; anyone else only their own. */
export function ClaudeConnections() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const role = useAuthStore((s) => s.user?.role);
  const isManager = role === UserRole.CompanyAdmin || role === UserRole.SuperAdmin;
  const t = useT();

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["mcp-connections", companyId],
    queryFn: () => mcpConnectionsApi.list(companyId),
  });

  const revokeM = useMutation({
    mutationFn: (id: string) => mcpConnectionsApi.revoke(companyId, id),
    onSuccess: () => {
      toast(t("Connection removed. Claude can no longer read this shop through it."), "success");
      void queryClient.invalidateQueries({ queryKey: ["mcp-connections", companyId] });
    },
    onError: (e: unknown) => toast(e instanceof ApiError ? e.message : t("Something went wrong."), "error"),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_CONNECTOR_URL);
      toast(t("Address copied."), "success");
    } catch {
      toast(t("Copy failed. Select the address and copy it by hand."), "error");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-card border border-border bg-surface p-5">
        <div className="mb-1 text-base font-bold text-text-primary">{t("Connect Claude to this shop")}</div>
        <p className="mb-4 text-sm text-text-secondary">
          {t("Ask Claude about your sales, stock, expiry dates, customer credit and purchase orders in plain language. The connection is read-only: Claude cannot change anything in StockFlow.")}
        </p>

        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Connector address")}</div>
        <div className="mb-4 flex items-center gap-2">
          <code className="min-w-0 flex-1 select-all truncate rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary">
            {CLAUDE_CONNECTOR_URL}
          </code>
          <Button variant="secondary" onClick={copy}>{t("Copy")}</Button>
        </div>

        <ol className="list-decimal space-y-1 pl-5 text-sm text-text-primary">
          {STEPS.map((s) => (
            <li key={s}>{t(s)}</li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-text-secondary">
          {t("Staff can connect too. Their access limits in Staff also apply in Claude.")}
        </p>
      </div>

      <div className="rounded-card border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="text-sm font-bold text-text-primary">{t("Active connections")}</div>
          {!isManager ? <span className="text-xs text-text-secondary">{t("You only see your own connections.")}</span> : null}
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-text-secondary">{t("Loading…")}</div>
        ) : isError ? (
          <div className="p-10 text-center text-text-secondary">{t("Could not load the connections. Check the internet connection and try again.")}</div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-text-secondary">{t("No connection to Claude yet.")}</div>
        ) : (
          data.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-lg">🤖</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-text-primary">
                  {c.clientName} · {c.userName}
                  {c.isMine ? <span className="ml-1 text-xs text-text-secondary">({t("you")})</span> : null}
                </div>
                <div className="truncate text-xs text-text-secondary">
                  {t("Connected on")} {when(c.createdAt)}
                  {c.lastUsedAt ? ` · ${t("Last used on")} ${when(c.lastUsedAt)}` : ""}
                </div>
              </div>
              <Button
                variant="ghost"
                loading={revokeM.isPending && revokeM.variables === c.id}
                onClick={async () => {
                  if (
                    await confirmDialog({
                      message: `${t("Remove the Claude connection of")} ${c.userName}? ${t("Claude will stop reading this shop at once. They can connect again later.")}`,
                      danger: true,
                      confirmLabel: t("Remove"),
                    })
                  )
                    revokeM.mutate(c.id);
                }}
              >
                {t("Remove")}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
