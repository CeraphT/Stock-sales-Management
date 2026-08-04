import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

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
  to,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color?: StatColor;
  hint?: string;
  index?: number;
  to?: string;
}) {
  const t = TONES[color];
  const navigate = useNavigate();
  return (
    <div
      onClick={to ? () => navigate(to) : undefined}
      className={`card-in hover-lift rounded-card border border-border bg-surface p-4 ${to ? "cursor-pointer" : ""}`}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      {/* Icon on top, then label, then the value on its own full-width line so
          long amounts never get clipped or wrapped mid-column. */}
      <div className="grid h-9 w-9 place-items-center rounded-lg text-base" style={{ backgroundColor: `rgb(var(${t.var}) / 0.15)` }}>
        {icon}
      </div>
      <div className="mt-3 truncate text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{label}</div>
      <div className={`mt-0.5 text-xl font-extrabold leading-tight tabular-nums ${t.value}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-text-secondary">{hint}</div> : null}
    </div>
  );
}
