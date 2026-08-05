import { useNavigate } from "react-router-dom";

import { AuthLayout } from "@/components/AuthLayout";
import { useT } from "@/lib/i18n";

export function Onboarding() {
  const navigate = useNavigate();
  const t = useT();

  const actions = [
    { icon: "🔑", title: t("Log in"), desc: t("You already have an account."), to: "/login", primary: true },
    { icon: "🏢", title: t("Create a company"), desc: t("Set up a new business on StockFlow."), to: "/create-company" },
  ];

  return (
    <AuthLayout title={t("Welcome")} subtitle={t("Stock & sales management for your business.")}>
      <div className="flex flex-col gap-2.5">
        {actions.map((a) => (
          <button
            key={a.to}
            onClick={() => navigate(a.to)}
            className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${
              a.primary ? "border-primary bg-primary/10 hover:bg-primary/15" : "border-border hover:bg-background"
            }`}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-lg shadow-sm">{a.icon}</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-text-primary">{a.title}</span>
              <span className="block text-xs text-text-secondary">{a.desc}</span>
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={() => navigate("/join-company")}
        className="mt-4 w-full text-center text-xs font-semibold text-text-secondary transition hover:text-primary"
      >
        {t("Have an invite code? Look up your company")}
      </button>
    </AuthLayout>
  );
}
