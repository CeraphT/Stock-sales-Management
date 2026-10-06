import type { ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { useLanguageStore } from "@/lib/stores";
import { AppVersion } from "@/components/AppVersion";

/**
 * Shared shell for the pre-login screens. Sits on the app's own mesh background
 * (from index.css) rather than a solid block, and presents a translucent glass
 * card + brand mark, so onboarding feels like part of the app. Includes the
 * FR/EN toggle so language can be picked before signing in.
 */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6">
      <button
        onClick={() => setLanguage(language === "fr" ? "en" : "fr")}
        className="absolute right-5 top-5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs font-bold text-text-secondary backdrop-blur transition hover:text-text-primary"
      >
        {language === "fr" ? "EN" : "FR"}
      </button>

      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <BrandLogo size={48} />
          <div>
            <div className="text-xl font-extrabold tracking-tight text-primary">StockFlow</div>
            <div className="text-xs text-text-secondary">Business management</div>
          </div>
        </div>

        <div className="card-in rounded-card border border-white/50 bg-surface/80 p-8 shadow-2xl backdrop-blur-xl">
          <h1 className="text-xl font-bold text-text-primary">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-text-secondary">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
        <AppVersion />
      </div>
    </div>
  );
}
