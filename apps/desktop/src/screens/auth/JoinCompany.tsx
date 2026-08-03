import { ApiError } from "@stockflow/core/api/client";
import { companiesApi } from "@stockflow/core/api/endpoints/companies";
import type { CompanyResponse } from "@stockflow/core/api/types/auth";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";

export function JoinCompany() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<CompanyResponse | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const company = await companiesApi.join({ uniqueCode: code.trim() });
      setFound(company);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not find that company.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Join a company" subtitle="Enter the invite code from your administrator.">
      {found ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">Company found</div>
            <div className="mt-1 text-lg font-bold text-text-primary">{found.name}</div>
            <div className="text-sm text-text-secondary">Code {found.uniqueCode}</div>
          </div>
          <p className="text-sm text-text-secondary">
            Log in with the phone number and password your administrator created for you.
          </p>
          <Button onClick={() => navigate("/login")}>Continue to log in</Button>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <TextField
            label="Invite code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PHRM-XXXXX"
            autoFocus
          />
          {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
          <Button type="submit" loading={loading} disabled={!code}>
            Find company
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate("/onboarding")}>
            Back
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
