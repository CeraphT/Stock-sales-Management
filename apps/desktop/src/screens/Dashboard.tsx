import { roleLabel } from "@/lib/labels";
import { useAuthStore } from "@/lib/stores";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function StatTile({ label }: { label: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="mt-2 text-2xl font-extrabold text-text-primary">—</div>
      <div className="mt-1 text-xs text-text-secondary">wired with the local DB</div>
    </div>
  );
}

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const locationName = useAuthStore((s) => s.locationName);
  const companyId = useAuthStore((s) => s.companyId);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-xl font-bold text-text-primary">Welcome{user ? `, ${user.name}` : ""}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          You're signed in{locationName ? ` at ${locationName}` : ""}. The desktop foundation is live — auth,
          the shell, theming, and the API client all work. Dashboard metrics, catalog, and POS arrive as the
          local DB and screens are wired (see <code>docs/desktop-rebuild.md</code>).
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Info label="User" value={user?.name ?? "—"} />
          <Info label="Role" value={roleLabel(user?.role)} />
          <Info label="Location" value={locationName ?? "—"} />
          <Info label="Company" value={companyId ?? "—"} />
        </dl>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Revenue today" />
        <StatTile label="Sales today" />
        <StatTile label="Low stock" />
        <StatTile label="Out of stock" />
      </div>
    </div>
  );
}
