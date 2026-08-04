import type { ReactNode } from "react";

export type StatColor = "primary" | "green" | "amber" | "red" | "blue" | "orange" | "neutral";

// CSS variable + value text-color per tone. The badge background is set inline
// as rgb(var / alpha) so it doesn't depend on Tailwind generating a specific
// opacity utility (some new /NN values weren't being picked up by the JIT).
const TONES: Record<StatColor, { var: string; value: string }> = {
  primary: { var: "--color-primary", value: "text-text-primary" },
  green: { var: "--color-success", value: "text-success" },
  amber: { var: "--color-accent-amber", value: "text-accent-amber" },
  red: { var: "--color-error", value: "text-error" },
  blue: { var: "--color-accent-blue", value: "text-text-primary" },
  orange: { var: "--color-accent-orange", value: "text-accent-orange" },
  neutral: { var: "--color-text-secondary", value: "text-text-primary" },
};

export function StatCard({
  icon,
  label,
  value,
  color = "neutral",
  hint,
  index = 0,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color?: StatColor;
  hint?: string;
  index?: number;
}) {
  const t = TONES[color];
  return (
    <div
      className="card-in hover-lift rounded-card border border-border bg-surface p-4"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className="flex items-center gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg"
          style={{ backgroundColor: `rgb(var(${t.var}) / 0.15)` }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{label}</div>
          <div className={`truncate text-xl font-extrabold leading-tight ${t.value}`}>{value}</div>
          {hint ? <div className="truncate text-[11px] text-text-secondary">{hint}</div> : null}
        </div>
      </div>
    </div>
  );
}
