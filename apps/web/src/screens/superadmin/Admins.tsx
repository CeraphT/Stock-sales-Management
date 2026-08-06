import { superAdminApi } from "@stockflow/core/api/endpoints/superAdmin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";
import { toast } from "@/lib/toast";

export function SuperAdminAdmins() {
  const t = useT();
  const qc = useQueryClient();
  const myId = useAuthStore((s) => s.user?.id);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "admins"],
    queryFn: () => superAdminApi.listAdmins(),
  });

  const create = useMutation({
    mutationFn: () => superAdminApi.createAdmin({ name: name.trim(), phone: phone.trim(), password }),
    onSuccess: () => {
      toast(t("Administrator created"), "success");
      setName("");
      setPhone("");
      setPassword("");
      setShowForm(false);
      void qc.invalidateQueries({ queryKey: ["superadmin", "admins"] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : t("Something went wrong."), "error"),
  });

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => superAdminApi.setAdminActive(id, active),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["superadmin", "admins"] }),
    onError: (e) => toast(e instanceof Error ? e.message : t("Something went wrong."), "error"),
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t("Administrators")}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t("People who can sign in to this super-admin console.")}</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? t("Cancel") : t("+ New administrator")}</Button>
      </div>

      {showForm ? (
        <div className="mb-5 rounded-card border border-border bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label={t("Name")} value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label={t("Phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
            <TextField label={t("Password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="mt-3">
            <Button
              loading={create.isPending}
              disabled={!name.trim() || !phone.trim() || password.length < 6}
              onClick={() => create.mutate()}
            >
              {t("Create administrator")}
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-text-secondary">{t("Loading…")}</div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-3 font-semibold">{t("Name")}</th>
                <th className="px-4 py-3 font-semibold">{t("Phone")}</th>
                <th className="px-4 py-3 font-semibold">{t("Status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((a) => {
                const isSelf = a.id === myId;
                return (
                  <tr key={a.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 font-semibold text-text-primary">
                      {a.name} {isSelf ? <span className="text-xs font-normal text-text-secondary">({t("you")})</span> : null}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{a.phone}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.active ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>
                        {a.active ? t("Active") : t("Inactive")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf ? null : (
                        <Button
                          variant={a.active ? "ghost" : "primary"}
                          loading={setActive.isPending && setActive.variables?.id === a.id}
                          onClick={() => setActive.mutate({ id: a.id, active: !a.active })}
                          className="!px-3 !py-1.5 !text-xs"
                        >
                          {a.active ? t("Deactivate") : t("Activate")}
                        </Button>
                      )}
                    </td>
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
