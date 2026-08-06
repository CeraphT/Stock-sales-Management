export interface Bar {
  label: string;
  value: number;
  /** CSS color (e.g. "rgb(var(--color-success))"). */
  color: string;
}

/** Simple horizontal-free vertical bar chart with the value printed above each
 * bar and the label below. Pure CSS/flex — no SVG scaling quirks, so text stays
 * crisp. Bars are sized relative to the largest value. */
export function BarChart({ bars, height = 150 }: { bars: Bar[]; height?: number }) {
  const max = Math.max(1, ...bars.map((b) => b.value));

  return (
    <div className="flex items-end justify-around gap-3" style={{ height }}>
      {bars.map((b) => {
        const pct = (b.value / max) * 100;
        return (
          <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-sm font-bold text-text-primary tabular-nums">{b.value}</span>
            <div
              className="w-full max-w-[56px] rounded-t-lg transition-[height] duration-500"
              style={{ height: `${Math.max(pct, 2)}%`, backgroundColor: b.color }}
            />
            <span className="text-center text-[11px] font-medium leading-tight text-text-secondary">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
