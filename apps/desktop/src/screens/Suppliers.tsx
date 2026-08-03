import { ApiError } from "@stockflow/core/api/client";
import { suppliersApi } from "@stockflow/core/api/endpoints/suppliers";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/stores";

interface Editing {
  id: string | null;
  name: string;
  phone: string;
  email: string;
}

const BLANK: Editing = { id: null, name: "", phone: "", email: "" };

export function Suppliers() {
  const companyId = useAuthStore((s) => s.companyId)!;
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: () => suppliersApi.list(companyId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["suppliers", companyId] });
  const onError = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong.");

  const saveM = useMutation({
    mutationFn: (e: Editing) => {
      const body = { name: e.name.trim(), contactPhone: e.phone.trim() || null, contactEmail: e.email.trim() || null };
      return e.id ? suppliersApi.update(companyId, e.id, body) : suppliersApi.create(companyId, body);
    },
    onSuccess: () => {
      setEditing(null);
      setError(null);
      invalidate();
    },
    onError,
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => suppliersApi.delete(companyId, id),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-text-secondary">{data.length} suppliers</span>
        {!editing ? <Button onClick={() => setEditing(BLANK)}>+ New supplier</Button> : null}
      </div>

      {editing ? (
        <div className="mb-4 space-y-3 rounded-card border border-border bg-surface p-5">
          <div className="text-sm font-bold text-text-primary">{editing.id ? "Edit supplier" : "New supplier"}</div>
          <TextField label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Phone" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <TextField label="Email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
          </div>
          {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setEditing(null); setError(null); }}>
              Cancel
            </Button>
            <Button onClick={() => saveM.mutate(editing)} loading={saveM.isPending} disabled={!editing.name.trim()}>
              Save
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {isLoading ? (
          <div className="p-10 text-center text-text-secondary">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-text-secondary">No suppliers yet.</div>
        ) : (
          data.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
              <div className="flex-1">
                <div className="font-medium text-text-primary">{s.name}</div>
                <div className="text-xs text-text-secondary">
                  {[s.contactPhone, s.contactEmail].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <button
                onClick={() => setEditing({ id: s.id, name: s.name, phone: s.contactPhone ?? "", email: s.contactEmail ?? "" })}
                className="text-sm font-semibold text-text-secondary hover:text-text-primary"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete supplier "${s.name}"?`)) deleteM.mutate(s.id);
                }}
                className="text-sm font-semibold text-text-secondary hover:text-error"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
