import { useNavigate } from "react-router-dom";

import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/Button";

export function Onboarding() {
  const navigate = useNavigate();
  return (
    <AuthLayout title="Welcome" subtitle="Stock & sales management for your business.">
      <div className="flex flex-col gap-3">
        <Button onClick={() => navigate("/create-company")}>Create a company</Button>
        <Button variant="secondary" onClick={() => navigate("/join-company")}>
          Join a company
        </Button>
        <Button variant="ghost" onClick={() => navigate("/login")}>
          Log in
        </Button>
      </div>
    </AuthLayout>
  );
}
