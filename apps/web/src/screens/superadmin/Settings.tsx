import { superAdminApi } from "@stockflow/core/api/endpoints/superAdmin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";

export function SuperAdminSettings() {
  const t = useT();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "backup-recipient"],
    queryFn: () => superAdminApi.getBackupRecipient(),
  });

  // Seed the field with the stored address once it loads.
  useEffect(() => {
    if (data?.email) setEmail(data.email);
  }, [data?.email]);

  const save = useMutation({
    mutationFn: () => superAdminApi.setBackupRecipient(email.trim()),
    onSuccess: (res) => {
      toast(t("Backup recipient updated"), "success");
      setEmail(res.email);
      void qc.invalidateQueries({ queryKey: ["superadmin", "backup-recipient"] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : t("Something went wrong."), "error"),
  });

  const trimmed = email.trim();
  const valid = trimmed.includes("@") && !trimmed.includes(" ");
  const changed = trimmed !== (data?.email ?? "");

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-text-primary">{t("Settings")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t("Platform-wide configuration.")}</p>
      </div>

      <div className="max-w-xl rounded-card border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-text-primary">{t("Daily backup report")}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {t("The e-mail address that receives the daily backup-status report for all apps. Leave as the default to use infos@mfspace.lu.")}
        </p>

        {isLoading ? (
          <div className="mt-4 text-sm text-text-secondary">{t("Loading…")}</div>
        ) : (
          <div className="mt-4">
            <TextField
              label={t("Recipient e-mail")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="infos@mfspace.lu"
            />
            <div className="mt-3">
              <Button
                loading={save.isPending}
                disabled={!valid || !changed}
                onClick={() => save.mutate()}
              >
                {t("Save")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
