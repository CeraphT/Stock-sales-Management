import type { StarterKitDraft } from "@stockflow/core/setup/starterKit";
import { useState } from "react";

import { useT } from "@/lib/i18n";

const chipCls = "inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-1 pl-3 pr-1.5 text-sm text-primary";

/** A list of names as removable chips plus an "add" field (Enter or +). */
export function EditableChips({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const t = useT();
  const [input, setInput] = useState("");
  function add() {
    const name = input.trim();
    if (!name) return;
    if (!values.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...values, name]);
    setInput("");
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <span key={v} className={chipCls}>
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full px-1 text-primary/70 hover:text-error" aria-label={t("Remove")}>
            ✕
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Enter adds the chip instead of submitting the wizard step.
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-8 w-40 rounded-full border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
        />
        <button type="button" onClick={add} disabled={!input.trim()} className="h-8 rounded-full border border-border px-3 text-sm font-semibold text-primary disabled:opacity-40">
          +
        </button>
      </span>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{children}</span>;
}

/** Last wizard step: what gets created with the shop, editable before creation. */
export function StarterKitSection({ draft, onChange, demoNames }: { draft: StarterKitDraft; onChange: (d: StarterKitDraft) => void; demoNames: string[] }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        {t("Created with your shop so you can start selling right away. Remove what you do not need or add your own. Everything stays editable afterwards.")}
      </p>
      <div>
        <Label>🗂️ {t("Categories")} ({draft.categories.length})</Label>
        <EditableChips values={draft.categories} onChange={(categories) => onChange({ ...draft, categories })} placeholder={t("Add a category")} />
      </div>
      <div>
        <Label>🧾 {t("Services")} ({draft.services.length})</Label>
        <EditableChips
          values={draft.services.map((s) => s.name)}
          onChange={(names) =>
            onChange({ ...draft, services: names.map((n) => draft.services.find((s) => s.name === n) ?? { name: n, category: null }) })
          }
          placeholder={t("Add a service")}
        />
        <p className="mt-1 text-xs text-text-secondary">{t("Services are created at price 0: set your prices in Services. Leave empty to keep the services module off.")}</p>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <label className="flex items-start gap-3 rounded-xl border border-border p-3">
          <input type="checkbox" checked={draft.defaultSupplier} onChange={(e) => onChange({ ...draft, defaultSupplier: e.target.checked })} className="mt-0.5 h-4 w-4" />
          <span>
            <span className="block text-sm font-semibold text-text-primary">🚚 {t("A \"Various supplier\" supplier")}</span>
            <span className="block text-xs text-text-secondary">{t("So your first products and stock receipts are never blocked by a missing supplier.")}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-border p-3">
          <input type="checkbox" checked={draft.demoProducts} onChange={(e) => onChange({ ...draft, demoProducts: e.target.checked })} className="mt-0.5 h-4 w-4" />
          <span>
            <span className="block text-sm font-semibold text-text-primary">🎁 {t("Sample products")} ({demoNames.length})</span>
            <span className="block text-xs text-text-secondary">
              {t("No stock, to try the app. Archive them when you are ready.")} {demoNames.join(", ")}
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
