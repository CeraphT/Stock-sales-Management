import type { ButtonHTMLAttributes } from "react";

type Tone = "neutral" | "primary" | "danger" | "success";

const TONE: Record<Tone, string> = {
  neutral: "text-text-secondary hover:bg-surface hover:text-text-primary",
  primary: "text-primary hover:bg-primary/10",
  danger: "text-error hover:bg-error/10",
  success: "text-success hover:bg-success/10",
};

/** Compact icon-only action button. `label` is required — it drives both the
 * hover tooltip and the accessible name, so an emoji-only control stays
 * usable/discoverable. Use in table rows and cards in place of text buttons. */
export function IconButton({
  icon,
  label,
  tone = "neutral",
  className = "",
  ...rest
}: {
  icon: string;
  label: string;
  tone?: Tone;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base transition disabled:opacity-40 ${TONE[tone]} ${className}`}
      {...rest}
    >
      <span aria-hidden>{icon}</span>
    </button>
  );
}
