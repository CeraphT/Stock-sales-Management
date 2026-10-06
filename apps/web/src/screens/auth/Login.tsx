import { authApi } from "@stockflow/core/api/endpoints/auth";
import { membershipsApi } from "@stockflow/core/api/endpoints/memberships";
import { ApiError } from "@stockflow/core/api/client";
import { DevicePlatform, UserRole } from "@stockflow/core/api/enums";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { deviceName } from "@/platform";
import { useT } from "@/lib/i18n";
import { useImpersonation } from "@/lib/impersonation";
import { storeSession } from "@/lib/session";
import { useAuthStore } from "@/lib/stores";

type Mode = "login" | "register";

/** Simplified sign-in: phone + password, or create an account. Either way the
 * person lands on "My shops" to open, create or join a business. */
export function Login() {
  const navigate = useNavigate();
  const t = useT();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { deviceId } = useAuthStore.getState();
      const device = { deviceId, deviceName, platform: DevicePlatform.Web };
      const auth =
        mode === "login"
          ? await authApi.login({ phone: phone.trim(), password, accountOnly: true, ...device })
          : await membershipsApi.register({ name: name.trim(), phone: phone.trim(), password, ...device });
      // A fresh sign-in never inherits an old super-admin "inside a company" state.
      useImpersonation.getState().reset();
      storeSession(auth);
      // SuperAdmins have no shop of their own: they land on the cross-tenant console.
      navigate(auth.user.role === UserRole.SuperAdmin ? "/superadmin" : "/shops", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(t("Wrong phone number or password."));
      else setError(err instanceof ApiError ? err.message : t("Could not log in. Check your internet connection."));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = phone.trim().length >= 6 && password.length >= (mode === "register" ? 6 : 1) && (mode === "login" || name.trim());

  return (
    <AuthLayout
      title={mode === "login" ? t("Welcome back") : t("Create your account")}
      subtitle={mode === "login" ? t("Enter your phone number and password.") : t("One account for all your shops.")}
    >
      <div className="mb-5 grid grid-cols-2 rounded-full border border-border bg-background p-1 text-sm font-semibold" role="tablist">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-full py-2 transition ${mode === m ? "bg-primary text-white shadow" : "text-text-secondary hover:text-text-primary"}`}
          >
            {m === "login" ? t("Log in") : t("Create an account")}
          </button>
        ))}
      </div>

      <form className="flex flex-col gap-4" onSubmit={submit}>
        {mode === "register" ? (
          <TextField label={t("Your name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus />
        ) : null}
        <TextField
          label={t("Phone")}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          autoFocus={mode === "login"}
        />
        <TextField
          label={t("Password")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder={mode === "register" ? t("At least 6 characters") : undefined}
        />
        {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
        <Button type="submit" loading={loading} disabled={!canSubmit}>
          {mode === "login" ? t("Log in") : t("Create my account")}
        </Button>
      </form>
    </AuthLayout>
  );
}
