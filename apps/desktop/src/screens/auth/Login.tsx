import { authApi } from "@stockflow/core/api/endpoints/auth";
import { ApiError } from "@stockflow/core/api/client";
import { DevicePlatform } from "@stockflow/core/api/enums";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { deviceName } from "@/platform";
import { resolveDefaultLocation } from "@/lib/session";
import { useAuthStore } from "@/lib/stores";

export function Login() {
  const navigate = useNavigate();
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
      const auth = await authApi.login({
        phone: phone.trim(),
        password,
        deviceId,
        deviceName,
        platform: DevicePlatform.Desktop,
      });
      useAuthStore.getState().setSession({
        token: auth.token,
        refreshToken: auth.refreshToken,
        expiresAt: auth.expiresAt,
        user: auth.user,
        companyId: auth.companyId,
      });
      if (auth.companyId) await resolveDefaultLocation(auth.companyId);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log in. Check the API is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Log in" subtitle="Enter your phone number and password.">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
        <Button type="submit" loading={loading} disabled={!phone || !password}>
          Log in
        </Button>
        <Button type="button" variant="ghost" onClick={() => navigate("/onboarding")}>
          Back
        </Button>
      </form>
    </AuthLayout>
  );
}
