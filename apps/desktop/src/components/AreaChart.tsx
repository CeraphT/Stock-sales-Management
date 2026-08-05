export interface AreaPoint {
  label: string;
  value: number;
}

/** Compact value formatter for on-chart labels (e.g. 12500 → "12.5k"). */
function fmt(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

/** Lightweight smooth SVG area chart (gradient fill under a curved line) with
 * the value printed above each point. The line/fill live in a
 * preserveAspectRatio="none" SVG (stretches to width); the dots and value
 * labels are HTML overlays positioned by percentage so text stays crisp and
 * undistorted. */
export function AreaChart({ points, height = 180 }: { points: AreaPoint[]; height?: number }) {
  const W = 600;
  const H = 180;
  const pad = 10;

  if (points.length === 0) {
    return <div className="flex items-center justify-center text-sm text-text-secondary" style={{ height }}>No data</div>;
  }

  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = (W - pad * 2) / Math.max(1, points.length - 1);
  const pts = points.map((p, i) => [pad + i * stepX, H - pad - (p.value / max) * (H - pad * 2)] as const);

  // Smooth cubic path through the points (control points at horizontal midpoints).
  let line = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    line += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  const area = `${line} L ${pts[pts.length - 1][0]} ${H - pad} L ${pts[0][0]} ${H - pad} Z`;

  // Percentage positions for the HTML overlay (label + dot per point).
  const overlay = points.map((p, i) => ({
    xPct: (pts[i][0] / W) * 100,
    yPct: (pts[i][1] / H) * 100,
    value: p.value,
    label: p.label,
  }));

  return (
    <div>
      <div className="relative" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--color-primary))" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(var(--color-primary))" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#areaFill)" />
          <path d={line} fill="none" stroke="rgb(var(--color-primary))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* HTML overlay: crisp dots + value labels (undistorted by the SVG stretch). */}
        {overlay.map((o, i) => (
          <div key={i} className="pointer-events-none absolute" style={{ left: `${o.xPct}%`, top: `${o.yPct}%`, transform: "translate(-50%, -50%)" }}>
            <div className="h-2 w-2 rounded-full border-2 border-primary bg-surface" />
            {o.value > 0 ? (
              <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-text-primary" style={{ bottom: "calc(100% + 3px)" }}>
                {fmt(o.value)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between">
        {points.map((p, i) => (
          <span key={i} className="text-[10px] text-text-secondary">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
