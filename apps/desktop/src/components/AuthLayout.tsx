import type { ReactNode } from "react";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: "linear-gradient(160deg, var(--color-primary), #312e81)" }}
    >
      <div className="w-full max-w-md rounded-card bg-surface p-8 shadow-2xl">
        <div className="mb-6">
          <div className="text-2xl font-extrabold tracking-tight text-primary">PharmaStock</div>
          <h1 className="mt-4 text-xl font-bold text-text-primary">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-text-secondary">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
