import { ApiError } from "@stockflow/core/api/client";
import { companiesApi } from "@stockflow/core/api/endpoints/companies";
import { DevicePlatform } from "@stockflow/core/api/enums";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { deviceName } from "@/platform";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/lib/stores";

export function CreateCompany() {
  const navigate = useNavigate();
  const t = useT();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("XAF");
  const [adminName, setAdminName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { deviceId } = useAuthStore.getState();
      const res = await companiesApi.create({
        name: name.trim(),
        description: null,
        currency: currency.trim() || "XAF",
        adminName: adminName.trim(),
        adminPhone: adminPhone.trim(),
        adminPassword,
        deviceId,
        deviceName,
        platform: DevicePlatform.Desktop,
      });
      useAuthStore.getState().setSession({
        token: res.admin.token,
        refreshToken: res.admin.refreshToken,
        expiresAt: res.admin.expiresAt,
        user: res.admin.user,
        companyId: res.admin.companyId,
      });
      useAuthStore.getState().setLocation({
        locationId: res.defaultLocation.id,
        locationName: res.defaultLocation.name,
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not create the company. Check the API is running."));
    } finally {
      setLoading(false);
    }
  }

  const ready = name && adminName && adminPhone && adminPassword.length >= 6;

  return (
    <AuthLayout title={t("Create a company")} subtitle={t("You'll be the first administrator.")}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <TextField label={t("Company name")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <TextField label={t("Currency")} value={currency} onChange={(e) => setCurrency(e.target.value)} />
        <div className="my-1 border-t border-border" />
        <TextField label={t("Your name")} value={adminName} onChange={(e) => setAdminName(e.target.value)} />
        <TextField label={t("Your phone")} value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} />
        <TextField
          label={t("Password (min 6 chars)")}
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
        />
        {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
        <Button type="submit" loading={loading} disabled={!ready}>
          {t("Create company")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => navigate("/onboarding")}>
          {t("Back")}
        </Button>
      </form>
    </AuthLayout>
  );
}
