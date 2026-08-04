const inputCls =
  "h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-text-primary outline-none focus:border-primary";

/** A from/to date-picker pair. Values are YYYY-MM-DD strings ("" = unset). */
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        From
        <input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} className={inputCls} />
      </label>
      <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        To
        <input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} className={inputCls} />
      </label>
      {from || to ? (
        <button onClick={() => onChange("", "")} className="text-xs font-semibold text-text-secondary transition hover:text-error">
          Clear
        </button>
      ) : null}
    </div>
  );
}
