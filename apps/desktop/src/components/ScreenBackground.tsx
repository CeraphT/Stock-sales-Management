/** Blueprint texture behind the whole app — concentric rings + a crosshair and
 * diagonals through the center, echoing the mobile app's ScreenBackground (and
 * the construction lines behind the logo mark). Rendered once, fixed, behind all
 * content (the sidebar is opaque and covers its half; the glass cards let it
 * show through faintly). Stroke uses a theme token at low opacity so it stays a
 * whisper in both light and dark mode. */
const W = 1600;
const H = 1000;
const CX = W / 2;
const CY = H / 2;
const RING_STEP = 46;
const MAX_R = Math.hypot(CX, CY);

const rings: number[] = [];
for (let r = RING_STEP; r <= MAX_R; r += RING_STEP) rings.push(r);

export function ScreenBackground() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ color: "rgb(var(--color-text-secondary))", opacity: 0.06 }}
    >
      <line x1={CX} y1={0} x2={CX} y2={H} stroke="currentColor" strokeWidth={1} />
      <line x1={0} y1={CY} x2={W} y2={CY} stroke="currentColor" strokeWidth={1} />
      <line x1={CX - MAX_R} y1={CY - MAX_R} x2={CX + MAX_R} y2={CY + MAX_R} stroke="currentColor" strokeWidth={1} />
      <line x1={CX - MAX_R} y1={CY + MAX_R} x2={CX + MAX_R} y2={CY - MAX_R} stroke="currentColor" strokeWidth={1} />
      {rings.map((r) => (
        <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="currentColor" strokeWidth={1} />
      ))}
    </svg>
  );
}
