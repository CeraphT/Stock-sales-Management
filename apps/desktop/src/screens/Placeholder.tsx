import { useT } from "@/lib/i18n";

export function Placeholder({ title }: { title: string }) {
  const t = useT();
  return (
    <div className="mx-auto mt-10 max-w-2xl rounded-card border border-dashed border-border bg-surface p-10 text-center">
      <div className="text-4xl">🚧</div>
      <h2 className="mt-3 text-lg font-bold text-text-primary">{t(title)}</h2>
      <p className="mt-2 text-sm text-text-secondary">
        This screen is part of the desktop rebuild and isn't wired yet. The build order lives in
        <code className="mx-1 rounded bg-background px-1 py-0.5">docs/desktop-rebuild.md</code>.
      </p>
    </div>
  );
}
