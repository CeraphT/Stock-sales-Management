import { ApiError } from "@stockflow/core/api/client";
import { categoriesApi } from "@stockflow/core/api/endpoints/categories";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { confirmDialog } from "@/lib/confirm";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";

export function Categories() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const t = useT();
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["categories", companyId],
    queryFn: () => categoriesApi.list(companyId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["categories", companyId] });
  const onError = (e: unknown) => toast(e instanceof ApiError ? e.message : "Something went wrong.", "error");

  const createM = useMutation({
    mutationFn: () => categoriesApi.create(companyId, { name: name.trim() }),
    onSuccess: () => {
      setName("");
      invalidate();
    },
    onError,
  });

  const renameM = useMutation({
    mutationFn: (id: string) => categoriesApi.update(companyId, id, { name: editValue.trim() }),
    onSuccess: () => {
      setEditId(null);
      invalidate();
    },
    onError,
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(companyId, id),
    onSuccess: () => invalidate(),
    onError,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) createM.mutate();
          }}
          placeholder={t("New category name…")}
          className="h-11 flex-1 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
        />
        <Button onClick={() => createM.mutate()} loading={createM.isPending} disabled={!name.trim()}>
          {t("Add")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {isLoading ? (
          <div className="p-10 text-center text-text-secondary">{t("Loading…")}</div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-text-secondary">{t("No categories yet.")}</div>
        ) : (
          data.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
              {editId === c.id ? (
                <>
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none focus:border-primary"
                  />
                  <IconButton icon="✔️" label={t("Save")} tone="primary" onClick={() => renameM.mutate(c.id)} />
                  <IconButton icon="✕" label={t("Cancel")} onClick={() => setEditId(null)} />
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium text-text-primary">{c.name}</span>
                  <IconButton
                    icon="✏️"
                    label={t("Rename")}
                    onClick={() => {
                      setEditId(c.id);
                      setEditValue(c.name);
                    }}
                  />
                  <IconButton
                    icon="🗑️"
                    label={t("Delete")}
                    tone="danger"
                    onClick={async () => {
                      if (await confirmDialog({ message: `${t("Delete category")} "${c.name}"?`, danger: true, confirmLabel: t("Delete") })) deleteM.mutate(c.id);
                    }}
                  />
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
