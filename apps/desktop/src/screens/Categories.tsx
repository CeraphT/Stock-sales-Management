import { ApiError } from "@stockflow/core/api/client";
import { categoriesApi } from "@stockflow/core/api/endpoints/categories";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";

export function Categories() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["categories", companyId],
    queryFn: () => categoriesApi.list(companyId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["categories", companyId] });
  const onError = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong.");

  const createM = useMutation({
    mutationFn: () => categoriesApi.create(companyId, { name: name.trim() }),
    onSuccess: () => {
      setName("");
      setError(null);
      invalidate();
    },
    onError,
  });

  const renameM = useMutation({
    mutationFn: (id: string) => categoriesApi.update(companyId, id, { name: editValue.trim() }),
    onSuccess: () => {
      setEditId(null);
      setError(null);
      invalidate();
    },
    onError,
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(companyId, id),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
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
          placeholder="New category name…"
          className="h-11 flex-1 rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none focus:border-primary"
        />
        <Button onClick={() => createM.mutate()} loading={createM.isPending} disabled={!name.trim()}>
          Add
        </Button>
      </div>

      {error ? <p className="mb-3 text-sm font-medium text-error">{error}</p> : null}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {isLoading ? (
          <div className="p-10 text-center text-text-secondary">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-text-secondary">No categories yet.</div>
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
                  <button onClick={() => renameM.mutate(c.id)} className="text-sm font-semibold text-primary">
                    Save
                  </button>
                  <button onClick={() => setEditId(null)} className="text-sm text-text-secondary">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium text-text-primary">{c.name}</span>
                  <button
                    onClick={() => {
                      setEditId(c.id);
                      setEditValue(c.name);
                    }}
                    className="text-sm font-semibold text-text-secondary hover:text-text-primary"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete category "${c.name}"?`)) deleteM.mutate(c.id);
                    }}
                    className="text-sm font-semibold text-text-secondary hover:text-error"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
