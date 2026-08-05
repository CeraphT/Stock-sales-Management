import { useEffect, useMemo, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

/** A select with a type-to-filter search box in the dropdown — for lists too
 * long to scroll (e.g. customers). Keyboard: type to filter, Esc to close.
 * `value === ""` selects the first option (treated as the "none" row). */
export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  invalid = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.sublabel ?? "").toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-full items-center justify-between rounded-xl border bg-background px-3 text-left text-sm text-text-primary outline-none focus:border-primary ${
          invalid ? "border-error" : "border-border"
        }`}
      >
        <span className="min-w-0 truncate">{selected ? selected.label : <span className="text-text-secondary">{placeholder}</span>}</span>
        <span className="ml-2 shrink-0 text-text-secondary">▾</span>
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="border-b border-border/60 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered[0]) {
                  onChange(filtered[0].value);
                  setOpen(false);
                  setQuery("");
                }
              }}
              placeholder="Type to search…"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-text-secondary">No matches.</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value || "__none"}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-background ${
                    o.value === value ? "font-semibold text-primary" : "text-text-primary"
                  }`}
                >
                  <span className="min-w-0 truncate">{o.label}</span>
                  {o.sublabel ? <span className="shrink-0 text-xs text-text-secondary">{o.sublabel}</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
