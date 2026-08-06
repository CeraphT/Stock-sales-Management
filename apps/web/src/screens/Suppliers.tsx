import { ApiError } from "@stockflow/core/api/client";
import { suppliersApi } from "@stockflow/core/api/endpoints/suppliers";
import type { SupplierResponse } from "@stockflow/core/api/types/catalog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { TextField } from "@/components/TextField";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";

interface Editing {
  id: string | null;
  name: string;
  phone: string;
  email: string;
}

const BLANK: Editing = { id: null, name: "", phone: "", email: "" };

export function Suppliers() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const t = useT();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewing, setViewing] = useState<SupplierResponse | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: () => suppliersApi.list(companyId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["suppliers", companyId] });
  const onError = (e: unknown) => toast(e instanceof ApiError ? e.message : "Something went wrong.", "error");

  const saveM = useMutation({
    mutationFn: (e: Editing) => {
      const body = { name: e.name.trim(), contactPhone: e.phone.trim() || null, contactEmail: e.email.trim() || null };
      return e.id ? suppliersApi.update(companyId, e.id, body) : suppliersApi.create(companyId, body);
    },
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
    onError,
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => suppliersApi.delete(companyId, id),
    onSuccess: () => invalidate(),
    onError,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-text-secondary">{data.length} {t("suppliers")}</span>
        {!editing ? <Button onClick={() => setEditing(BLANK)}>{t("+ New supplier")}</Button> : null}
      </div>

      {editing ? (
        <div className="mb-4 space-y-3 rounded-card border border-border bg-surface p-5">
          <div className="text-sm font-bold text-text-primary">{editing.id ? t("Edit supplier") : t("New supplier")}</div>
          <TextField label={t("Name")} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label={t("Phone")} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <TextField label={t("Email")} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => saveM.mutate(editing)} loading={saveM.isPending} disabled={!editing.name.trim()}>
              {t("Save")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {isLoading ? (
          <div className="p-10 text-center text-text-secondary">{t("Loading…")}</div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-text-secondary">{t("No suppliers yet.")}</div>
        ) : (
          data.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
              <button onClick={() => setViewing(s)} className="min-w-0 flex-1 text-left">
                <div className="font-medium text-text-primary hover:text-primary">{s.name}</div>
                <div className="truncate text-xs text-text-secondary">
                  {[s.contactPhone, s.contactEmail].filter(Boolean).join(" · ") || t("No contact details")}
                </div>
              </button>
              <IconButton icon="📇" label={t("View contact")} tone="primary" onClick={() => setViewing(s)} />
              <IconButton
                icon="✏️"
                label={t("Edit")}
                onClick={() => setEditing({ id: s.id, name: s.name, phone: s.contactPhone ?? "", email: s.contactEmail ?? "" })}
              />
              <IconButton
                icon="🗑️"
                label={t("Delete")}
                tone="danger"
                onClick={async () => {
                  if (await confirmDialog({ message: `${t("Delete supplier")} "${s.name}"?`, danger: true, confirmLabel: t("Delete") })) deleteM.mutate(s.id);
                }}
              />
            </div>
          ))
        )}
      </div>

      {viewing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setViewing(null)}>
          <div className="card-in w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">{t("Supplier")}</div>
            <div className="mb-4 text-lg font-bold text-text-primary">{viewing.name}</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-16 text-text-secondary">{t("Phone")}</span>
                {viewing.contactPhone ? (
                  <a href={`tel:${viewing.contactPhone}`} className="font-semibold text-primary">{viewing.contactPhone}</a>
                ) : (
                  <span className="text-text-secondary">{t("— not on file —")}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-text-secondary">{t("Email")}</span>
                {viewing.contactEmail ? (
                  <a href={`mailto:${viewing.contactEmail}`} className="font-semibold text-primary">{viewing.contactEmail}</a>
                ) : (
                  <span className="text-text-secondary">{t("— not on file —")}</span>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing({ id: viewing.id, name: viewing.name, phone: viewing.contactPhone ?? "", email: viewing.contactEmail ?? "" });
                  setViewing(null);
                }}
              >
                {t("Edit")}
              </Button>
              <Button variant="ghost" onClick={() => setViewing(null)}>{t("Close")}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
