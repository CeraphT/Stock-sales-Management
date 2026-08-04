export interface AreaPoint {
  label: string;
  value: number;
}

/** Lightweight smooth SVG area chart (gradient fill under a curved line).
 * preserveAspectRatio="none" lets it stretch to the container width. */
export function AreaChart({ points, height = 180 }: { points: AreaPoint[]; height?: number }) {
  const W = 600;
  const H = 180;
  const pad = 10;
  const gradId = "areaFill";

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

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--color-primary))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(var(--color-primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke="rgb(var(--color-primary))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.5" fill="rgb(var(--color-surface))" stroke="rgb(var(--color-primary))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between">
        {points.map((p) => (
          <span key={p.label} className="text-[10px] text-text-secondary">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
