/**
 * The StockFlow product mark (teal box + amber flow arrow). Source of truth is
 * branding/logo.svg, copied to public/favicon.svg — regenerate with
 * `node branding/generate.mjs` rather than editing the SVG by hand.
 */
export function BrandLogo({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/favicon.svg"
      alt="StockFlow"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ filter: "drop-shadow(0 6px 16px rgb(15 118 110 / 0.35))" }}
    />
  );
}
