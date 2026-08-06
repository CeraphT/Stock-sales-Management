import { forwardRef, useState, type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, type = "text", className = "", ...rest },
  ref,
) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword && show ? "text" : type;

  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</span>
      ) : null}
      <div className="relative">
        <input
          ref={ref}
          type={effectiveType}
          className={`h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text-primary outline-none transition placeholder:text-text-secondary/60 focus:border-primary ${isPassword ? "pr-11" : ""} ${className}`}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-text-secondary"
            tabIndex={-1}
          >
            {show ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
    </label>
  );
});
